import React, { useState } from 'react';
import {
  Home,
  CreditCard,
  Wrench,
  Receipt as ReceiptIcon,
  Sparkles,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Phone,
  ShieldCheck,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';

interface TenantDashboardProps {
  onOpenMavAi: () => void;
  onOpenSubmitPayment: () => void;
  onOpenSubmitMaintenance: () => void;
}

export const TenantDashboard: React.FC<TenantDashboardProps> = ({
  onOpenMavAi,
  onOpenSubmitPayment,
  onOpenSubmitMaintenance,
}) => {
  const { currentUser } = useAuth();
  const {
    properties,
    tenants,
    payments,
    receipts,
    maintenanceRequests,
    setActiveReceipt,
    isLoading,
    isSyncing,
    syncError,
    refreshPortfolio,
    requestTenantOtp,
    verifyTenantOtp,
  } = useProperty();

  const [linkTenantCode, setLinkTenantCode] = useState('');
  const [linkPhone, setLinkPhone] = useState('');
  const [linkOtp, setLinkOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError('');
    setLinkSuccess('');
    setLinkLoading(true);
    try {
      const res = await requestTenantOtp(linkTenantCode, linkPhone);
      if (!res.success) {
        setLinkError(res.error || res.message || 'Failed to dispatch verification SMS.');
      } else {
        setOtpSent(true);
        setLinkSuccess(res.message || 'Verification code dispatched to your registered phone.');
      }
    } catch (err: any) {
      setLinkError(err.message || 'Network exception.');
    } finally {
      setLinkLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLinkError('');
    setLinkLoading(true);
    try {
      const res = await verifyTenantOtp(linkOtp);
      if (!res.success) {
        setLinkError(res.error || 'Invalid or expired verification code.');
      } else {
        setLinkSuccess('Lease linked successfully! Loading your portal...');
      }
    } catch (err: any) {
      setLinkError(err.message || 'Verification exception.');
    } finally {
      setLinkLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center space-y-4 max-w-xl mx-auto">
        <div className="w-12 h-12 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
        <div>
          <h3 className="text-base font-semibold text-white">Loading your tenant portal...</h3>
          <p className="text-xs text-slate-400 mt-1">
            Retrieving your lease details, payment records, and maintenance history from Supabase.
          </p>
        </div>
      </div>
    );
  }

  if (syncError && tenants.length === 0) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-8 text-center max-w-xl mx-auto my-12 space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
          <AlertCircle className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-rose-200">Unable to load tenant information</h3>
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

  // Find this tenant's record securely (strictly verified linked userId only)
  const myTenant = tenants.find((t) => t.userId === currentUser?.id);

  if (!myTenant) {
    return (
      <div className="max-w-xl mx-auto my-8 space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-8 backdrop-blur-xl shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4">
            <ShieldCheck className="w-6 h-6" />
          </div>

          <h2 className="text-lg font-bold text-white">Link Your Lease Agreement</h2>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            Signed in as <span className="text-slate-200 font-semibold">{currentUser?.email}</span>. To access your portal, view rent balances, and submit payments, link your active lease using your Tenant Code and registered phone number.
          </p>

          {linkError && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 p-3 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{linkError}</span>
            </div>
          )}

          {linkSuccess && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{linkSuccess}</span>
            </div>
          )}

          {!otpSent ? (
            <form onSubmit={handleRequestOtp} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Tenant Code (from your landlord/agreement)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MVR-92841A"
                  value={linkTenantCode}
                  onChange={(e) => setLinkTenantCode(e.target.value.toUpperCase())}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-white uppercase placeholder-slate-500 font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Registered Mobile Number
                </label>
                <input
                  type="tel"
                  required
                  placeholder="+256 700 000 000"
                  value={linkPhone}
                  onChange={(e) => setLinkPhone(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={linkLoading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition disabled:opacity-50"
              >
                {linkLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
                <span>{linkLoading ? 'Dispatching Verification...' : 'Send Verification SMS'}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Enter 6-Digit Verification Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="123456"
                  value={linkOtp}
                  onChange={(e) => setLinkOtp(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-center text-lg tracking-widest text-white font-mono focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOtpSent(false)}
                  className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={linkLoading}
                  className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/25 hover:bg-emerald-500 transition disabled:opacity-50"
                >
                  {linkLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                  <span>{linkLoading ? 'Verifying...' : 'Verify & Link Lease'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  const myProperty = properties.find((p) => p.id === myTenant?.propertyId);
  const myUnit = myProperty?.units?.find((u) => u.id === myTenant?.unitId);
  const myPayments = payments.filter((p) => p.tenantId === myTenant?.id);
  const myReceipts = receipts.filter((r) => r.tenantId === myTenant?.id);
  const myMaintenance = maintenanceRequests.filter((m) => m.tenantId === myTenant?.id);

  const isOverdue = myTenant && myTenant.currentBalance > 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Tenant Welcome & Property Badge */}
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900/90 to-blue-950/30 p-6 backdrop-blur-xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-bold text-blue-400 border border-blue-500/20">
                Tenant Portal
              </span>
              <span className="font-mono text-xs text-slate-400">
                Code: {myTenant?.tenantCode}
              </span>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-white">
              Welcome home, {myTenant?.fullName || currentUser?.fullName}!
            </h1>
            <p className="mt-1 text-xs text-slate-300">
              {myProperty?.name} • {myUnit?.unitNumber} ({myUnit?.unitType})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onOpenSubmitPayment}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition active:scale-95"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Make / Submit Payment</span>
            </button>
            <button
              onClick={onOpenSubmitMaintenance}
              className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 transition"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-400" />
              <span>Report Repair</span>
            </button>
            <button
              onClick={onOpenMavAi}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
              <span>Ask Mav AI</span>
            </button>
          </div>
        </div>
      </div>

      {/* Financial Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Monthly Rent */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Agreed Monthly Rent</span>
            <Calendar className="w-4 h-4 text-blue-400" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-white">
            {myProperty?.currency || 'UGX'} {myTenant?.rentAmount.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            Payment due on the {myTenant?.dueDay}th of each month
          </p>
        </div>

        {/* Current Balance */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Outstanding Rent Debt</span>
            {isOverdue ? (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            )}
          </div>
          <p
            className={`mt-2 text-xl font-extrabold ${
              isOverdue ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {myProperty?.currency || 'UGX'} {myTenant?.currentBalance.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {isOverdue
              ? 'Outstanding payment required'
              : (myTenant?.advanceCredit || 0) > 0
              ? `All clear! Advance credit: ${myProperty?.currency || 'UGX'} ${myTenant?.advanceCredit?.toLocaleString()}`
              : 'All payments settled up to date!'}
          </p>
        </div>

        {/* Total Payments Made */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold">Verified Payments</span>
            <ReceiptIcon className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="mt-2 text-xl font-extrabold text-white">
            {myPayments.length} Transactions
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {myReceipts.length} official receipts available
          </p>
        </div>
      </div>

      {/* Two Column Layout: Payment History & Receipts VS Maintenance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment History & Receipts */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ReceiptIcon className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-bold text-white">Your Payment Receipts</h3>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {myReceipts.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No receipts generated yet.
              </div>
            ) : (
              myReceipts.map((rcp) => (
                <div
                  key={rcp.id}
                  className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 p-3 text-xs"
                >
                  <div>
                    <p className="font-bold text-white">{rcp.receiptNumber}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(rcp.issueDate).toLocaleDateString()} • {rcp.paymentMethod.replace('_', ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-emerald-400">
                      {rcp.dataSnapshot.currency} {rcp.amount.toLocaleString()}
                    </span>
                    <button
                      onClick={() => setActiveReceipt(rcp)}
                      className="rounded-lg bg-blue-600/20 border border-blue-500/30 px-2.5 py-1 text-[11px] font-semibold text-blue-400 hover:bg-blue-600/30 transition"
                    >
                      View / Print
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Maintenance Requests */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Your Maintenance Requests</h3>
            </div>
            <button
              onClick={onOpenSubmitMaintenance}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Ticket</span>
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {myMaintenance.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                No active maintenance issues reported for your unit.
              </div>
            ) : (
              myMaintenance.map((m) => (
                <div
                  key={m.id}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-3.5 text-xs space-y-2"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold text-white">{m.title}</p>
                      <p className="text-[11px] text-slate-400">
                        Category: {m.category} • Priority: {m.priority}
                      </p>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                        m.status === 'in_progress'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : m.status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}
                    >
                      {m.status.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-slate-300 text-[11px]">{m.description}</p>

                  {m.assignedWorker && (
                    <div className="rounded-lg bg-slate-900 p-2 text-[11px] text-slate-300 flex items-center gap-1.5 border border-slate-800">
                      <Phone className="w-3 h-3 text-blue-400" />
                      <span>Assigned Technician: {m.assignedWorker}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
