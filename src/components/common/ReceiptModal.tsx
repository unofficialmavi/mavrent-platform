import React from 'react';
import { X, Printer, Download, CheckCircle2, Building, ShieldCheck } from 'lucide-react';
import { Receipt } from '../../types';

interface ReceiptModalProps {
  receipt: Receipt | null;
  onClose: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({ receipt, onClose }) => {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 overflow-y-auto print:p-0 print:bg-white">
      <div className="relative w-full max-w-xl rounded-2xl bg-white text-slate-900 shadow-2xl overflow-hidden print:shadow-none print:w-full print:max-w-none">
        {/* Modal Top Bar (Hidden during print) */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-900 px-6 py-4 text-white print:hidden">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 font-mono font-bold text-sm text-white">
              M
            </span>
            <span className="font-bold text-sm">Official Rent Receipt</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Official Receipt Body */}
        <div className="p-8 sm:p-10 font-sans print:p-8">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 font-mono font-black text-white text-lg">
                  M
                </div>
                <div>
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                    MavRent Platform
                  </h1>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                    Automated SaaS Property Ledger
                  </p>
                </div>
              </div>
              <div className="mt-4 text-xs text-slate-600 space-y-0.5">
                <p className="font-bold text-slate-900">{receipt.dataSnapshot.propertyName}</p>
                <p>Managed by: {receipt.dataSnapshot.landlordName}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">
                PAYMENT CONFIRMED
              </span>
              <p className="mt-3 font-mono text-sm font-bold text-slate-900">
                {receipt.receiptNumber}
              </p>
              <p className="text-xs text-slate-500">
                Date: {new Date(receipt.issueDate).toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          {/* Tenant & Rental Unit Details */}
          <div className="grid grid-cols-2 gap-6 my-6 rounded-xl bg-slate-50 p-4 border border-slate-200 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Received From (Tenant)
              </span>
              <p className="mt-1 text-sm font-bold text-slate-900">{receipt.dataSnapshot.tenantName}</p>
              <p className="font-mono text-slate-600 text-[11px] mt-0.5">
                Code: {receipt.dataSnapshot.tenantCode}
              </p>
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Property & Assigned Unit
              </span>
              <p className="mt-1 text-sm font-bold text-slate-900">{receipt.dataSnapshot.unitNumber}</p>
              <p className="text-slate-600 text-[11px] mt-0.5">
                {receipt.dataSnapshot.periodCovered || 'Monthly Rent'}
              </p>
            </div>
          </div>

          {/* Payment Breakdown Table */}
          <div className="border border-slate-200 rounded-xl overflow-hidden mb-6">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-4">Description</th>
                  <th className="py-2.5 px-4">Payment Method</th>
                  <th className="py-2.5 px-4">Reference No.</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-800">
                <tr>
                  <td className="py-3 px-4 font-medium">
                    Rent Payment - {receipt.dataSnapshot.unitNumber}
                  </td>
                  <td className="py-3 px-4 uppercase font-mono text-[11px]">
                    {receipt.paymentMethod.replace('_', ' ')}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    {receipt.dataSnapshot.referenceNumber || 'N/A'}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 text-sm">
                    {receipt.dataSnapshot.currency} {receipt.amount.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Balances & Settlement Summary */}
          <div className="border-t-2 border-slate-200 pt-4 flex justify-between items-end">
            <div className="space-y-1 text-xs text-slate-500">
              <div className="flex items-center gap-1.5 text-emerald-700 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Verified by MavRent Multi-Tenant Ledger</span>
              </div>
              <p className="text-[10px]">
                System Authenticated Timestamp: {new Date(receipt.issueDate).toLocaleString()}
              </p>
            </div>

            <div className="text-right space-y-1.5">
              <div className="flex justify-between gap-8 text-xs text-slate-600">
                <span>Total Paid:</span>
                <span className="font-bold text-slate-900">
                  {receipt.dataSnapshot.currency} {receipt.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between gap-8 text-xs text-slate-600 border-t border-slate-200 pt-1">
                <span>Remaining Balance:</span>
                <span className={`font-bold ${receipt.balanceAfter > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {receipt.dataSnapshot.currency} {receipt.balanceAfter.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-8 pt-4 border-t border-slate-200 text-center text-[10px] text-slate-400 print:mt-12">
            This receipt is an electronic financial record issued through the MavRent SaaS Platform.
            Keep this receipt for your records.
          </div>
        </div>
      </div>
    </div>
  );
};
