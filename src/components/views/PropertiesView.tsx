import React, { useState } from 'react';
import {
  Building2,
  Plus,
  Home,
  CheckCircle2,
  XCircle,
  Tag,
  DollarSign,
  MapPin,
  Trash2,
  Edit,
  Layers,
  AlertCircle,
  Globe,
  PauseCircle,
} from 'lucide-react';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { Property, Unit, UnitType, PropertyType } from '../../types';

export const PropertiesView: React.FC = () => {
  const { currentUser } = useAuth();
  const { properties, addProperty, deleteProperty, addUnit, deleteUnit, updateUnitListingStatus } = useProperty();

  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(
    properties[0]?.id || ''
  );
  const [filterVacancy, setFilterVacancy] = useState<'all' | 'available' | 'occupied'>('all');

  // Modals
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);
  const [propError, setPropError] = useState('');
  const [unitError, setUnitError] = useState('');
  const [submittingProp, setSubmittingProp] = useState(false);
  const [submittingUnit, setSubmittingUnit] = useState(false);

  // New Property Form State
  const [newPropName, setNewPropName] = useState('');
  const [newPropAddress, setNewPropAddress] = useState('');
  const [newPropCity, setNewPropCity] = useState('Kampala');
  const [newPropCurrency, setNewPropCurrency] = useState('UGX');
  const [newPropType, setNewPropType] = useState<PropertyType>('residential');

  // New Unit Form State
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitType, setNewUnitType] = useState<UnitType>('apartment');
  const [newUnitRent, setNewUnitRent] = useState('');
  const [newUnitDeposit, setNewUnitDeposit] = useState('');
  const [newUnitFloor, setNewUnitFloor] = useState('1st');

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) || properties[0];

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setPropError('');
    if (!newPropName || !newPropAddress) {
      setPropError('Please provide property name and address.');
      return;
    }

    setSubmittingProp(true);
    try {
      const created = await addProperty({
        landlordId: currentUser?.id || 'usr-landlord-001',
        name: newPropName,
        address: newPropAddress,
        city: newPropCity,
        country: 'Uganda',
        currency: newPropCurrency,
        propertyType: newPropType,
        buildings: [],
        units: [],
      });
      setSelectedPropertyId(created.id);
      setShowAddPropertyModal(false);
      setNewPropName('');
      setNewPropAddress('');
    } catch (err: any) {
      setPropError(err?.message || 'Unable to save property. Please check your connection and try again.');
    } finally {
      setSubmittingProp(false);
    }
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnitError('');
    if (!newUnitNumber || !newUnitRent || !selectedProperty) {
      setUnitError('Please fill in unit number and monthly rent.');
      return;
    }

    setSubmittingUnit(true);
    try {
      await addUnit(selectedProperty.id, {
        unitNumber: newUnitNumber,
        unitType: newUnitType,
        monthlyRent: Number(newUnitRent),
        depositAmount: Number(newUnitDeposit || newUnitRent),
        floor: newUnitFloor,
        status: 'available',
      });
      setShowAddUnitModal(false);
      setNewUnitNumber('');
      setNewUnitRent('');
      setNewUnitDeposit('');
    } catch (err: any) {
      setUnitError(err?.message || 'Unable to save unit. Please check your connection and try again.');
    } finally {
      setSubmittingUnit(false);
    }
  };

  const handleListingStatus = async (unit: Unit) => {
    if (!selectedProperty) return;
    setUnitError('');
    try {
      await updateUnitListingStatus(selectedProperty.id, unit.id, unit.listingStatus === 'published' ? 'paused' : 'published');
    } catch (err: any) {
      setUnitError(err?.message || 'Could not update the marketplace listing.');
    }
  };

  const filteredUnits = (selectedProperty?.units || []).filter((u) => {
    if (filterVacancy === 'all') return true;
    return u.status === filterVacancy;
  });

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Property & Unit Management
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure multi-building estates, residential flats, commercial shops, and track unit vacancies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddPropertyModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Property</span>
          </button>
        </div>
      </div>

      {/* Property Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {properties.map((prop) => (
          <button
            key={prop.id}
            onClick={() => setSelectedPropertyId(prop.id)}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold whitespace-nowrap transition-all border ${
              selectedProperty?.id === prop.id
                ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Building2 className="w-4 h-4 text-blue-400" />
            <span>{prop.name}</span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
              {prop.units?.length || 0} units
            </span>
          </button>
        ))}
      </div>

      {properties.length === 0 ? (
        <div className="py-16 rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/10 text-blue-400 border border-blue-500/20 mb-4">
            <Building2 className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-white">No Properties Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-5">
            Your live Supabase database is connected and ready. Click below to add your first rental property or estate.
          </p>
          <button
            onClick={() => setShowAddPropertyModal(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/25"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Property</span>
          </button>
        </div>
      ) : selectedProperty && (
        <div className="space-y-6">
          {/* Property Info Bar */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">{selectedProperty.name}</h2>
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-400 uppercase border border-blue-500/20">
                    {selectedProperty.propertyType}
                  </span>
                </div>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-slate-500" />
                  <span>
                    {selectedProperty.address}, {selectedProperty.city}, {selectedProperty.country}
                  </span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddUnitModal(true)}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition"
                >
                  <Plus className="w-3.5 h-3.5 text-blue-400" />
                  <span>Add Unit / Room</span>
                </button>
              </div>
            </div>

            {/* Quick Stats on this property */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-800/80 text-xs">
              <div>
                <span className="text-slate-400 text-[11px]">Total Units</span>
                <p className="text-sm font-bold text-white mt-0.5">
                  {selectedProperty.units?.length || 0}
                </p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Occupied</span>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">
                  {(selectedProperty.units || []).filter((u) => u.status === 'occupied').length}
                </p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Vacant Units</span>
                <p className="text-sm font-bold text-amber-400 mt-0.5">
                  {(selectedProperty.units || []).filter((u) => u.status === 'available').length}
                </p>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Monthly Rent Roll</span>
                <p className="text-sm font-bold text-blue-400 mt-0.5">
                  {selectedProperty.currency}{' '}
                  {(selectedProperty.units || [])
                    .reduce((sum, u) => sum + Number(u.monthlyRent), 0)
                    .toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Units Header & Vacancy Filter */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              Units & Spaces ({filteredUnits.length})
            </h3>

            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs font-medium">
              <button
                onClick={() => setFilterVacancy('all')}
                className={`px-2.5 py-1 rounded-md transition ${
                  filterVacancy === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterVacancy('available')}
                className={`px-2.5 py-1 rounded-md transition ${
                  filterVacancy === 'available' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Vacant Only
              </button>
              <button
                onClick={() => setFilterVacancy('occupied')}
                className={`px-2.5 py-1 rounded-md transition ${
                  filterVacancy === 'occupied' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                Occupied Only
              </button>
            </div>
          </div>

          {/* Units Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredUnits.map((unit) => (
              <div
                key={unit.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl hover:border-slate-700 transition"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-base font-bold text-white">{unit.unitNumber}</h4>
                    <span className="inline-block mt-0.5 text-[11px] font-semibold text-slate-400 uppercase">
                      Type: {unit.unitType}
                    </span>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      unit.status === 'occupied'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {unit.status}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Marketplace</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${unit.listingStatus === 'published' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : unit.listingStatus === 'paused' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-slate-700 bg-slate-800 text-slate-400'}`}>
                    {unit.listingStatus || 'draft'}
                  </span>
                </div>

                <div className="mt-4 space-y-2 border-t border-slate-800/80 pt-3 text-xs">
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Monthly Rent:</span>
                    <span className="font-bold text-white">
                      {selectedProperty.currency} {unit.monthlyRent.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span className="text-slate-500">Deposit:</span>
                    <span>
                      {selectedProperty.currency} {unit.depositAmount.toLocaleString()}
                    </span>
                  </div>
                  {unit.floor && (
                    <div className="flex justify-between text-slate-300">
                      <span className="text-slate-500">Floor Level:</span>
                      <span>{unit.floor}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
                  <button
                    onClick={() => void handleListingStatus(unit)}
                    disabled={unit.status !== 'available' && unit.listingStatus !== 'published'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-2.5 py-2 text-[10px] font-bold text-blue-200 transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
                    title={unit.status !== 'available' ? 'Only available units can be published' : 'Update marketplace visibility'}
                  >
                    {unit.listingStatus === 'published' ? <PauseCircle className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                    {unit.listingStatus === 'published' ? 'Pause listing' : 'Publish listing'}
                  </button>
                  <button
                    onClick={() => deleteUnit(selectedProperty.id, unit.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                    title="Delete unit"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Property Modal */}
      {showAddPropertyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white">Create New Property</h3>
            <p className="text-xs text-slate-400 mt-1">Add a new rental estate or commercial property</p>

            {propError && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{propError}</span>
              </div>
            )}

            <form onSubmit={handleCreateProperty} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Property Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hilltop Heights Apartments"
                  value={newPropName}
                  onChange={(e) => setNewPropName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Street Address</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Plot 15, Naguru Drive"
                  value={newPropAddress}
                  onChange={(e) => setNewPropAddress(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">City</label>
                  <input
                    type="text"
                    value={newPropCity}
                    onChange={(e) => setNewPropCity(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Currency</label>
                  <input
                    type="text"
                    value={newPropCurrency}
                    onChange={(e) => setNewPropCurrency(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Property Type</label>
                <select
                  value={newPropType}
                  onChange={(e) => setNewPropType(e.target.value as PropertyType)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                >
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="hostel">Student Hostel</option>
                  <option value="mixed">Mixed Use</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddPropertyModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingProp}
                  className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {submittingProp ? 'Saving to Supabase...' : 'Create Property'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Unit Modal */}
      {showAddUnitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white">Add Unit to {selectedProperty.name}</h3>
            <p className="text-xs text-slate-400 mt-1">Configure rental space parameters</p>

            {unitError && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{unitError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUnit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Unit Number / Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Unit 3B, Room 12, Shop G-04"
                  value={newUnitNumber}
                  onChange={(e) => setNewUnitNumber(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Unit Type</label>
                  <select
                    value={newUnitType}
                    onChange={(e) => setNewUnitType(e.target.value as UnitType)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  >
                    <option value="apartment">Apartment</option>
                    <option value="room">Room / Single</option>
                    <option value="house">Stand-alone House</option>
                    <option value="office">Office</option>
                    <option value="shop">Shop</option>
                    <option value="commercial">Commercial Space</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Floor</label>
                  <input
                    type="text"
                    placeholder="e.g. 2nd Floor"
                    value={newUnitFloor}
                    onChange={(e) => setNewUnitFloor(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Monthly Rent ({selectedProperty.currency})
                  </label>
                  <input
                    type="number"
                    required
                    placeholder="e.g. 750000"
                    value={newUnitRent}
                    onChange={(e) => setNewUnitRent(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Security Deposit ({selectedProperty.currency})
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 750000"
                    value={newUnitDeposit}
                    onChange={(e) => setNewUnitDeposit(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddUnitModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingUnit}
                  className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {submittingUnit ? 'Saving to Supabase...' : 'Add Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
