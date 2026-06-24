import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useStore } from '../store/useStore'
import { INITIAL_STATE } from '../types'

vi.mock('../store/cloudStorage', () => ({
    cloudStorage: {
        getItem: vi.fn(async () => null),
        setItem: vi.fn(async () => {}),
        removeItem: vi.fn(async () => {}),
    },
    CLOUD_STORAGE_KEY: 'jardin-erp-storage-v4',
}))

// Escenario realista del modelo periódico:
//   • Toma física A (31-may) reconoce el costo del período anterior → cogs 100
//   • Ventas de junio (1000) y un gasto de junio (50)
//   • Toma física B (30-jun) cierra junio → cogs 300
//   • Una venta de julio (500) que NO pertenece a junio
const A = new Date('2026-05-31T20:00:00.000Z')
const B = new Date('2026-06-30T20:00:00.000Z')

beforeEach(() => {
    useStore.setState({
        ...INITIAL_STATE,
        transactions: [
            { id: 'cB', type: 'ADJUSTMENT', date: B.toISOString(), amount: 300, description: 'Toma B', cogs: 300, details: { itemsAdjusted: 2, itemDetails: [] } },
            { id: 'sJul', type: 'SALE', date: '2026-07-02T15:00:00.000Z', amount: 500, description: 'Venta julio', cogs: 0, details: {} },
            { id: 'sJun', type: 'SALE', date: '2026-06-15T15:00:00.000Z', amount: 1000, description: 'Venta junio', cogs: 0, details: {} },
            { id: 'gJun', type: 'EXPENSE', date: '2026-06-10T12:00:00.000Z', amount: 50, description: 'Gasto junio', details: { method: 'caja_chica' } },
            { id: 'cA', type: 'ADJUSTMENT', date: A.toISOString(), amount: 100, description: 'Toma A', cogs: 100, details: { itemsAdjusted: 1, itemDetails: [] } },
        ],
    } as any)
})

describe('Estado de Resultados entre tomas físicas', () => {
    it('período (A, B]: ventas/gastos del intervalo y costo = el de la toma de cierre B', () => {
        const start = new Date(A.getTime() + 1) // +1ms → excluye la toma A
        const r = useStore.getState().getLedgerAccounts(start, B)

        expect(r.ventas).toBe(1000) // venta de junio; la de julio queda fuera (después de B)
        expect(r.costos).toBe(300)  // costo reconocido en B; el de A es del período anterior
        expect(r.gastos).toBe(50)

        const utilidad = r.ventas - r.costos - r.gastos
        expect(utilidad).toBe(650)
    })

    it('primer período (Apertura → primera toma A): incluye el costo reconocido en A', () => {
        const r = useStore.getState().getLedgerAccounts(null, A)
        expect(r.costos).toBe(100) // la toma A cierra el primer período
        expect(r.ventas).toBe(0)   // no hubo ventas antes de A en este escenario
    })

    it('la toma A NO se cuenta dos veces: su costo cae en el período anterior, no en (A, B]', () => {
        const periodo1 = useStore.getState().getLedgerAccounts(null, A)
        const start2 = new Date(A.getTime() + 1)
        const periodo2 = useStore.getState().getLedgerAccounts(start2, B)
        // El costo total (100 + 300) se reparte exactamente entre los dos períodos, sin solaparse.
        expect(periodo1.costos + periodo2.costos).toBe(400)
        expect(periodo1.costos).toBe(100)
        expect(periodo2.costos).toBe(300)
    })
})
