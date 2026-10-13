import React, { useState } from 'react';
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Building,
  UserCheck,
  UserX,
  CreditCard,
  Shield,
  Zap,
} from 'lucide-react';
import { useProperty } from '../../context/PropertyContext';
import { Tenant } from '../../types';

interface TenantsViewProps {
  onOpenRecordPaymentForTenant?: (tenantId: string) => void;
}

export const TenantsView: React.FC<TenantsViewProps> = ({ onOpenRecordPaymentForTenant }) => {
  const { properties, tenants, addTenant, terminateTenant, applyAdvanceCredit } = useProperty();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'overdue'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [applyingCreditId, setApplyingCreditId] = useState<string | null>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPropertyId, setSelectedPropertyId] = useState(properties[0]?.id || '');
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDay, setDueDay] = useState(1);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  // Available vacant units for selected property
  const selectedProp = properties.find((p) => p.id === selectedPropertyId);
  const availableUnits = (selectedProp?.units || []).filter(
    (u) => u.status === 'available' || u.status === 'reserved'
  );

  const handlePropertyChange = (propId: string) => {
    setSelectedPropertyId(propId);
    const prop = properties.find((p) => p.id === propId);
    const vacant = (prop?.units || []).filter((u) => u.status === 'available');
    if (vacant.length > 0) {
      setSelectedUnitId(vacant[0].id);
      setRentAmount(vacant[0].monthlyRent.toString());
    } else {
      setSelectedUnitId('');
      setRentAmount('');
    }
  };

  const handleUnitChange = (unitId: string) => {
    setSelectedUnitId(unitId);
    const unit = selectedProp?.units?.find((u) => u.id === unitId);
    if (unit) {
      setRentAmount(unit.monthlyRent.toString());
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!fullName || !phone || !selectedPropertyId || !selectedUnitId || !rentAmount) {
      setFormError('Please fill in all required lease fields.');
      return;
    }

    setSubmitting(true);
    try {
      await addTenant({
        propertyId: selectedPropertyId,
        unitId: selectedUnitId,
        fullName,
        phone,
        email,
        startDate,
        rentAmount: Number(rentAmount),
        dueDay: Number(dueDay),
        status: 'active',
        emergencyContact: emergencyName
          ? { name: emergencyName, phone: emergencyPhone, relation: 'Emergency' }
          : undefined,
      });

      setShowAddModal(false);
      setFullName('');
      setPhone('');
      setEmail('');
      setEmergencyName('');
      setEmergencyPhone('');
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save tenant. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.tenantCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.phone.includes(searchQuery);

    if (!matchesSearch) return false;

    if (statusFilter === 'active') return t.status === 'active';
    if (statusFilter === 'overdue') return t.currentBalance > 0;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Tenant Directory & Leases
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage lease agreements, unique tenant codes (MVR-XXXXXX), and rent balances.
          </p>
        </div>

        <button
          onClick={() => {
            handlePropertyChange(properties[0]?.id || '');
            setShowAddModal(true);
          }}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Assign New Tenant</span>
        </button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name, code (MVR-), or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl bg-slate-900 border border-slate-800 py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs font-medium w-full sm:w-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-md transition ${
              statusFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            All Tenants ({tenants.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-md transition ${
              statusFilter === 'active' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setStatusFilter('overdue')}
            className={`flex-1 sm:flex-none px-3 py-1 rounded-md transition ${
              statusFilter === 'overdue' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Overdue ({tenants.filter((t) => t.currentBalance > 0).length})
          </button>
        </div>
      </div>

      {/* Tenants Table / Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTenants.map((tenant) => {
          const prop = properties.find((p) => p.id === tenant.propertyId);
          const unit = prop?.units?.find((u) => u.id === tenant.unitId);
          const isOverdue = tenant.currentBalance > 0;

          return (
            <div
              key={tenant.id}
              className={`rounded-2xl border p-5 backdrop-blur-xl transition ${
                isOverdue
                  ? 'border-rose-900/50 bg-rose-950/10 hover:border-rose-800/80'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-white">{tenant.fullName}</h3>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                      {tenant.tenantCode}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase rounded-md px-1.5 py-0.5 ${
                        tenant.status === 'active'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {tenant.status}
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Outstanding Debt
                  </span>
                  <p
                    className={`text-sm font-extrabold ${
                      isOverdue ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {prop?.currency || 'UGX'} {tenant.currentBalance.toLocaleString()}
                  </p>
                  {(tenant.advanceCredit || 0) > 0 && (
                    <span className="mt-0.5 inline-block text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                      Credit: {prop?.currency || 'UGX'} {tenant.advanceCredit?.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Property & Unit info */}
              <div className="mt-4 rounded-xl bg-slate-950/70 p-3 text-xs space-y-1.5 border border-slate-800/80">
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Property:</span>
                  <span className="font-semibold text-white">{prop?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Assigned Unit:</span>
                  <span className="font-semibold text-white">{unit?.unitNumber || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Monthly Rent:</span>
                  <span>
                    {prop?.currency || 'UGX'} {tenant.rentAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-500">Due Day:</span>
                  <span>Day {tenant.dueDay} of month</span>
                </div>
                {tenant.advanceCredit && tenant.advanceCredit > 0 ? (
                  <div className="flex justify-between text-emerald-400 font-semibold">
                    <span className="text-emerald-500/80">Advance Credit:</span>
                    <span>{prop?.currency || 'UGX'} {tenant.advanceCredit.toLocaleString()}</span>
                  </div>
                ) : null}
              </div>

              {/* Contact info */}
              <div className="mt-3 text-xs space-y-1 text-slate-400">
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500" />
                  <span>{tenant.phone}</span>
                </p>
                {tenant.email && (
                  <p className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    <span>{tenant.email}</span>
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">
                  Since: {new Date(tenant.startDate).toLocaleDateString()}
                </span>

                <div className="flex items-center gap-2">
                  {tenant.advanceCredit && tenant.advanceCredit > 0 && tenant.currentBalance > 0 && (
                    <button
                      disabled={applyingCreditId === tenant.id}
                      onClick={async () => {
                        setApplyingCreditId(tenant.id);
                        await applyAdvanceCredit(tenant.id);
                        setApplyingCreditId(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2 py-1 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-600/30 transition disabled:opacity-50"
                      title="Apply advance credit to outstanding balance"
                    >
                      <Zap className="w-3 h-3" />
                      <span>{applyingCreditId === tenant.id ? 'Applying...' : 'Apply Credit'}</span>
                    </button>
                  )}
                  {onOpenRecordPaymentForTenant && (
                    <button
                      onClick={() => onOpenRecordPaymentForTenant(tenant.id)}
                      className="p-1.5 text-slate-500 hover:text-blue-400 transition"
                      title="Record Payment for Tenant"
                    >
                      <CreditCard className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => terminateTenant(tenant.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 transition"
                    title="Terminate / Vacate Lease"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredTenants.length === 0 && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-12 text-center backdrop-blur-xl">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-3">
            <Users className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No tenants recorded yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-5">
            Assign your first tenant to a vacant unit to start tracking leases, generating rent invoices, and recording payments.
          </p>
          <button
            onClick={() => {
              handlePropertyChange(properties[0]?.id || '');
              setShowAddModal(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Assign First Tenant</span>
          </button>
        </div>
      )}

      {/* Assign Tenant Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 my-8">
            <h3 className="text-base font-bold text-white">Assign Tenant to Unit</h3>
            <p className="text-xs text-slate-400 mt-1">
              Creates lease record and generates official tenant code (MVR-XXXXXX)
            </p>

            {formError && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Full Legal Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Grace Nakato"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    placeholder="+256 700 000 000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Email Address</label>
                  <input
                    type="email"
                    placeholder="tenant@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Select Property</label>
                  <select
                    value={selectedPropertyId}
                    onChange={(e) => handlePropertyChange(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  >
                    {properties.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Select Available Unit</label>
                  <select
                    value={selectedUnitId}
                    onChange={(e) => handleUnitChange(e.target.value)}
                    required
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  >
                    {availableUnits.length === 0 ? (
                      <option value="">No vacant units in this property</option>
                    ) : (
                      availableUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unitNumber} ({u.unitType} - UGX {u.monthlyRent.toLocaleString()})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Monthly Rent</label>
                  <input
                    type="number"
                    required
                    value={rentAmount}
                    onChange={(e) => setRentAmount(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Due Day (1-31)</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={dueDay}
                    onChange={(e) => setDueDay(Number(e.target.value))}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Lease Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Emergency Contact Name</label>
                  <input
                    type="text"
                    placeholder="e.g. John K. (Brother)"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={availableUnits.length === 0 || submitting}
                  className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-40 transition flex items-center gap-1.5"
                >
                  {submitting ? 'Saving to Supabase...' : 'Save & Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
