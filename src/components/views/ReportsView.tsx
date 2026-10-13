import React from 'react';
import {
  BarChart3,
  TrendingUp,
  Download,
  Printer,
  Building,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  PieChart,
} from 'lucide-react';
import { useProperty } from '../../context/PropertyContext';

export const ReportsView: React.FC = () => {
  const { properties, tenants, payments, expenses, getPortfolioMetrics } = useProperty();

  const metrics = getPortfolioMetrics();

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60 print:hidden">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Portfolio Financial Reports
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Comprehensive financial collection analysis, overdue tenant summary, and operating performance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Printable Report Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl print:border-none print:bg-white print:text-black">
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-white print:text-black">
              MavRent Portfolio Executive Statement
            </h2>
            <p className="text-xs text-slate-400 print:text-gray-600">
              Period: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </div>
          <div className="text-right text-xs">
            <span className="font-mono text-slate-400 print:text-gray-600">
              Generated: {new Date().toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Financial Highlights Table */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 my-6">
          <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 print:bg-gray-50 print:border-gray-200">
            <span className="text-[11px] text-slate-400 uppercase font-bold">Total Rent Roll</span>
            <p className="text-lg font-extrabold text-white print:text-black mt-1">
              UGX {metrics.expectedRent.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 print:bg-gray-50 print:border-gray-200">
            <span className="text-[11px] text-slate-400 uppercase font-bold">Total Collected</span>
            <p className="text-lg font-extrabold text-emerald-400 print:text-emerald-700 mt-1">
              UGX {metrics.collectedRent.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 print:bg-gray-50 print:border-gray-200">
            <span className="text-[11px] text-slate-400 uppercase font-bold">Operating Costs</span>
            <p className="text-lg font-extrabold text-rose-400 print:text-rose-700 mt-1">
              UGX {metrics.totalExpenses.toLocaleString()}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 print:bg-gray-50 print:border-gray-200">
            <span className="text-[11px] text-slate-400 uppercase font-bold">Net Operating Income</span>
            <p className="text-lg font-extrabold text-blue-400 print:text-blue-700 mt-1">
              UGX {metrics.netOperatingIncome.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Property Performance Breakdown */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-white print:text-black mb-3 uppercase tracking-wider">
            Property Performance & Occupancy Breakdown
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-gray-300">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 print:bg-gray-100 text-slate-400 print:text-gray-700 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Property</th>
                  <th className="py-2.5 px-4">Units</th>
                  <th className="py-2.5 px-4">Occupancy</th>
                  <th className="py-2.5 px-4">Expected Rent</th>
                  <th className="py-2.5 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 print:divide-gray-200">
                {properties.map((p) => {
                  const totalU = p.units?.length || 0;
                  const occU = (p.units || []).filter((u) => u.status === 'occupied').length;
                  const occRate = totalU > 0 ? Math.round((occU / totalU) * 100) : 0;
                  const rentRoll = (p.units || []).reduce(
                    (sum, u) => sum + Number(u.monthlyRent),
                    0
                  );

                  return (
                    <tr key={p.id}>
                      <td className="py-3 px-4 font-bold text-white print:text-black">{p.name}</td>
                      <td className="py-3 px-4 text-slate-300 print:text-gray-800">{totalU} units</td>
                      <td className="py-3 px-4 font-semibold text-blue-400 print:text-blue-700">
                        {occRate}% ({occU}/{totalU})
                      </td>
                      <td className="py-3 px-4 text-slate-300 print:text-gray-800">
                        {p.currency} {rentRoll.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                          Active
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overdue Tenants Section */}
        <div className="mt-8">
          <h3 className="text-sm font-bold text-rose-300 print:text-rose-700 mb-3 uppercase tracking-wider flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Overdue Balances Audit</span>
          </h3>
          <div className="overflow-x-auto rounded-xl border border-slate-800 print:border-gray-300">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 print:bg-gray-100 text-slate-400 print:text-gray-700 uppercase font-bold text-[10px]">
                <tr>
                  <th className="py-2.5 px-4">Tenant Name</th>
                  <th className="py-2.5 px-4">Code</th>
                  <th className="py-2.5 px-4">Contact</th>
                  <th className="py-2.5 px-4">Due Date</th>
                  <th className="py-2.5 px-4 text-right">Overdue Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 print:divide-gray-200">
                {tenants
                  .filter((t) => t.currentBalance > 0)
                  .map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 px-4 font-bold text-white print:text-black">{t.fullName}</td>
                      <td className="py-3 px-4 font-mono text-blue-400 print:text-blue-700">
                        {t.tenantCode}
                      </td>
                      <td className="py-3 px-4 text-slate-300 print:text-gray-800">{t.phone}</td>
                      <td className="py-3 px-4 text-slate-300 print:text-gray-800">
                        Day {t.dueDay} of month
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-rose-400 print:text-rose-700">
                        UGX {t.currentBalance.toLocaleString()}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
