import type { StateStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

// Un adaptador personalizado para Zustand que guarda en LocalStorage para velocidad extrema,
// y Sincroniza con Supabase en segundo plano para respaldar en la nube multi-dispositivo.
export const cloudStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        // 1. Carga instantánea del almacenamiento local (Ultra-Rápido)
        const localData = localStorage.getItem(name);

        // 2. Intentar traer de la nube de forma asíncrona (Silencioso)
        try {
            const { data, error } = await supabase
                .from('app_state')
                .select('data_json')
                .eq('id', 'erp_master_vault_v1')
                .single();

            if (!error && data?.data_json) {
                // Convertir de JSON de supabase a String para Zustand
                const cloudString = JSON.stringify(data.data_json);
                
                // Si la nube tiene algo diferente al disco duro local, sincronizamos:
                if (cloudString !== localData) {
                    console.log("☁️ Sincronizando datos frescos desde la nube...");
                    localStorage.setItem(name, cloudString);
                    return cloudString;
                }
            }
        } catch (e) {
            console.error("No se pudo conectar a la nube:", e);
        }

        // 3. Fallback: Si no hay nube o falló, usar los datos locales (Modo Offline)
        return localData;
    },

    setItem: async (name: string, value: string): Promise<void> => {
        // 1. Guardar de forma ultra-rápida y síncrona en el disco local
        localStorage.setItem(name, value);

        // 2. Empujar a la nube de Supabase en segundo plano sin bloquear el UI
        try {
            const parsedData = JSON.parse(value);
            supabase.from('app_state')
                .upsert({ id: 'erp_master_vault_v1', data_json: parsedData })
                .then(({ error }) => {
                    if (error) console.error("⚠️ Error respaldando en la nube:", error.message);
                });
        } catch (e) {
            console.error("Fallo al procesar datos para la nube", e);
        }
    },

    removeItem: async (name: string): Promise<void> => {
        localStorage.removeItem(name);
        try {
            await supabase.from('app_state').delete().eq('id', 'erp_master_vault_v1');
        } catch(e) {}
    }
};
