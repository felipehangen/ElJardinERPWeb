import type { StateStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

export const CLOUD_STORAGE_KEY = 'jardin-erp-storage-v4';

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
            localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(data.data_json));
            return true;
        }
        return false;
    } catch {
        return false;
    }
}

// Un adaptador personalizado para Zustand que guarda en LocalStorage para velocidad extrema,
// y Sincroniza con Supabase en segundo plano para respaldar en la nube multi-dispositivo.
//
// TIMESTAMP GUARD: every save embeds a `_savedAt` ISO timestamp.
// getItem compares local vs cloud timestamps and only overwrites local when
// the cloud copy is strictly newer — preventing stale cloud data from
// silently overwriting fresher local state after a network failure.
export const cloudStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        // 1. Carga instantánea del almacenamiento local (Ultra-Rápido)
        const localRaw = localStorage.getItem(name);

        // 2. Intentar traer de la nube de forma asíncrona (Silencioso)
        try {
            const { data, error } = await supabase
                .from('app_state')
                .select('data_json')
                .eq('id', 'erp_master_vault_v1')
                .single();

            if (!error && data?.data_json) {
                const cloudJson = data.data_json as Record<string, unknown>;
                const cloudTs = cloudJson._savedAt as string | undefined;

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

        // 2. Empujar a la nube de Supabase en segundo plano sin bloquear el UI
        supabase.from('app_state')
            .upsert({ id: 'erp_master_vault_v1', data_json: parsedData })
            .then(({ error }) => {
                if (error) console.error('⚠️ Error respaldando en la nube:', error.message);
            });
    },

    removeItem: async (name: string): Promise<void> => {
        localStorage.removeItem(name);
        try {
            await supabase.from('app_state').delete().eq('id', 'erp_master_vault_v1');
        } catch(e) { /* ignore */ }
    }
};
