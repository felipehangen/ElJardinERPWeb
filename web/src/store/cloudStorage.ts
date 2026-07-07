import type { StateStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { computeDiferencia, DIFERENCIA_TOLERANCE, type BalanceState } from '../lib/balanceGuard';
import { auditInventoryAgainstLedger, totalDriftValue } from '../lib/inventoryLedger';

export const CLOUD_STORAGE_KEY = 'jardin-erp-storage-v4';

// ── Honest optimistic lock ──────────────────────────────────────────────────
// The write baseline (the cloud version a save is allowed to overwrite) must be
// tied to the STATE SNAPSHOT being saved, not to a module variable updated when
// data arrives from the network. A module-level "last seen cloud ts" lies during
// the sync window: forceRefreshFromCloud() has fetched a newer cloud copy (ts
// updated) but rehydrate() hasn't landed it in Zustand yet — a save fired in
// that window carries OLD in-memory state with a FRESH ts, passes the lock, and
// erases the other device's transactions (2026-07-07 incident: a physical-count
// tx vanished from the log this way and Diferencia opened by its exact amount).
//
// Fix: every hydrated snapshot carries `state._baseCloudTs` = the cloud version
// it actually incorporates (stamped by getItem/forceRefreshFromCloud at merge
// time, so it travels WITH the data into Zustand and back out on save).
// setItem's baseline = max(_baseCloudTs of the snapshot, lastSelfWrittenTs) —
// the latter covers our own successful writes, which by definition the current
// state supersedes. A save whose snapshot predates the cloud now loses the lock
// and aborts (the union-merge on the next sync recovers its transactions).
let lastSelfWrittenTs: string | undefined;

// Serialize cloud pushes: one check-then-write in flight at a time, so two
// saves can't interleave their conflict checks (and a queued save always sees
// lastSelfWrittenTs from the save before it).
let writeChain: Promise<void> = Promise.resolve();

type PersistedBlob = Record<string, any>;

// Later ISO-8601 timestamp of the two (they compare lexicographically).
function maxTs(a?: string, b?: string): string | undefined {
    if (!a) return b;
    if (!b) return a;
    return a > b ? a : b;
}

// Stamp the baseline into the blob's state so it survives hydration and comes
// back to setItem inside the snapshot itself.
function stampBaseCloudTs(blob: PersistedBlob, cloudTs?: string, prior?: PersistedBlob): PersistedBlob {
    if (!blob?.state) return blob;
    const base = maxTs(
        maxTs(blob.state._baseCloudTs as string | undefined, prior?.state?._baseCloudTs as string | undefined),
        cloudTs
    );
    if (!base) return blob;
    return { ...blob, state: { ...blob.state, _baseCloudTs: base } };
}

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
            const cloudTs = cloudData._savedAt as string | undefined;
            // Recover any transactions this client holds locally that the cloud
            // copy is missing (e.g. an entry whose save lost an optimistic-lock
            // conflict) instead of dropping them on a forced refresh.
            let localObj: PersistedBlob | undefined;
            try {
                const localRaw = localStorage.getItem(CLOUD_STORAGE_KEY);
                if (localRaw) {
                    localObj = JSON.parse(localRaw);
                    cloudData = mergeTransactionLogs(cloudData, localObj as PersistedBlob);
                }
            } catch { /* malformed local — fall back to cloud as-is */ }
            // The baseline travels INSIDE the snapshot: it only becomes the write
            // baseline once this data has actually rehydrated into the store.
            cloudData = stampBaseCloudTs(cloudData, cloudTs, localObj);
            localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(cloudData));
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

// Fallback usado cuando la RPC atómica no está disponible o la red falla.
// Antes de sobrescribir, re-consulta el _savedAt de la nube y compara contra el
// baseline DEL SNAPSHOT que se está guardando: si la nube es ESTRICTAMENTE más
// nueva, alguien escribió después de lo que este snapshot incorpora → abortamos
// para no pisarlo (misma semántica que el optimistic lock). El upsert se espera
// (await) para que la escritura termine antes de resolver setItem.
async function guardedDirectUpsert(parsedData: Record<string, unknown>, baseline: string | undefined): Promise<void> {
    try {
        const { data: current } = await supabase
            .from('app_state')
            .select('data_json')
            .eq('id', 'erp_master_vault_v1')
            .single();
        const cloudTs = (current?.data_json as Record<string, unknown> | undefined)?._savedAt as string | undefined;
        if (cloudTs && baseline && cloudTs > baseline) {
            console.warn('⚠️ Conflicto (fallback): la nube es más reciente que este snapshot. Abortando escritura.');
            window.dispatchEvent(new CustomEvent('erp-cloud-conflict'));
            return;
        }
    } catch {
        // No pudimos leer la nube (offline). Continuamos con el upsert: en modo
        // offline el upsert también fallará y se captura abajo; si hay red, escribimos.
    }
    // Sin conflicto → avanzamos lastSelfWrittenTs ANTES de que el upsert resuelva,
    // para que un setItem encadenado lleve un baseline no nulo (optimista, igual
    // que la ruta exitosa de la RPC). Si el upsert falla, solo registramos el error.
    lastSelfWrittenTs = parsedData._savedAt as string;
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
                    // Stamp the baseline INTO the snapshot being hydrated: after this
                    // merge the snapshot incorporates the cloud version, whichever
                    // side won. It becomes the write baseline only via the state
                    // itself (see setItem) — never via a side variable.
                    const merged = stampBaseCloudTs(mergeTransactionLogs(base, other), cloudTs, other);
                    const mergedString = JSON.stringify(merged);
                    if (cloudIsNewer) console.log('☁️ Datos más recientes en la nube. Sincronizando (merge de transacciones)...');
                    localStorage.setItem(name, mergedString);
                    return mergedString;
                }

                // No usable local copy → use cloud as-is.
                if (cloudTs) {
                    const cloudString = JSON.stringify(stampBaseCloudTs(cloudJson, cloudTs));
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

        // 1c. Balance guard: alarm (do NOT block) if the state about to be saved is
        // unbalanced. A non-zero Diferencia here is the fingerprint of a stale-array
        // merge/restore that desynced inventory from the transaction log. We still
        // save (blocking risks data loss and the write is not the corruptor), but we
        // surface it loudly so the user can force-sync before the drift propagates.
        try {
            const diff = computeDiferencia(appState as unknown as BalanceState);
            if (Math.abs(diff) >= DIFERENCIA_TOLERANCE) {
                console.error(`🚨 Guardando estado DESBALANCEADO — Diferencia por Conciliar: ₡${diff}. ` +
                    `Posible desincronización (otra pestaña/dispositivo o restauración). Sincroniza la nube y revisa Reportes.`);
                window.dispatchEvent(new CustomEvent('erp-balance-warning', { detail: diff }));
            } else {
                window.dispatchEvent(new CustomEvent('erp-balance-ok'));
            }
        } catch { /* guard is advisory — never let it break a save */ }

        // 1d. Inventory ledger audit (SHADOW): derive each item's expected stock
        // from the transaction log (anchored at its latest physical count) and
        // compare against the array being saved. Detects a stale-array merge
        // reverting counts/purchases — the two 2026 incidents — at save time.
        // Advisory only: alarms, never blocks or mutates.
        try {
            const drifts = auditInventoryAgainstLedger(
                (appState.transactions as any) ?? [],
                (appState.inventory as any) ?? [],
            );
            const total = totalDriftValue(drifts);
            if (total >= DIFERENCIA_TOLERANCE) {
                console.error(`🚨 Inventario desincronizado del log (₡${total}):`,
                    drifts.slice(0, 5).map(d => `${d.name}: array ${d.actualStock} vs ledger ${d.expectedStock}`));
                window.dispatchEvent(new CustomEvent('erp-inventory-drift', { detail: { total, drifts } }));
            }
        } catch { /* shadow audit — never let it break a save */ }

        // 2. Empujar a la nube — serializado (mutex) y con lock optimista HONESTO:
        // el baseline sale del snapshot que se está guardando (state._baseCloudTs,
        // estampado al hidratar) o de nuestra última escritura exitosa — nunca de
        // un timestamp que la capa de red vio pero el estado aún no incorporó.
        const pushToCloud = async (): Promise<void> => {
            const baseline = maxTs(appState._baseCloudTs as string | undefined, lastSelfWrittenTs);
            try {
                const { data: result, error } = await supabase.rpc('safe_save_app_state', {
                    p_data: parsedData,
                    p_last_known_ts: baseline ?? null
                });

                if (error) {
                    // RPC no disponible (ej. primera versión pre-migración) → fallback con guarda
                    console.warn('safe_save_app_state no disponible, usando upsert con guarda:', error.message);
                    await guardedDirectUpsert(parsedData, baseline);
                    return;
                }

                if (result?.conflict) {
                    // La nube tiene una versión que este snapshot NO incorpora (otro
                    // dispositivo/pestaña o un fix externo). Abortamos: el próximo sync
                    // trae esa versión y el union-merge recupera nuestras transacciones.
                    console.warn('⚠️ Conflicto: la nube es más reciente que este snapshot. Abortando escritura.');
                    window.dispatchEvent(new CustomEvent('erp-cloud-conflict'));
                    return;
                }

                // Escritura exitosa: nuestras escrituras posteriores parten de aquí.
                lastSelfWrittenTs = parsedData._savedAt as string;
            } catch {
                // Error de red en la RPC — fallback con guarda (re-chequea conflicto y espera)
                await guardedDirectUpsert(parsedData, baseline);
            }
        };

        // Mutex: encadenar tras la escritura anterior (pase o falle), para que dos
        // saves no intercalen sus check-then-write y el segundo vea lastSelfWrittenTs.
        const run = writeChain.then(pushToCloud, pushToCloud);
        writeChain = run.catch(() => { /* mantener la cadena viva */ });
        return run;
    },

    removeItem: async (name: string): Promise<void> => {
        localStorage.removeItem(name);
        try {
            await supabase.from('app_state').delete().eq('id', 'erp_master_vault_v1');
        } catch(e) { /* ignore */ }
    }
};
