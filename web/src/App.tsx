import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from './store/useStore';
import { forceRefreshFromCloud } from './store/cloudStorage';
import { supabase } from './lib/supabase';
import { Onboarding } from './components/Onboarding';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Catalogs } from './components/Catalogs';
import { Reports } from './components/Reports';
import { Analysis } from './components/Analysis';
import { Settings } from './components/Settings';
import { Transactions } from './components/Transactions';
import { PurchaseModal, SaleModal, ExpenseModal, ProductionModal, InventoryCountModal, AssetCountModal, CashAdjustmentModal } from './components/Operations';
import { backupManager } from './lib/backup';
import { getAccountingDocumentation } from './lib/accountingDocs';
import { checkForUpdate, applyUpdate } from './lib/versionCheck';

export default function App() {
  const initialized = useStore((state) => state.initialized);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [tab, setTab] = useState('ops'); // ops, cats, reps, anls, txs, sets
  const [modal, setModal] = useState<string | null>(null);
  const [backupToast, setBackupToast] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState(false);
  const [conflictToast, setConflictToast] = useState(false);
  const [balanceWarning, setBalanceWarning] = useState<number | null>(null);
  const isSyncingRef = useRef(false);

  useEffect(() => {
    const unsub = useStore.persist.onFinishHydration(() => setIsHydrated(true));
    setIsHydrated(useStore.persist.hasHydrated());
    return unsub;
  }, []);

  // Real auth gate: the app only renders behind a live Supabase session, and that
  // session is what makes every cloud read/write pass row-level security.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setIsAuthenticated(!!data.session);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setIsAuthenticated(!!session);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const syncFromCloud = useCallback(async () => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const ok = await forceRefreshFromCloud();
      if (ok) {
        await useStore.persist.rehydrate();
        setSyncToast(true);
        setTimeout(() => setSyncToast(false), 3000);
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, []); // stable — uses ref for guard, no deps needed

  // Once signed in, pull the latest cloud state with the authenticated session.
  useEffect(() => {
    if (isAuthenticated) syncFromCloud();
  }, [isAuthenticated, syncFromCloud]);

  // Auto-sync whenever the user returns to this tab
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') syncFromCloud();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [syncFromCloud]);

  // Auto-sync when cloudStorage detects an external write (SQL fix, another device)
  useEffect(() => {
    const handleConflict = async () => {
      setConflictToast(true);
      await syncFromCloud();
      setTimeout(() => setConflictToast(false), 5000);
    };
    window.addEventListener('erp-cloud-conflict', handleConflict);
    return () => window.removeEventListener('erp-cloud-conflict', handleConflict);
  }, [syncFromCloud]);

  // Balance guard: cloudStorage raises this when it's about to save an unbalanced
  // state (Diferencia por Conciliar ≠ 0) — the fingerprint of a stale-array merge
  // desyncing inventory from the transaction log. Surface it persistently so the
  // user force-syncs before the drift spreads. Auto-clears when a later save balances.
  useEffect(() => {
    const handleBalance = (e: Event) => setBalanceWarning((e as CustomEvent<number>).detail);
    const handleBalanceOk = () => setBalanceWarning(null);
    window.addEventListener('erp-balance-warning', handleBalance);
    window.addEventListener('erp-balance-ok', handleBalanceOk);
    return () => {
      window.removeEventListener('erp-balance-warning', handleBalance);
      window.removeEventListener('erp-balance-ok', handleBalanceOk);
    };
  }, []);

  // ── Version check ────────────────────────────────────────────────────────
  // Checks on startup, on tab-focus, and every 5 minutes. When a new deploy
  // is detected, shows a non-intrusive banner so the user can refresh safely.
  useEffect(() => {
    const doCheck = async () => {
      if (await checkForUpdate()) setUpdateAvailable(true);
    };

    doCheck(); // initial check

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') doCheck();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const timer = setInterval(doCheck, 5 * 60 * 1000); // every 5 min

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(timer);
    };
  }, []);

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
    // Supabase already established the session in <Login>; onAuthStateChange will
    // also fire, but set immediately so the UI advances without a round-trip.
    setIsAuthenticated(true);
  };

  if (!authChecked) {
    return <div className="min-h-screen bg-jardin-bg" />; // brief: restoring session
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-jardin-bg flex flex-col items-center justify-center">
        <img src="logo3.png" alt="Cargando..." className="w-40 h-40 object-contain animate-pulse mb-8" />
        <div className="flex flex-col items-center">
            <div className="w-6 h-6 border-4 border-jardin-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-500 font-medium tracking-wide">Sincronizando Sistema...</p>
        </div>
      </div>
    );
  }

  if (!initialized) {
    return <Onboarding />;
  }

  return (
    <>
    {/* ── Update available banner ─────────────────────────────────────────── */}
    {updateAvailable && (
      <div className="fixed top-0 inset-x-0 z-[200] flex items-center justify-center gap-3 bg-jardin-primary text-white px-4 py-2.5 shadow-lg text-sm">
        <span className="text-base">🚀</span>
        <span className="font-semibold">Nueva versión disponible</span>
        <button
          onClick={applyUpdate}
          className="bg-white text-jardin-primary px-3 py-1 rounded-lg font-bold text-xs hover:bg-gray-100 transition-colors"
        >
          Actualizar ahora
        </button>
        <button
          onClick={() => setUpdateAvailable(false)}
          className="ml-1 text-white/70 hover:text-white transition-colors text-base leading-none"
          title="Ignorar por ahora"
        >
          ✕
        </button>
      </div>
    )}
    <Layout currentTab={tab} onTabChange={setTab} onSync={syncFromCloud} isSyncing={isSyncing}>
      {tab === 'ops' && <Dashboard onOpenModal={setModal} />}
      {tab === 'cats' && <Catalogs />}
      {tab === 'reps' && <Reports />}
      {tab === 'anls' && <Analysis />}
      {tab === 'txs' && <Transactions />}
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

      {/* Cloud Sync Toast */}
      {syncToast && !conflictToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-blue-600 text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in slide-in-from-bottom-4 duration-300">
          <span className="text-lg">☁️</span>
          Datos actualizados desde la nube ✓
        </div>
      )}

      {/* Conflict auto-sync Toast */}
      {conflictToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-amber-600 text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold animate-in slide-in-from-bottom-4 duration-300">
          <span className="text-lg">⚠️</span>
          La nube fue actualizada externamente — sincronizando...
        </div>
      )}

      {/* Balance-guard banner: persistent alarm when an unbalanced state was saved */}
      {balanceWarning !== null && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 bg-red-600 text-white px-5 py-3 rounded-2xl shadow-xl text-sm font-semibold max-w-[92vw]">
          <span className="text-lg">🚨</span>
          <span>
            Diferencia por Conciliar detectada (₡{balanceWarning.toLocaleString('es-CR')}). Posible
            desincronización — sincroniza la nube y cierra otras pestañas/dispositivos.
          </span>
          <button
            onClick={() => { setBalanceWarning(null); syncFromCloud(); }}
            className="ml-1 shrink-0 bg-white/20 hover:bg-white/30 rounded-lg px-3 py-1"
          >
            Sincronizar
          </button>
        </div>
      )}
    </Layout>
    </>
  );
}
