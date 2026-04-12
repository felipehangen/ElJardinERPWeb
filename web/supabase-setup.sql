-- Copia este texto exactamente como está.
-- Pégalo en tu panel de Supabase en la sección "SQL Editor" -> "New Query"
-- Luego presiona el botón verde "Run" en la esquina inferior derecha.

-- 1. Crear la tabla que actuará como nuestro "Disco Duro en la Nube"
CREATE TABLE app_state (
    id TEXT PRIMARY KEY,
    data_json JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Habilitar la seguridad RLS (Row Level Security)
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;

-- 3. Crear regla: Permitir lectura a los usuarios de la App Web
CREATE POLICY "Permitir lectura publica" ON app_state
    FOR SELECT TO public
    USING (true);

-- 4. Crear regla: Permitir escritura a los usuarios de la App Web
CREATE POLICY "Permitir escritura publica" ON app_state
    FOR INSERT TO public
    WITH CHECK (true);

-- 5. Crear regla: Permitir actualizacion a los usuarios de la App Web
CREATE POLICY "Permitir actualizacion publica" ON app_state
    FOR UPDATE TO public
    USING (true)
    WITH CHECK (true);

-- ¡Listo! Si te dice "Success", entonces la base de datos está preparada.
