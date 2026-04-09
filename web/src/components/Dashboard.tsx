import { useStore } from '../store/useStore';
import { ShoppingCart, Utensils, DollarSign, ChefHat, ClipboardList } from 'lucide-react';

interface DashboardProps {
    onOpenModal: (type: string) => void;
}

export const Dashboard = ({ onOpenModal }: DashboardProps) => {
    const { transactions } = useStore();

    // Metric: Ventas Acumuladas del Mes Actual
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const monthName = now.toLocaleString('es-CR', { month: 'long' });

    const monthlySales = transactions
        .filter(t => {
            const d = new Date(t.date);
            return t.type === 'SALE' && d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((acc, t) => acc + t.amount, 0);

    const ActionBtn = ({ label, icon, color, onClick, sub }: any) => (
        <button onClick={onClick} className={`${color} group relative text-white p-6 rounded-3xl flex flex-col gap-4 items-start shadow-lg shadow-gray-200 hover:shadow-xl hover:brightness-110 transition-all active:scale-[0.98] h-48 text-left w-full overflow-hidden`}>
            <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none group-hover:scale-150 transition-transform duration-500" />
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-sm z-10">{icon}</div>
            <div className="z-10 mt-auto">
                <span className="font-bold text-2xl leading-none block">{label}</span>
                {sub && <span className="text-white/80 text-sm font-medium mt-1 block">{sub}</span>}
            </div>
        </button>
    );

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Metric */}
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between">
                <div>
                    <h2 className="text-gray-400 font-bold uppercase tracking-widest text-sm mb-2">Ventas acumuladas en el mes de {monthName}</h2>
                    <div className="text-5xl font-black text-gray-800 tracking-tight">
                        ₡{monthlySales.toLocaleString()}
                    </div>
                </div>
                <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                    <DollarSign />
                </div>
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <ActionBtn
                    label="Vender"
                    sub="Registrar Pedido"
                    icon={<Utensils size={32} />}
                    color="bg-jardin-primary"
                    onClick={() => onOpenModal('sale')}
                />
                <ActionBtn
                    label="Comprar"
                    sub="Inventario o Activos"
                    icon={<ShoppingCart size={32} />}
                    color="bg-emerald-600"
                    onClick={() => onOpenModal('purchase')}
                />
                <ActionBtn
                    label="Gastar"
                    sub="Servicios, Salarios, Clavos..."
                    icon={<DollarSign size={32} />}
                    color="bg-rose-500"
                    onClick={() => onOpenModal('expense')}
                />
                <ActionBtn
                    label="Cocinar"
                    sub="Producción / Transformación"
                    icon={<ChefHat size={32} />}
                    color="bg-amber-500"
                    onClick={() => onOpenModal('production')}
                />
                <ActionBtn
                    label="Ajuste de Inventario"
                    sub="Conteo Físico"
                    icon={<ClipboardList size={32} />}
                    color="bg-indigo-500"
                    onClick={() => onOpenModal('inventory_count')}
                />
                <ActionBtn
                    label="Ajuste de Activos"
                    sub="Revisión Física"
                    icon={<ClipboardList size={32} />}
                    color="bg-blue-500"
                    onClick={() => onOpenModal('asset_count')}
                />
                <ActionBtn
                    label="Ajuste Cajas / Bancos"
                    sub="Cuadre de Efectivo"
                    icon={<DollarSign size={32} />}
                    color="bg-purple-600"
                    onClick={() => onOpenModal('cash_adjustment')}
                />
            </div>
        </div>
    );
};
