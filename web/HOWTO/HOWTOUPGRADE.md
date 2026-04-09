# Cómo Actualizar: El Jardín ERP v1.0.0 → v1.0.1

Esta guía explica paso a paso cómo instalar la nueva versión **1.0.1** en una Mac que ya tiene la versión **1.0.0** funcionando, sin perder ningún dato.

> **¿Es seguro actualizar?**  
> Sí. Todos los cambios en v1.0.1 son **aditivos** — se agregan campos nuevos, pero ningún dato anterior se borra ni se modifica. Tu inventario, productos, proveedores, transacciones y cuentas se mantienen intactos.

---

## 🔒 Paso 1 — Haz un Respaldo (Obligatorio)

Antes de instalar cualquier cosa, guarda una copia de tus datos actuales.

1. Abre **El Jardín ERP** (la versión 1.0.0 que ya tiene instalada).
2. Ve a **Ajustes** en el menú principal.
3. Haz clic en **"Descargar Respaldo"**.
4. Guarda el archivo `.json` que se descarga (ejemplo: `jardin-erp-backup-2026-03-09.json`) en una memoria USB o envíatelo por correo electrónico.

> 🛑 **No saltes este paso.** Si algo sale mal, este archivo es lo que permite recuperar todo.

---

## 💿 Paso 2 — Instala la Nueva Versión

1. Cierra completamente **El Jardín ERP**:
   - Si ves el ícono en el Dock con un punto abajo, haz **clic derecho → Salir**.
2. Abre el archivo **`El Jardin ERP-1.0.1-arm64.dmg`** que te enviaron.
3. Arrastra el ícono de **El Jardín ERP** a la carpeta **Aplicaciones**.
4. Si aparece el mensaje *"Ya existe un elemento con el mismo nombre. ¿Deseas reemplazarlo?"*, haz clic en **Reemplazar**.
5. Expulsa el DMG (arrastra el disco al Papelero o haz clic derecho → Expulsar).

---

## ▶️ Paso 3 — Abre la Nueva Versión

1. Ve a **Aplicaciones** y abre **El Jardín ERP**.
2. La aplicación cargará todos tus datos automáticamente desde el caché de tu Mac.
3. **No necesitas hacer nada más.** Los nuevos campos de la v1.0.1 se activarán solos en segundo plano.

Verifica que tus datos estén correctos: inventario, productos, proveedores y el historial de transacciones deben verse igual que antes.

---

## ✨ ¿Qué hay de nuevo en v1.0.1?

| Área | Novedad |
|---|---|
| **Inventario** | Control de lotes FIFO — cada compra se rastrea por separado para calcular el costo exacto de lo vendido |
| **Catálogos** | Posibilidad de ocultar artículos sin borrarlos (inventario, productos, proveedores, tipos de gasto) |
| **Activos Fijos** | Ahora se registra la cantidad de cada activo, no solo su valor total |
| **Transacciones** | Nuevo estado ACTIVO / ANULADO y soporte para reversiones vinculas |

Todos los artículos, productos y transacciones anteriores siguen funcionando normalmente.

---

## 🚨 Paso 4 — Si Algo Falla (Protocolo de Emergencia)

Si al abrir la nueva versión la pantalla queda en blanco o desaparece información:

1. Ve a **Ajustes**.
2. Haz clic en **"Restaurar desde archivo"** (ícono de carpeta).
3. Selecciona el archivo `.json` que guardaste en el Paso 1.
4. Confirma la restauración.
5. La aplicación restablecerá todos tus datos inmediatamente.

Si el problema persiste, comunícate con el desarrollador y tenle a la mano el archivo `.json` del respaldo.
