import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PropertyProvider, useProperty } from './context/PropertyContext';
import { Header } from './components/common/Header';
import { MobileNavigation } from './components/common/MobileNavigation';
import { OfflineIndicator } from './components/common/OfflineIndicator';
import { ReceiptModal } from './components/common/ReceiptModal';
import { SupabaseSetupModal } from './components/common/SupabaseSetupModal';
import { MavAiDrawer } from './components/ai/MavAiDrawer';
import { AuthModal } from './components/auth/AuthModal';
import { MarketplaceView } from './components/marketplace/MarketplaceView';

// Views
import { LandlordDashboard } from './components/dashboard/LandlordDashboard';
import { TenantDashboard } from './components/dashboard/TenantDashboard';
import { PropertiesView } from './components/views/PropertiesView';
import { TenantsView } from './components/views/TenantsView';
import { PaymentsView } from './components/views/PaymentsView';
import { MaintenanceView } from './components/views/MaintenanceView';
import { ExpensesView } from './components/views/ExpensesView';
import { ReportsView } from './components/views/ReportsView';
import { CareModeView } from './components/views/CareModeView';
import { MarketplaceView } from './components/views/MarketplaceView';

const MainApp: React.FC = () => {
  const { role, currentUser } = useAuth();
  const {
    activeReceipt,
    setActiveReceipt,
    isLoading,
    isSyncing,
    syncError,
    refreshPortfolio,
  } = useProperty();

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [showMavAi, setShowMavAi] = useState(false);
  const [showSupabaseSetup, setShowSupabaseSetup] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // Deep linking helper triggers
  const handleOpenRecordPayment = () => {
    setActiveTab('payments');
  };

  const handleOpenAddTenant = () => {
    setActiveTab('tenants');
  };

  const handleOpenAddProperty = () => {
    setActiveTab('properties');
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 shadow-lg shadow-blue-500/25">
                <span className="font-mono text-xl font-black text-white">M</span>
              </div>
              <div>
                <div className="text-lg font-extrabold tracking-tight text-white">MavRent <span className="text-blue-400">PRO</span></div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400">Rentals made easier</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowAuthModal(true)} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-200 transition hover:bg-slate-800">Sign in</button>
              <button onClick={() => setShowAuthModal(true)} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-500">Get started</button>
            </div>
          </div>
        </header>
        <MarketplaceView onSignIn={() => setShowAuthModal(true)} />
        <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <Header
        onOpenMavAi={() => setShowMavAi(true)}
        onOpenSupabaseSetup={() => setShowSupabaseSetup(true)}
        onOpenAuthModal={() => setShowAuthModal(true)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-12">
        {syncError && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-300">
            <span>We couldn’t refresh your rental data. Your records have not been deleted. Please retry, and contact support if this continues.</span>
            <button
              onClick={() => refreshPortfolio()}
              className="rounded bg-amber-500/20 px-2 py-0.5 font-bold hover:bg-amber-500/30"
            >
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in">
            <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-700 shadow-xl shadow-blue-500/30 animate-pulse">
              <span className="font-mono text-3xl font-black text-white">M</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Loading MavRent Platform</h3>
              <p className="text-xs text-slate-400 mt-1">Connecting to live Supabase database & ledger...</p>
            </div>
          </div>
        ) : activeTab === 'marketplace' ? (
          <MarketplaceView />
        ) : role === 'guest' ? (
          <MarketplaceView />
        ) : role === 'tenant' ? (
          /* Tenant View */
          <>
            {activeTab === 'dashboard' && (
              <TenantDashboard
                onOpenMavAi={() => setShowMavAi(true)}
                onOpenSubmitPayment={() => setActiveTab('payments')}
                onOpenSubmitMaintenance={() => setActiveTab('maintenance')}
              />
            )}
            {activeTab === 'payments' && <PaymentsView />}
            {activeTab === 'maintenance' && <MaintenanceView />}
          </>
        ) : (
          /* Landlord / Manager View */
          <>
            {activeTab === 'dashboard' && (
              <LandlordDashboard
                setActiveTab={setActiveTab}
                onOpenMavAi={() => setShowMavAi(true)}
                onOpenRecordPayment={handleOpenRecordPayment}
                onOpenAddTenant={handleOpenAddTenant}
                onOpenAddProperty={handleOpenAddProperty}
              />
            )}
            {activeTab === 'properties' && <PropertiesView />}
            {activeTab === 'tenants' && <TenantsView />}
            {activeTab === 'payments' && <PaymentsView />}
            {activeTab === 'maintenance' && <MaintenanceView />}
            {activeTab === 'expenses' && <ExpensesView />}
            {activeTab === 'reports' && <ReportsView />}
            {activeTab === 'care-mode' && <CareModeView />}
          </>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileNavigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenMavAi={() => setShowMavAi(true)}
      />

      {/* Offline Connectivity Toast */}
      <OfflineIndicator />

      {/* Official Printable Receipt Modal */}
      <ReceiptModal receipt={activeReceipt} onClose={() => setActiveReceipt(null)} />

      {/* Supabase Connection Setup Modal */}
      <SupabaseSetupModal
        isOpen={showSupabaseSetup}
        onClose={() => setShowSupabaseSetup(false)}
      />

      {/* Mav AI Drawer */}
      <MavAiDrawer isOpen={showMavAi} onClose={() => setShowMavAi(false)} />

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <PropertyProvider>
        <MainApp />
      </PropertyProvider>
    </AuthProvider>
  );
}
