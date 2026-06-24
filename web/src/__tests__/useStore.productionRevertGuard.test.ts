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

beforeEach(() => {
    useStore.setState(INITIAL_STATE)
})

// Producción de 100 unidades de "Pan" usando 5 de "Harina". El parámetro panStock
// simula cuánto del producto sigue en inventario al momento de intentar anular.
function setupProduction(panStock: number) {
    useStore.setState({
        ...INITIAL_STATE,
        inventory: [
            { id: 'harina', name: 'Harina', cost: 10, stock: 5, batches: [{ id: 'h1', date: '2026-01-01', cost: 10, stock: 5 }] },
            { id: 'pan', name: 'Pan', cost: 0.5, stock: panStock, batches: [{ id: 'p1', date: '2026-02-01', cost: 0.5, stock: panStock }] },
        ],
        transactions: [
            {
                id: 'prod1', type: 'PRODUCTION', date: '2026-02-01T10:00:00.000Z', amount: 50, description: 'Cocina', cogs: 50,
                details: { outputId: 'pan', outputName: 'Pan', outputQty: 100, ingredients: [{ item: { id: 'harina', name: 'Harina', cost: 10 }, qty: '5', exactCost: 50 }] },
            },
        ],
    } as any)
}

describe('revertTransaction PRODUCTION — guard de producto ya consumido', () => {
    it('bloquea la anulación cuando el producto ya no está completo (no infla inventario)', () => {
        setupProduction(20) // se produjeron 100, quedan 20 (80 ya vendidos/contados)
        const before = useStore.getState().inventory.map(i => ({ id: i.id, stock: i.stock }))

        const result = useStore.getState().revertTransaction('prod1')

        expect(result.ok).toBe(false)
        expect(result.message).toMatch(/No se puede anular/)
        // Nada cambió: el pan sigue en 20 y la harina NO se restauró
        expect(useStore.getState().inventory.map(i => ({ id: i.id, stock: i.stock }))).toEqual(before)
        // La transacción NO quedó anulada
        expect(useStore.getState().transactions.find(t => t.id === 'prod1')?.status).not.toBe('VOIDED')
    })

    it('permite la anulación cuando el producto está completo en stock', () => {
        setupProduction(100) // producto íntegro
        const result = useStore.getState().revertTransaction('prod1')

        expect(result.ok).toBe(true)
        expect(useStore.getState().inventory.find(i => i.id === 'pan')!.stock).toBe(0)      // output removido
        expect(useStore.getState().inventory.find(i => i.id === 'harina')!.stock).toBe(10)  // 5 + 5 restaurados
        expect(useStore.getState().transactions.find(t => t.id === 'prod1')?.status).toBe('VOIDED')
    })
})
