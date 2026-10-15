import React from 'react';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Wrench,
  Sparkles,
  Receipt as ReceiptIcon,
  Home,
  FileText,
  Settings,
  Compass,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

interface MobileNavigationProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenMavAi: () => void;
}

export const MobileNavigation: React.FC<MobileNavigationProps> = ({
  activeTab,
  setActiveTab,
  onOpenMavAi,
}) => {
  const { role } = useAuth();

  if (role === 'guest') {
    return (
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl px-2 py-1.5 safe-bottom">
        <div className="flex items-center justify-around">
          <button
            onClick={() => setActiveTab('marketplace')}
            className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition ${
              activeTab === 'marketplace' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[10px]">Marketplace</span>
          </button>

          <button
            onClick={onOpenMavAi}
            className="flex flex-col items-center gap-1 -mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 rounded-full text-white shadow-lg shadow-blue-500/30 ring-4 ring-slate-950 active:scale-95 transition"
          >
            <Sparkles className="w-5 h-5 text-yellow-300" />
            <span className="sr-only">Mav AI</span>
          </button>
        </div>
      </div>
    );
  }

  if (role === 'tenant') {
    return (
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl px-2 py-1.5 safe-bottom">
        <div className="flex items-center justify-around">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition ${
              activeTab === 'dashboard' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px]">My Home</span>
          </button>

          <button
            onClick={() => setActiveTab('marketplace')}
            className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition ${
              activeTab === 'marketplace' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[10px]">Explore</span>
          </button>

          <button
            onClick={onOpenMavAi}
            className="flex flex-col items-center gap-1 -mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 rounded-full text-white shadow-lg shadow-blue-500/30 ring-4 ring-slate-950 active:scale-95 transition"
          >
            <Sparkles className="w-5 h-5 text-yellow-300" />
            <span className="sr-only">Mav AI</span>
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition ${
              activeTab === 'payments' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-5 h-5" />
            <span className="text-[10px]">Payments</span>
          </button>

          <button
            onClick={() => setActiveTab('maintenance')}
            className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition ${
              activeTab === 'maintenance' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wrench className="w-5 h-5" />
            <span className="text-[10px]">Repairs</span>
          </button>
        </div>
      </div>
    );
  }

  // Landlord bottom bar
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-800 bg-slate-950/95 backdrop-blur-xl px-2 py-1.5 safe-bottom">
      <div className="flex items-center justify-around">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition ${
            activeTab === 'dashboard' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px]">Home</span>
        </button>

        <button
          onClick={() => setActiveTab('marketplace')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition ${
            activeTab === 'marketplace' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Compass className="w-5 h-5" />
          <span className="text-[10px]">Marketplace</span>
        </button>

        <button
          onClick={onOpenMavAi}
          className="flex flex-col items-center gap-1 -mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 p-2.5 rounded-full text-white shadow-lg shadow-blue-500/30 ring-4 ring-slate-950 active:scale-95 transition"
        >
          <Sparkles className="w-5 h-5 text-yellow-300" />
          <span className="sr-only">Mav AI</span>
        </button>

        <button
          onClick={() => setActiveTab('properties')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition ${
            activeTab === 'properties' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Building2 className="w-5 h-5" />
          <span className="text-[10px]">Properties</span>
        </button>

        <button
          onClick={() => setActiveTab('payments')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition ${
            activeTab === 'payments' ? 'text-blue-400 font-bold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <CreditCard className="w-5 h-5" />
          <span className="text-[10px]">Ledger</span>
        </button>
      </div>
    </div>
  );
};
