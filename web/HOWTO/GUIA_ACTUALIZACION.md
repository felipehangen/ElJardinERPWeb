# Guía de Actualización y Migración de Versiones (El Jardín ERP)

Esta guía explica paso a paso el protocolo a seguir cuando necesitas enviarle a la Soda "El Jardín" una **nueva versión** del sistema ERP (.dmg), garantizando que su historial contable y base de datos actual (creada en una versión anterior) migren sin errores.

---

## 🔒 1. Preparación y Respaldo Previo (Crucial)

Antes de instalar cualquier actualización en la computadora de la Soda, **es obligatorio extraer un respaldo manual**.

1. Abre la versión *anticuada* que está usando actualmente la soda.
2. Ve a la sección **Ajustes** en el menú principal.
3. Haz clic en el botón **"Descargar Respaldo"**.
4. Se generará un archivo `.json` (ej: `jardin-erp-backup-2026-03-01.json`). 
5. Guarda este archivo en una llave maya (USB) o envíatelo por correo. Esta es nuestra "red de seguridad".

*Nota Técnica:* Si abres este `.json` en un editor de texto, veras todo el arbol de la base de datos (Zustand State). A partir de la versión 1, el motor interno de Zustand inyecta automáticamente metadatos en su almacenamiento local, sin embargo el archivo descargado desde Ajustes incluye la radiografía cruda del estado ('state') en ese instante para ser reinstertada en caso de emergencia.

---

## 🚀 2. Instalación de la Nueva Versión

1. Asegúrate de que la aplicación "El Jardín ERP" esté **completamente cerrada** (Comprueba que no esté el punto en el Dock, si está, haz click derecho -> Salir).
2. Pídele al usuario que ejecute el nuevo archivo `El Jardin ERP.dmg` que le enviaste.
3. Arrastra el nuevo logo hacia la carpeta "Applications" (Aplicaciones). 
4. Si la Mac pregunta: *"Ya existe un elemento con el mismo nombre. ¿Deseas reemplazarlo?"*, haz clic en **Reemplazar**.

---

## ⚡ 3. La Magia de la Migración Automática

Al abrir la **nueva versión** recién instalada:

1. El sistema de persistencia (Zustand) leerá silenciosamente el historial que la Mac guardó en su caché profundo (`localStorage`).
2. Detectará que los datos están en `version: 1` (o la versión anterior).
3. Notará que la nueva app requiere `version: 2`.
4. Ejecutará automáticamente las reglas de compatibilidad (la función `migrate` que definimos en código) en milisegundos.
5. Inyectará los nuevos campos o transformará la contabilidad antigua **sin que el usuario note absolutamente nada**.

**Resultado:** El usuario entra, ve sus ventas y su inventario de siempre, pero con las nuevas funciones disponibles (ej: un nuevo campo de observaciones en el recibo).

---

## 🚨 4. Protocolo de Emergencia (Si algo falla)

Solo si al abrir la nueva aplicación la pantalla queda en blanco o el inventario desaparece (signo de que hubo una corrupción grave en la migración del caché de Mac):

1. Ve inmediatamente a **Ajustes**.
2. Haz clic en **"Restaurar desde archivo"** (Botón con logo de carpeta).
3. Selecciona el archivo `.json` que guardamos en el Paso 1.
4. El sistema preguntará si deseas sobrescribir. Acepta.
5. La app absorberá los datos antiguos, y como está corriendo en el código nuevo, los forzará a entrar en la nueva estructura inmediatamente.

---

## 👨‍💻 5. Nota para Desarrolladores

Para que este proceso fluya maravillosamente, **cada vez que programes un cambio estructural en los datos del ERP** (por ejemplo, agregarle un campo de "Categoría" a los Artículos de Venta), DEBES incrementar la `version` en `web/src/store/useStore.ts` de la app y programar la función de migración ANTES de empaquetar el `.dmg`. 

Existe un archivo `.cursorrules` en este proyecto que te recordará/obligará a hacer esto cada vez que modifiques archivos de tipos de datos.

---

## 🤖 6. Prompt para Gemini (Copiar y Pegar)

Cuando le pidas a Gemini (o cualquier otro asistente) que construya una nueva funcionalidad que altere la base de datos o el modelo de los datos en `types/index.ts`, adjunta este prompt exacto a tu mensaje de petición para asegurarte de que haga la migración estructural correctamente:

```text
Por favor, asegúrate de que al solicitar o aplicar estos cambios al código, sigamos nuestra regla obligatoria de Versionamiento y Migración de Base de Datos para Zustand ('useStore.ts').

Dado que vamos a modificar o agregar propiedades al estado modelo o a los "Tipos" (types.ts), es IMPERATIVO hacer lo siguiente:
1. Ir a `web/src/store/useStore.ts`.
2. Incrementar la propiedad `version` dentro del objeto options de persist() en +1.
3. Crear un bloque `if (version === X)` dentro de la función `migrate`.
4. Escribir allí explícitamente el código para transformar/mutar la estructura de datos anterior a la nueva agregando los valores por defecto (evitando pérdida de datos de los usuarios instalados).
5. Explicarme brevemente cómo funcionará esta migración cuando construyamos el nuevo .dmg de esta versión.
```
