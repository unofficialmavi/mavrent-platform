import React, { useState } from 'react';
import {
  TrendingDown,
  Plus,
  Trash2,
  Calendar,
  Building,
  DollarSign,
  PieChart,
  Tag,
  Receipt as ReceiptIcon,
  AlertCircle,
} from 'lucide-react';
import { useProperty } from '../../context/PropertyContext';
import { ExpenseCategory } from '../../types';

export const ExpensesView: React.FC = () => {
  const { properties, expenses, addExpense, deleteExpense } = useProperty();

  const [showModal, setShowModal] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('utilities');
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!amount || Number(amount) <= 0 || !description || !selectedPropertyId) {
      setFormError('Please enter a valid amount, description, and property.');
      return;
    }

    setSubmitting(true);
    try {
      await addExpense({
        propertyId: selectedPropertyId,
        amount: Number(amount),
        category,
        expenseDate,
        description,
      });

      setShowModal(false);
      setAmount('');
      setDescription('');
    } catch (err: any) {
      setFormError(err?.message || 'Unable to record expense. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // Group by category
  const categoryTotals: Record<string, number> = {};
  expenses.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + Number(e.amount);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Operating Expenses & Maintenance Costs
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Track utilities, security, repairs, taxes, and net operating income (NOI).
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Record Expense</span>
        </button>
      </div>

      {/* Expense Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
          <span className="text-xs font-semibold text-slate-400">Total Operating Expenses</span>
          <p className="mt-2 text-xl font-extrabold text-white">
            UGX {totalExpenses.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">{expenses.length} expense items recorded</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl sm:col-span-2">
          <span className="text-xs font-semibold text-slate-400">Category Breakdown</span>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(categoryTotals).map(([cat, total]) => (
              <div
                key={cat}
                className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs"
              >
                <span className="uppercase text-[10px] text-slate-400 font-bold block">{cat}</span>
                <span className="font-bold text-white">UGX {total.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Expense Ledger Table */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden backdrop-blur-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-bold tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Property</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4 text-right">Amount</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-slate-500">
                    No operating expenses recorded yet.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => {
                  const prop = properties.find((p) => p.id === expense.propertyId);

                  return (
                    <tr key={expense.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 text-slate-400">
                        {new Date(expense.expenseDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {prop?.name || 'Property'}
                      </td>
                      <td className="py-3 px-4 uppercase text-[11px] font-bold text-blue-400">
                        {expense.category}
                      </td>
                      <td className="py-3 px-4 text-slate-300">{expense.description}</td>
                      <td className="py-3 px-4 text-right font-bold text-white">
                        {prop?.currency || 'UGX'} {expense.amount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => deleteExpense(expense.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                          title="Delete expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Record Expense Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white">Record Operating Expense</h3>
            <p className="text-xs text-slate-400 mt-1">Log property cost for accounting & tax audit</p>

            {formError && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Select Property</label>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Amount</label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 150000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white font-bold"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white uppercase"
                  >
                    <option value="repairs">Repairs</option>
                    <option value="utilities">Utilities (Water/Power)</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="staff">Staff / Caretaker</option>
                    <option value="security">Security</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="taxes">Taxes</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Expense Date</label>
                <input
                  type="date"
                  required
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Compound security lighting replacement"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {submitting ? 'Saving to Supabase...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
