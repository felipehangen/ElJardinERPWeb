import type { StateStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export const CLOUD_STORAGE_KEY = 'jardin-erp-storage-v4';

// Tracks the _savedAt of the last cloud state we read.
// Passed to safe_save_app_state() so the DB can detect if someone else
// (another tab, another device, or a manual SQL fix) updated the cloud
// between our last load and this save attempt.
let lastKnownCloudTs: string | undefined;

type PersistedBlob = Record<string, any>;

// Union-merge the transaction logs of two persisted blobs by transaction id.
//
// Cloud sync stores the whole state as one document, so a plain last-write-wins
// overwrite can DROP transactions entered concurrently on another tab/device.
// This merges so no transaction is lost: `base` provides all non-transaction
// state (pass the blob that should win for accounts/catalogs — normally the
// newer one), and any transaction present in `other` but missing from `base` is
// added. For an id in both copies, the version that has progressed to VOIDED /
// carries a voidingTxId wins (voiding is forward-only). Derived fields
// (cash/inventario/patrimonio) are recomputed by reconcile() afterwards.
//
// NOTE: union-by-id has no tombstones, so a transaction HARD-DELETED from one
// copy can be resurrected from a stale other copy. Removal in this app is done
// by VOIDING (a mutation this merge handles correctly), never deletion — do not
// hard-delete transaction rows while clients may still hold stale copies.
export function mergeTransactionLogs(base: PersistedBlob, other: PersistedBlob): PersistedBlob {
    const baseTxs = base?.state?.transactions;
    const otherTxs = other?.state?.transactions;
    if (!Array.isArray(baseTxs) || !Array.isArray(otherTxs)) return base;

    const isVoided = (t: any) => t?.status === 'VOIDED' || !!t?.voidingTxId;
    // Deprecated equity "plug" correctivos (isCorrectivo without isReconciliation)
    // were hard-deleted in the 2026-06 cleanup. Because union-by-id has no
    // tombstones, a client with stale localStorage would otherwise resurrect them
    // and reopen Diferencia. They are deprecated for good, so we drop them from any
    // merge result. The single legitimate reconciliation entry carries
    // isReconciliation:true and is NOT affected.
    const isDeprecatedPlug = (t: any) =>
        t?.details?.isCorrectivo === true && t?.details?.isReconciliation !== true;
    const byId = new Map<string, any>();
    for (const t of baseTxs) if (t?.id) byId.set(t.id, t);
    for (const t of otherTxs) {
        if (!t?.id) continue;
        const existing = byId.get(t.id);
        if (!existing) { byId.set(t.id, t); continue; }
        if (isVoided(t) && !isVoided(existing)) byId.set(t.id, t); // keep the voided version
    }
    const merged = Array.from(byId.values())
        .filter(t => !isDeprecatedPlug(t))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return { ...base, state: { ...base.state, transactions: merged } };
}

// Force-fetches from Supabase, bypassing the _savedAt timestamp guard.
// Writes result to localStorage so the next rehydrate() picks it up.
// Returns true if the cloud data was successfully fetched and stored.
export async function forceRefreshFromCloud(): Promise<boolean> {
    try {
        const { data, error } = await supabase
            .from('app_state')
            .select('data_json')
            .eq('id', 'erp_master_vault_v1')
            .single();

        if (!error && data?.data_json) {
            let cloudData = data.data_json as Record<string, any>;
            // Recover any transactions this client holds locally that the cloud
            // copy is missing (e.g. an entry whose save lost an optimistic-lock
            // conflict) instead of dropping them on a forced refresh.
            try {
                const localRaw = localStorage.getItem(CLOUD_STORAGE_KEY);
                if (localRaw) cloudData = mergeTransactionLogs(cloudData, JSON.parse(localRaw));
            } catch { /* malformed local — fall back to cloud as-is */ }
            lastKnownCloudTs = cloudData._savedAt as string | undefined;
            localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(cloudData));
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

// Fallback usado cuando la RPC atómica no está disponible o la red falla.
// Antes de sobrescribir, re-consulta el _savedAt de la nube y compara contra
// lastKnownCloudTs: si la nube es ESTRICTAMENTE más nueva, alguien la corrigió
// desde nuestra última carga → abortamos para no pisar la corrección (misma
// semántica que el optimistic lock). El upsert se espera (await) para que la
// escritura termine antes de resolver setItem.
async function guardedDirectUpsert(parsedData: Record<string, unknown>): Promise<void> {
    try {
        const { data: current } = await supabase
            .from('app_state')
            .select('data_json')
            .eq('id', 'erp_master_vault_v1')
            .single();
        const cloudTs = (current?.data_json as Record<string, unknown> | undefined)?._savedAt as string | undefined;
        if (cloudTs && lastKnownCloudTs && cloudTs > lastKnownCloudTs) {
            console.warn('⚠️ Conflicto (fallback): la nube es más reciente. Abortando escritura.');
            lastKnownCloudTs = cloudTs;
            window.dispatchEvent(new CustomEvent('erp-cloud-conflict'));
            return;
        }
    } catch {
        // No pudimos leer la nube (offline). Continuamos con el upsert: en modo
        // offline el upsert también fallará y se captura abajo; si hay red, escribimos.
    }
    // Sin conflicto → avanzamos el baseline ANTES de que el upsert resuelva, para que
    // un setItem encadenado lleve un p_last_known_ts no nulo (optimista, igual que la
    // ruta exitosa de la RPC). Si el upsert falla, solo registramos el error.
    lastKnownCloudTs = parsedData._savedAt as string;
    const { error } = await supabase
        .from('app_state')
        .upsert({ id: 'erp_master_vault_v1', data_json: parsedData });
    if (error) {
        console.error('⚠️ Error respaldando en la nube:', error.message);
    }
}

// Un adaptador personalizado para Zustand que guarda en LocalStorage para velocidad extrema,
// y Sincroniza con Supabase en segundo plano para respaldar en la nube multi-dispositivo.
//
// TIMESTAMP GUARD: every save embeds a `_savedAt` ISO timestamp.
// getItem compares local vs cloud timestamps and only overwrites local when
// the cloud copy is strictly newer — preventing stale cloud data from
// silently overwriting fresher local state after a network failure.
//
// OPTIMISTIC LOCK: setItem calls safe_save_app_state() RPC which atomically
// checks whether the cloud was updated by an external source (SQL fix, another
// device) since our last load. On conflict it fires 'erp-cloud-conflict' and
// aborts the write, so we never silently overwrite a server-side correction.
export const cloudStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        // 1. Carga instantánea del almacenamiento local (Ultra-Rápido)
        const localRaw = localStorage.getItem(name);

        // 2. Intentar traer de la nube de forma asíncrona (Silencioso)
        try {
            const TIMEOUT_MS = 8000;
            const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
                setTimeout(() => resolve({ data: null, error: new Error('Supabase timeout') }), TIMEOUT_MS)
            );
            const queryPromise = supabase
                .from('app_state')
                .select('data_json')
                .eq('id', 'erp_master_vault_v1')
                .single();
            const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

            if (!error && data?.data_json) {
                const cloudJson = data.data_json as Record<string, any>;
                const cloudTs = cloudJson._savedAt as string | undefined;

                // Always record the cloud timestamp — even if we end up using
                // local — so setItem's conflict check has a valid baseline.
                lastKnownCloudTs = cloudTs;

                // Parse local copy (may not exist / may be malformed in old saves)
                let localObj: Record<string, any> | undefined;
                let localTs: string | undefined;
                if (localRaw) {
                    try {
                        localObj = JSON.parse(localRaw);
                        localTs = localObj?._savedAt as string | undefined;
                    } catch { /* malformed local — treat as absent */ }
                }

                if (localObj) {
                    // The strictly-newer blob (default cloud) wins for non-transaction
                    // state; then UNION both transaction logs so neither side's entries
                    // are lost to last-write-wins. Derived fields are recomputed by
                    // reconcile() on rehydrate, so stale accounts in `base` self-correct.
                    const cloudIsNewer = !!cloudTs && (!localTs || cloudTs > localTs);
                    const base = cloudIsNewer ? cloudJson : localObj;
                    const other = cloudIsNewer ? localObj : cloudJson;
                    const mergedString = JSON.stringify(mergeTransactionLogs(base, other));
                    if (cloudIsNewer) console.log('☁️ Datos más recientes en la nube. Sincronizando (merge de transacciones)...');
                    localStorage.setItem(name, mergedString);
                    return mergedString;
                }

                // No usable local copy → use cloud as-is.
                if (cloudTs) {
                    const cloudString = JSON.stringify(cloudJson);
                    localStorage.setItem(name, cloudString);
                    return cloudString;
                }
            }
        } catch (e) {
            console.error('No se pudo conectar a la nube:', e);
        }

        // 3. Fallback: Si no hay nube o falló, usar los datos locales (Modo Offline)
        return localRaw;
    },

    setItem: async (name: string, value: string): Promise<void> => {
        // Inject a save timestamp so future getItem calls can resolve conflicts.
        let parsedData: Record<string, unknown>;
        try {
            parsedData = JSON.parse(value) as Record<string, unknown>;
        } catch {
            // Malformed JSON — save as-is without timestamp injection.
            localStorage.setItem(name, value);
            return;
        }
        parsedData._savedAt = new Date().toISOString();
        const withTimestamp = JSON.stringify(parsedData);

        // 1. Guardar de forma ultra-rápida y síncrona en el disco local
        localStorage.setItem(name, withTimestamp);

        // 1b. Guard: si el estado no está inicializado, no escribir en la nube.
        // Zustand llama setItem con el estado inicial (initialized: false) antes de
        // que getItem termine de hidratar desde Supabase. Sin este guard, esa
        // escritura vacía sobrescribiría los datos de producción en la nube.
        const appState = parsedData?.state as Record<string, unknown> | undefined;
        if (!appState?.initialized) {
            console.warn('⚠️ setItem: estado no inicializado — omitiendo escritura a la nube');
            return;
        }

        // 2. Empujar a la nube via RPC atómica con check de concurrencia optimista
        try {
            const { data: result, error } = await supabase.rpc('safe_save_app_state', {
                p_data: parsedData,
                p_last_known_ts: lastKnownCloudTs ?? null
            });

            if (error) {
                // RPC no disponible (ej. primera versión pre-migración) → fallback con guarda
                console.warn('safe_save_app_state no disponible, usando upsert con guarda:', error.message);
                await guardedDirectUpsert(parsedData);
                return;
            }

            if (result?.conflict) {
                // La nube fue actualizada externamente (SQL fix, otro dispositivo) desde
                // nuestra última carga. Abortamos la escritura para no pisar la corrección.
                console.warn('⚠️ Conflicto: la nube fue actualizada externamente. Abortando escritura.');
                lastKnownCloudTs = result.cloud_ts as string | undefined;
                window.dispatchEvent(new CustomEvent('erp-cloud-conflict'));
                return;
            }

            // Escritura exitosa
            lastKnownCloudTs = parsedData._savedAt as string;
        } catch {
            // Error de red en la RPC — fallback con guarda (re-chequea conflicto y espera)
            await guardedDirectUpsert(parsedData);
        }
    },

    removeItem: async (name: string): Promise<void> => {
        localStorage.removeItem(name);
        try {
            await supabase.from('app_state').delete().eq('id', 'erp_master_vault_v1');
        } catch(e) { /* ignore */ }
    }
};
