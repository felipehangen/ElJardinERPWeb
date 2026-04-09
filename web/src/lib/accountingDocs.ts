export const getAccountingDocumentation = () => {
    return {
        _meta: {
            fecha_generacion: new Date().toISOString(),
            descripcion: "Documentación oficial de la estructura y mecánicas contables del sistema El Jardín ERP."
        },
        estructura_cuentas: {
            activos: {
                definicion: "Recursos controlados por la empresa como resultado de eventos pasados, de los que se esperan beneficios económicos futuros.",
                cuentas: [
                    { nombre: "Caja Chica", tipo: "Efectivo", naturaleza: "Deudora" },
                    { nombre: "Bancos", tipo: "Efectivo", naturaleza: "Deudora" },
                    { nombre: "Inventario", tipo: "Activo Circulante", naturaleza: "Deudora", nota: "Valuado mediante el método de Costo Promedio y descargado vía FIFO. Bajo el sistema de Inventario Periódico, no se descarga automáticamente en cada venta, sino mediante Tomas Físicas u operaciones de Producción." },
                    { nombre: "Activo Fijo", tipo: "Activo No Circulante", naturaleza: "Deudora", nota: "Mobiliario, equipo, remodelaciones." }
                ]
            },
            pasivos: {
                definicion: "Obligaciones presentes de la empresa, surgidas de eventos pasados, al vencimiento de las cuales espera desprenderse de recursos.",
                cuentas: [
                    { nombre: "Cuentas por Pagar", tipo: "Pasivo Circulante", naturaleza: "Acreedora", nota: "Pre-configurado para futuras integraciones." }
                ]
            },
            patrimonio: {
                definicion: "La parte residual de los activos de la empresa, una vez deducidos todos sus pasivos.",
                cuentas: [
                    { nombre: "Capital Inicial", tipo: "Patrimonio", naturaleza: "Acreedora", nota: "Fondo de apertura al inicializar el negocio." },
                    { nombre: "Utilidades Retenidas / Ejercicio", tipo: "Patrimonio", naturaleza: "Acreedora", nota: "Obtenido mediante: Ventas Netas - Costos - Gastos Operativos." }
                ]
            },
            resultados: {
                definicion: "Cuentas nominales utilizadas para determinar el estado de ganancias y pérdidas.",
                cuentas: [
                    { nombre: "Ventas (Ingresos Totales)", tipo: "Ingreso", naturaleza: "Acreedora" },
                    { nombre: "Costos (Costo de Ventas / COGS)", tipo: "Egreso", naturaleza: "Deudora", nota: "Bajo el sistema Periódico, este costo se registra exclusivamente a través de los ajustes por consumo o pérdida detectados en las Tomas Físicas de inventario, y no en el momento de la venta." },
                    { nombre: "Gastos (Operativos)", tipo: "Egreso", naturaleza: "Deudora", nota: "Servicios, gastos básicos, devaluación de activos y faltantes de efectivo." }
                ]
            }
        },
        mecanicas_operativas: {
            ventas: "Cuando se realiza una venta, aumenta la liquidez (Caja/Bancos) y aumentan los Ingresos (Ventas). Bajo el sistema de Inventario Periódico, la venta se trata como 100% ingreso puro en el momento; NO disminuye el inventario automáticamente ni registra Costos (COGS) hasta que se realice una Toma Física.",
            compras_inventario: "Al adquirir artículos de inventario, disminuye liquidez y aumenta la cuenta de Inventario. Se crea un lote con fecha y costo unitario para posterior extracción FIFO. No afecta utilidades hasta ser consumido.",
            compras_activos: "Al adquirir activo físico, disminuye liquidez y aumenta Activo Fijo.",
            gastos: "Un pago directo (Luz, Agua, etc.) desplaza liquidez a la cuenta de Gastos Operativos.",
            produccion_ensamblaje: "Al cocinar o ensamblar, se descuentan artículos del inventario mediante FIFO para calcular el Costo Exacto Consumido. Automáticamente se crea un nuevo Lote del producto terminado en Inventario equivalente a ese costo exacto, transfiriendo valor internamente sin impactar liquidez ni resultados.",
            auditorias_y_ajustes: {
                caja_bancos: "Diferencias de efectivo físico vs lógico. Los faltantes se envían inmediatamente al Gasto. Los sobrantes sorpresivos se ajustan y acreditan como Ingresos adicionales.",
                inventario: "Toma Física (conteo de existencias). Es el corazón del Sistema Periódico: al reportar que faltan unidades (ya sea porque se vendieron o se dañaron), el sistema extrae esos lotes usando precio FIFO y envía ese valor acumulado a la cuenta de Costos (COGS), cuadrando finalmente la Ecuación Contable y ajustando la Ganancia Neta.",
                activos_fijos: "Una pérdida de valor del equipo (depreciación) ajusta el monto a la baja y se traslada al informe de Gastos Operativos."
            }
        }
    };
};
