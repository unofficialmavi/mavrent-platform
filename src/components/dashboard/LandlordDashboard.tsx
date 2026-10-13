import React from 'react';
import {
  Building2,
  Users,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Wrench,
  Plus,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
  Clock,
  DollarSign,
  Receipt as ReceiptIcon,
  RefreshCw,
} from 'lucide-react';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';

interface LandlordDashboardProps {
  setActiveTab: (tab: string) => void;
  onOpenMavAi: () => void;
  onOpenRecordPayment: () => void;
  onOpenAddTenant: () => void;
  onOpenAddProperty: () => void;
}

export const LandlordDashboard: React.FC<LandlordDashboardProps> = ({
  setActiveTab,
  onOpenMavAi,
  onOpenRecordPayment,
  onOpenAddTenant,
  onOpenAddProperty,
}) => {
  const { currentUser } = useAuth();
  const {
    properties,
    tenants,
    payments,
    receipts,
    maintenanceRequests,
    getPortfolioMetrics,
    setActiveReceipt,
    isLoading,
    isSyncing,
    syncError,
    refreshPortfolio,
  } = useProperty();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Loading portfolio from Supabase...</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Synchronizing properties, units, tenant accounts, payments, and live rent ledgers.
          </p>
        </div>
      </div>
    );
  }

  if (syncError && properties.length === 0) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-8 text-center max-w-xl mx-auto my-12 space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-rose-200">Unable to load portfolio</h3>
          <p className="text-xs text-rose-300/80 mt-1">{syncError}</p>
        </div>
        <button
          onClick={() => refreshPortfolio()}
          disabled={isSyncing}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 transition shadow-lg shadow-rose-600/30"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? 'Reconnecting...' : 'Retry Connection'}</span>
        </button>
      </div>
    );
  }

  const metrics = getPortfolioMetrics();
  const overdueTenants = tenants.filter((t) => t.currentBalance > 0);

  return (
    <div className="space-y-6">
      {/* Top Welcome & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Portfolio Overview
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time multi-property rental operations & financial performance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenRecordPayment}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 active:scale-95 transition"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Record Payment</span>
          </button>
          <button
            onClick={onOpenAddTenant}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
          >
            <Users className="w-3.5 h-3.5 text-blue-400" />
            <span>Add Tenant</span>
          </button>
          <button
            onClick={onOpenAddProperty}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
          >
            <Building2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Add Property</span>
          </button>
          <button
            onClick={onOpenMavAi}
            className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 px-3.5 py-2 text-xs font-bold text-white shadow-md hover:opacity-95 transition"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>Mav AI Copilot</span>
          </button>
        </div>
      </div>

      {/* Overdue Alert Banner if any */}
      {overdueTenants.length > 0 && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-4 backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-rose-500/20 p-2 text-rose-400 border border-rose-500/30 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-200">
                  {overdueTenants.length} Tenant{overdueTenants.length > 1 ? 's' : ''} Overdue with UGX {metrics.overdueRent.toLocaleString()} Outstanding
                </h3>
                <p className="text-xs text-rose-300/80 mt-0.5">
                  Action recommended: Review overdue list or run Care Mode automation to issue WhatsApp / SMS reminders.
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {overdueTenants.slice(0, 3).map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center gap-1 rounded-md bg-rose-900/40 border border-rose-700/50 px-2 py-0.5 text-[11px] font-medium text-rose-200"
                    >
                      {t.fullName} (UGX {t.currentBalance.toLocaleString()})
                    </span>
                  ))}
                  {overdueTenants.length > 3 && (
                    <span className="text-[11px] text-rose-400 self-center">
                      +{overdueTenants.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveTab('care-mode')}
              className="hidden sm:flex items-center gap-1 rounded-xl bg-rose-600/30 border border-rose-500/40 px-3 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-600/50 transition shrink-0"
            >
              <span>Care Mode</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Expected Rent */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold">Expected Rent</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-extrabold text-white tracking-tight">
            UGX {metrics.expectedRent.toLocaleString()}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
            <span>Portfolio monthly rent roll</span>
          </div>
        </div>

        {/* Collected Rent */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold">Collected Rent</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-extrabold text-emerald-400 tracking-tight">
            UGX {metrics.collectedRent.toLocaleString()}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-emerald-400/80">
            <span>{Math.round((metrics.collectedRent / (metrics.expectedRent || 1)) * 100)}% collection rate</span>
          </div>
        </div>

        {/* Outstanding / Overdue */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold">Outstanding Rent</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-extrabold text-amber-400 tracking-tight">
            UGX {metrics.outstandingRent.toLocaleString()}
          </p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-400/80">
            <span>{overdueTenants.length} tenants pending</span>
          </div>
        </div>

        {/* Occupancy Rate */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold">Occupancy Rate</span>
            <Building2 className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-extrabold text-white tracking-tight">
            {metrics.occupancyRate}%
          </p>
          <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
            <span className="text-emerald-400 font-bold">{metrics.occupiedUnits} occupied</span>
            <span>/</span>
            <span className="text-slate-400">{metrics.vacantUnits} vacant</span>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
          <span className="text-[11px] text-slate-400">Total Properties</span>
          <p className="text-base font-bold text-white mt-0.5">{metrics.totalProperties}</p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
          <span className="text-[11px] text-slate-400">Total Units</span>
          <p className="text-base font-bold text-white mt-0.5">{metrics.totalUnits}</p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
          <span className="text-[11px] text-slate-400">Operating Expenses</span>
          <p className="text-base font-bold text-slate-200 mt-0.5">
            UGX {metrics.totalExpenses.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-3">
          <span className="text-[11px] text-slate-400">Maintenance Pending</span>
          <p className="text-base font-bold text-blue-400 mt-0.5">
            {metrics.pendingMaintenanceCount} requests
          </p>
        </div>
      </div>

      {/* Two Column Layout: Recent Payments vs Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Confirmed Payments */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Recent Payments</h3>
            </div>
            <button
              onClick={() => setActiveTab('payments')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              View all
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-800/50 space-y-2">
            {payments.slice(0, 4).map((pay) => {
              const tenant = tenants.find((t) => t.id === pay.tenantId);
              const receipt = receipts.find((r) => r.paymentId === pay.id);

              return (
                <div key={pay.id} className="pt-2 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-white">{tenant?.fullName || 'Tenant'}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(pay.paymentDate).toLocaleDateString()} • {pay.paymentMethod.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-emerald-400">
                      UGX {pay.amount.toLocaleString()}
                    </p>
                    {receipt && (
                      <button
                        onClick={() => setActiveReceipt(receipt)}
                        className="text-[10px] text-blue-400 hover:underline flex items-center gap-0.5 ml-auto"
                      >
                        <ReceiptIcon className="w-3 h-3" />
                        <span>Receipt</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Active Maintenance Issues */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Maintenance Tickets</h3>
            </div>
            <button
              onClick={() => setActiveTab('maintenance')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              Manage
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-800/50 space-y-2">
            {maintenanceRequests.slice(0, 4).map((ticket) => {
              const prop = properties.find((p) => p.id === ticket.propertyId);
              const unit = prop?.units?.find((u) => u.id === ticket.unitId);

              return (
                <div key={ticket.id} className="pt-2 flex items-start justify-between text-xs gap-3">
                  <div>
                    <p className="font-bold text-white">{ticket.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {unit?.unitNumber || 'Unit'} • Category: {ticket.category}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                        ticket.status === 'pending'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                          : ticket.status === 'in_progress'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {ticket.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
