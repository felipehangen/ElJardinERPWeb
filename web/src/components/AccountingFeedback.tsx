import type { Accounts } from '../types';
import { Modal, Button, cn } from './ui';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface AccountingFeedbackProps {
    isOpen: boolean;
    onClose: () => void;
    prev: Accounts;
    curr: Accounts;
    title: string;
    description?: string;
}

export const AccountingFeedback = ({ isOpen, onClose, prev, curr, title, description }: AccountingFeedbackProps) => {

    // Calculate Differences
    const getDiff = (key: keyof Accounts) => {
        const c = curr[key];
        const p = prev[key];
        if (typeof c === 'number' && typeof p === 'number') return c - p;
        return 0;
    };

    // Format currency
    const fmt = (n: number) => `₡${n.toLocaleString()}`;

    // Helper to render a change row
    const ChangeRow = ({ label, diff }: { label: string, diff: number }) => {
        if (Math.abs(diff) < 0.01) return null; // Hide if no change

        // Determine color based on context
        // Asset Increase = Green (Good?)
        // Asset Decrease = Red (Money leaving?)
        // Income Increase = Green
        // Expense Increase = Red

        // Simplified Logic:
        // Positive Diff: Green text
        // Negative Diff: Red text
        // But for Expenses, Positive Diff is usually "Bad" (Money spent), but "Expense Value" goes UP.
        // Let's stick to strict accounting direction:
        // +Value = Green, -Value = Red. 
        // EXCEPT Expenses: +Expense = Orange/Red indicating cost.

        let color = "text-gray-500";
        if (label === 'Gastos' || label === 'Costos') {
            color = diff > 0 ? "text-amber-600" : "text-green-600";
        } else {
            color = diff > 0 ? "text-green-600" : "text-red-600";
        }

        const icon = diff > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />;

        return (
            <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm font-medium text-gray-600">{label}</span>
                <div className={cn("flex items-center gap-2 font-bold", color)}>
                    {icon}
                    <span>{diff > 0 ? '+' : ''}{fmt(diff)}</span>
                </div>
            </div>
        );
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Resumen de Transacción">
            <div className="space-y-6">

                <div className="bg-green-50 p-4 rounded-xl text-center border border-green-100">
                    <h3 className="text-lg font-bold text-green-900 mb-1">{title}</h3>
                    {description && <p className="text-base font-medium text-green-800 mb-1">{description}</p>}
                    <p className="text-sm text-green-700">La operación se registró correctamente.</p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Balance Sheet Changes */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold text-gray-400 uppercase border-b pb-1">Balance General (Activos/Pasivos)</h4>
                        <div className="bg-gray-50 rounded-xl p-3">
                            <ChangeRow label="Caja Chica" diff={getDiff('caja_chica')} />
                            <ChangeRow label="Banco" diff={getDiff('banco')} />
                            <ChangeRow label="Inventario" diff={getDiff('inventario')} />
                            <ChangeRow label="Activo Fijo" diff={getDiff('activo_fijo')} />
                            <ChangeRow label="Patrimonio" diff={getDiff('patrimonio')} />
                        </div>
                    </div>

                    {/* Income Statement Changes */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold text-gray-400 uppercase border-b pb-1">Estado de Resultados (Ganancias)</h4>
                        <div className="bg-gray-50 rounded-xl p-3">
                            <ChangeRow label="Ventas" diff={getDiff('ventas')} />
                            <ChangeRow label="Costos (CV)" diff={getDiff('costos')} />
                            <ChangeRow label="Gastos (CF)" diff={getDiff('gastos')} />
                        </div>
                    </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-xl flex items-center justify-between text-blue-900">
                    <span className="text-xs font-bold uppercase">Impacto Neto (Caja)</span>
                    <span className="font-mono font-bold text-xl">
                        {fmt(getDiff('caja_chica') + getDiff('banco'))}
                    </span>
                </div>

                <Button className="w-full" onClick={onClose}>Entendido</Button>
            </div>
        </Modal>
    );
};
