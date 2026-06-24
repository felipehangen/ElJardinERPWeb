import type { StateStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export const CLOUD_STORAGE_KEY = 'jardin-erp-storage-v4';

// Tracks the _savedAt of the last cloud state we read.
// Passed to safe_save_app_state() so the DB can detect if someone else
// (another tab, another device, or a manual SQL fix) updated the cloud
// between our last load and this save attempt.
let lastKnownCloudTs: string | undefined;

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
            const cloudData = data.data_json as Record<string, unknown>;
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
                const cloudJson = data.data_json as Record<string, unknown>;
                const cloudTs = cloudJson._savedAt as string | undefined;

                // Always record the cloud timestamp — even if we end up using
                // local — so setItem's conflict check has a valid baseline.
                lastKnownCloudTs = cloudTs;

                // Parse local timestamp (may not exist in old saves)
                let localTs: string | undefined;
                if (localRaw) {
                    try {
                        const parsed = JSON.parse(localRaw) as Record<string, unknown>;
                        localTs = parsed._savedAt as string | undefined;
                    } catch { /* malformed local — treat as absent */ }
                }

                // Only trust the cloud copy when it is STRICTLY newer than local.
                // If local has no timestamp (legacy save) and cloud does → cloud wins.
                // If cloud has no timestamp → ignore (pre-timestamp cloud save).
                if (cloudTs && (!localTs || cloudTs > localTs)) {
                    console.log('☁️ Datos más recientes encontrados en la nube. Sincronizando...');
                    const cloudString = JSON.stringify(cloudJson);
                    localStorage.setItem(name, cloudString);
                    return cloudString;
                }
                // Local is same age or newer — keep it.
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
