import { useState } from 'react';
import { cn } from './ui';
import { LayoutDashboard, Package, BarChart3, Settings as SettingsIcon, Menu, X, PieChart, List } from 'lucide-react';
import packageJson from '../../package.json';

interface LayoutProps {
    children: React.ReactNode;
    currentTab: string;
    onTabChange: (tab: string) => void;
}

export const Layout = ({ children, currentTab, onTabChange }: LayoutProps) => {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const NavItem = ({ id, icon, label }: any) => (
        <button
            onClick={() => { onTabChange(id); setSidebarOpen(false); }}
            className={cn(
                "flex items-center gap-3 w-full px-4 py-3 rounded-xl transition-all font-medium text-sm",
                currentTab === id ? "bg-jardin-primary text-white shadow-lg shadow-jardin-primary/30" : "text-gray-500 hover:bg-gray-100"
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    );

    return (
        <div className="min-h-screen bg-jardin-bg flex">
            {/* Sidebar Desktop */}
            <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-200 p-4 fixed h-full z-10">
                <div className="mb-10 px-4 pt-4 flex flex-col items-center text-center">
                    <img src="logo3.png" alt="El Jardín Logo" className="w-40 h-40 object-contain mb-2 hover:scale-105 transition-transform" />
                    <div className="text-xs text-gray-400 font-medium tracking-widest uppercase">ERP Contable v{packageJson.version}</div>
                </div>
                <nav className="space-y-2 flex-1">
                    <NavItem id="ops" icon={<LayoutDashboard size={20} />} label="Operaciones" />
                    <NavItem id="cats" icon={<Package size={20} />} label="Catálogos" />
                    <NavItem id="reps" icon={<BarChart3 size={20} />} label="Reportes" />
                    <NavItem id="anls" icon={<PieChart size={20} />} label="Análisis" />
                    <NavItem id="txs" icon={<List size={20} />} label="Transacciones" />
                    <NavItem id="sets" icon={<SettingsIcon size={20} />} label="Ajustes" />
                </nav>
            </aside>

            {/* Mobile Header */}
            <header className="lg:hidden fixed top-0 w-full bg-white border-b border-gray-200 z-20 px-4 h-16 flex items-center justify-between">
                <div className="font-bold text-lg">El Jardín</div>
                <button onClick={() => setSidebarOpen(true)} className="p-2"><Menu /></button>
            </header>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 z-50 lg:hidden">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
                    <aside className="absolute left-0 top-0 h-full w-64 bg-white p-4 shadow-2xl animate-in slide-in-from-left duration-200">
                        <div className="flex justify-between items-center mb-8">
                            <span className="font-bold text-xl">Menú</span>
                            <button onClick={() => setSidebarOpen(false)}><X /></button>
                        </div>
                        <nav className="space-y-2">
                            <NavItem id="ops" icon={<LayoutDashboard size={20} />} label="Operaciones" />
                            <NavItem id="cats" icon={<Package size={20} />} label="Catálogos" />
                            <NavItem id="reps" icon={<BarChart3 size={20} />} label="Reportes" />
                            <NavItem id="anls" icon={<PieChart size={20} />} label="Análisis" />
                            <NavItem id="txs" icon={<List size={20} />} label="Transacciones" />
                            <NavItem id="sets" icon={<SettingsIcon size={20} />} label="Ajustes" />
                        </nav>
                    </aside>
                </div>
            )}

            {/* Main Content */}
            <main className="flex-1 lg:ml-64 p-4 lg:p-8 pt-20 lg:pt-8 overflow-x-hidden">
                <div className="max-w-6xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};
