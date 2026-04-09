import { useState, useEffect } from 'react';
import { useStore } from './store/useStore';
import { Onboarding } from './components/Onboarding';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Catalogs } from './components/Catalogs';
import { Reports } from './components/Reports';
import { Analysis } from './components/Analysis';
import { Settings } from './components/Settings';
import { PurchaseModal, SaleModal, ExpenseModal, ProductionModal, InventoryCountModal, AssetCountModal, CashAdjustmentModal } from './components/Operations';
import { backupManager } from './lib/backup';
import { getAccountingDocumentation } from './lib/accountingDocs';

export default function App() {
  const initialized = useStore((state) => state.initialized);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('erp_auth_token') === 'true';
  });
  const [tab, setTab] = useState('ops'); // ops, cats, reps, sets
  const [modal, setModal] = useState<string | null>(null);
  const [backupToast, setBackupToast] = useState(false);

  useEffect(() => {
    if (!initialized) return;

    const performBackup = async () => {
      try {
        const state = useStore.getState();
        const exportPayload = {
          ...state,
          documentacion_contable: getAccountingDocumentation()
        };
        const cleanPayload = JSON.parse(JSON.stringify(exportPayload));
        const saved = await backupManager.saveDailyBackup(cleanPayload);
        if (saved) {
          setBackupToast(true);
          setTimeout(() => setBackupToast(false), 4000);
        }
      } catch (err) {
        console.error("Error auto-guardando respaldo:", err);
      }
    };

    // Attempt backup on boot
    performBackup();

    // Attempt backup every 30 mins to guarantee 24/7 uptime captures (1000 * 60 * 30 = 1,800,000 ms)
    const interval = setInterval(performBackup, 1800000);

    return () => clearInterval(interval);
  }, [initialized]);

  const handleLogin = () => {
    localStorage.setItem('erp_auth_token', 'true');
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  if (!initialized) {
    return <Onboarding />;
  }

  return (
    <Layout currentTab={tab} onTabChange={setTab}>
      {tab === 'ops' && <Dashboard onOpenModal={setModal} />}
      {tab === 'cats' && <Catalogs />}
      {tab === 'reps' && <Reports />}
      {tab === 'anls' && <Analysis />}
      {tab === 'sets' && <Settings />}

      {/* Modals are always mounted but hidden until needed, or conditionally rendered. Conditional is better for state reset. */}
      {modal === 'purchase' && <PurchaseModal isOpen={true} onClose={() => setModal(null)} />}
      {modal === 'sale' && <SaleModal isOpen={true} onClose={() => setModal(null)} />}
      {modal === 'expense' && <ExpenseModal isOpen={true} onClose={() => setModal(null)} />}
      {modal === 'production' && <ProductionModal isOpen={true} onClose={() => setModal(null)} />}
      {modal === 'inventory_count' && <InventoryCountModal isOpen={true} onClose={() => setModal(null)} />}
      {modal === 'asset_count' && <AssetCountModal isOpen={true} onClose={() => setModal(null)} />}
      {modal === 'cash_adjustment' && <CashAdjustmentModal isOpen={true} onClose={() => setModal(null)} />}

      {/* Daily Backup Toast */}
      {backupToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in slide-in-from-bottom-4 duration-300">
          <span className="text-lg">💾</span>
          Respaldo diario guardado ✓
        </div>
      )}
    </Layout>
  );
}
