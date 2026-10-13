import React, { useState } from 'react';
import {
  CreditCard,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Receipt as ReceiptIcon,
  DollarSign,
  Calendar,
  ShieldCheck,
  AlertCircle,
  FileCheck,
} from 'lucide-react';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { PaymentMethod } from '../../types';

interface PaymentsViewProps {
  initialTenantId?: string;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({ initialTenantId }) => {
  const { role } = useAuth();
  const {
    properties,
    tenants,
    payments,
    receipts,
    recordPayment,
    confirmPayment,
    setActiveReceipt,
  } = useProperty();

  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [showRecordModal, setShowRecordModal] = useState(Boolean(initialTenantId));
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Form State
  const [selectedTenantId, setSelectedTenantId] = useState(
    initialTenantId || tenants[0]?.id || ''
  );
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mobile_money');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);
  const selectedProp = properties.find((p) => p.id === selectedTenant?.propertyId);
  const selectedUnit = selectedProp?.units?.find((u) => u.id === selectedTenant?.unitId);

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!selectedTenantId || !amount || Number(amount) <= 0) {
      setFormError('Please enter a valid payment amount');
      return;
    }

    setSubmitting(true);
    const result = await recordPayment({
      tenantId: selectedTenantId,
      amount: Number(amount),
      paymentMethod,
      referenceNumber: referenceNumber || `REF-${Date.now()}`,
      paymentDate,
      notes,
    });
    setSubmitting(false);

    if (!result.success) {
      setFormError(result.error || 'Failed to record payment');
      return;
    }

    setShowRecordModal(false);
    setAmount('');
    setReferenceNumber('');
    setNotes('');
  };

  const filteredPayments = payments.filter((p) => {
    const tenant = tenants.find((t) => t.id === p.tenantId);
    const matchesSearch =
      tenant?.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.receiptNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.referenceNumber && p.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;
    if (methodFilter !== 'all' && p.paymentMethod !== methodFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Rent Engine & Payment Ledger
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Authoritative rent collection, partial/full settlements, duplicate prevention, and instant business receipts.
          </p>
        </div>

        <button
          onClick={() => {
            if (tenants.length > 0) {
              setSelectedTenantId(tenants[0].id);
              setAmount(tenants[0].rentAmount.toString());
            }
            setShowRecordModal(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Record New Payment</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by tenant, receipt #, or reference..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-slate-900 border border-slate-800 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs font-medium w-full sm:w-auto overflow-x-auto">
          {['all', 'mobile_money', 'bank', 'cash', 'card'].map((method) => (
            <button
              key={method}
              onClick={() => setMethodFilter(method)}
              className={`px-3 py-1 rounded-md capitalize transition ${
                methodFilter === method ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {method.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Payments Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-bold tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Receipt #</th>
                <th className="py-3 px-4">Tenant & Unit</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Method & Ref</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-slate-500">
                    No payment records found.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((payment) => {
                  const tenant = tenants.find((t) => t.id === payment.tenantId);
                  const prop = properties.find((p) => p.id === payment.propertyId);
                  const unit = prop?.units?.find((u) => u.id === payment.unitId);
                  const receipt = receipts.find((r) => r.paymentId === payment.id);

                  return (
                    <tr key={payment.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-blue-400">
                        {payment.receiptNumber}
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-white">{tenant?.fullName || 'Tenant'}</p>
                        <p className="text-[11px] text-slate-400">
                          {unit?.unitNumber || 'Unit'} • {prop?.name}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-400 text-sm">
                        {prop?.currency || 'UGX'} {payment.amount.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="uppercase text-[11px] font-semibold text-slate-300">
                          {payment.paymentMethod.replace('_', ' ')}
                        </span>
                        <p className="font-mono text-[10px] text-slate-500">
                          Ref: {payment.referenceNumber}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 text-slate-400">
                        {new Date(payment.paymentDate).toLocaleDateString()}
                      </td>
                      <td className="py-3.5 px-4">
                        {payment.status === 'confirmed' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 border border-emerald-500/30">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>Confirmed</span>
                          </span>
                        ) : payment.status === 'pending_verification' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/30">
                            <Clock className="w-3 h-3" />
                            <span>Pending Verification</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-400 border border-rose-500/30">
                            <AlertCircle className="w-3 h-3" />
                            <span className="capitalize">{payment.status}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {payment.status === 'pending_verification' && role === 'landlord' && (
                            <button
                              disabled={confirmingId === payment.id}
                              onClick={async () => {
                                setConfirmingId(payment.id);
                                await confirmPayment(payment.id);
                                setConfirmingId(null);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 transition shadow-sm disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{confirmingId === payment.id ? 'Confirming...' : 'Confirm'}</span>
                            </button>
                          )}
                          {receipt ? (
                            <button
                              onClick={() => setActiveReceipt(receipt)}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-600/20 border border-blue-500/30 px-2.5 py-1 text-xs font-semibold text-blue-400 hover:bg-blue-600/30 transition"
                            >
                              <ReceiptIcon className="w-3.5 h-3.5" />
                              <span>Receipt</span>
                            </button>
                          ) : (
                            !receipt && payment.status !== 'pending_verification' && (
                              <span className="text-slate-500 text-[11px]">—</span>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Payment Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-400" />
                <h3 className="text-base font-bold text-white">Record Rent Payment</h3>
              </div>
              <button
                onClick={() => setShowRecordModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleRecord} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select Tenant</label>
                <select
                  value={selectedTenantId}
                  onChange={(e) => {
                    setSelectedTenantId(e.target.value);
                    const t = tenants.find((item) => item.id === e.target.value);
                    if (t) {
                      setAmount(t.rentAmount.toString());
                    }
                  }}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                >
                  {tenants.map((t) => {
                    const p = properties.find((prop) => prop.id === t.propertyId);
                    return (
                      <option key={t.id} value={t.id}>
                        {t.fullName} ({t.tenantCode}) - Balance: {p?.currency || 'UGX'}{' '}
                        {t.currentBalance.toLocaleString()}
                      </option>
                    );
                  })}
                </select>
              </div>

              {selectedTenant && (
                <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-[11px] space-y-1 text-slate-300">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Unit:</span>
                    <span>
                      {selectedUnit?.unitNumber} ({selectedProp?.name})
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Agreed Rent:</span>
                    <span>
                      {selectedProp?.currency} {selectedTenant.rentAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span className="text-slate-500">Current Balance:</span>
                    <span
                      className={
                        selectedTenant.currentBalance > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }
                    >
                      {selectedProp?.currency} {selectedTenant.currentBalance.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Amount Paid ({selectedProp?.currency || 'UGX'})
                  </label>
                  <input
                    type="number"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 850000"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white uppercase"
                  >
                    <option value="mobile_money">Mobile Money (MTN / Airtel)</option>
                    <option value="bank">Bank Transfer / EFT</option>
                    <option value="cash">Cash in Hand</option>
                    <option value="card">Card Payment</option>
                    <option value="other">Other / Cheque</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Transaction / Reference #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. MM-9928192 or STANBIC-883"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Notes / Description</label>
                <input
                  type="text"
                  placeholder="e.g. October 2026 rent payment via MTN Momo"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRecordModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-500 shadow-md shadow-blue-600/20"
                >
                  {submitting ? 'Recording...' : 'Confirm & Generate Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
