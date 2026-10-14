import React, { useEffect, useMemo, useState } from 'react';
import { Search, MapPin, BedDouble, Bath, ArrowUpRight, RefreshCw, Home, ShieldCheck } from 'lucide-react';

type Listing = {
  id: string;
  propertyId: string;
  title: string;
  description: string;
  unitType: string;
  bedrooms: number;
  bathrooms: number;
  monthlyRent: number;
  depositAmount: number;
  currency: string;
  furnished: boolean;
  availableFrom: string | null;
  property: {
    id: string;
    name: string;
    description?: string;
    address?: string;
    area?: string;
    district?: string;
    city?: string;
    country?: string;
    property_type?: string;
    cover_image_url?: string | null;
  } | null;
  media: { media_url: string; media_type: string }[];
};

interface MarketplaceViewProps {
  onSignIn: () => void;
}

const formatRent = (amount: number, currency: string) =>
  new Intl.NumberFormat('en-UG', { style: 'currency', currency: currency || 'UGX', maximumFractionDigits: 0 }).format(amount);

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({ onSignIn }) => {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');

  const loadListings = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/marketplace/listings');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load rental listings.');
      setListings(Array.isArray(result.listings) ? result.listings : []);
    } catch (err: any) {
      setError(err?.message || 'Unable to load rental listings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadListings(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return listings.filter((listing) => {
      const p = listing.property;
      const matchesQuery = !query || [
        listing.title, listing.description, p?.name, p?.address, p?.area, p?.district, p?.city, listing.unitType,
      ].some((value) => String(value || '').toLowerCase().includes(query));
      const matchesType = type === 'all' || String(listing.unitType || '').toLowerCase() === type ||
        String(p?.property_type || '').toLowerCase() === type;
      return matchesQuery && matchesType;
    });
  }, [listings, search, type]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <section className="relative overflow-hidden border-b border-slate-800/80">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/40 via-slate-950 to-slate-950" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300">
                <Home className="h-3.5 w-3.5" /> Find your next place
              </div>
              <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
                A better way to <span className="text-blue-400">find home.</span>
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-slate-300 sm:text-base">
                Explore rental homes, rooms, hostels and commercial spaces. Find a place that fits your needs and connect with the property manager.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-400" /> Listings published by property managers</span>
                <span>•</span><span>Built for Uganda</span>
              </div>
            </div>
            <button onClick={onSignIn} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500">
              Manage my rental <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-10 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-3 shadow-2xl sm:grid-cols-[1fr_210px_auto]">
            <label className="flex items-center gap-3 rounded-xl bg-slate-950 px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search area, district, property or unit..." className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500" />
            </label>
            <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none">
              <option value="all">All rental types</option>
              <option value="room">Rooms</option>
              <option value="hostel">Hostels</option>
              <option value="apartment">Apartments</option>
              <option value="house">Houses</option>
              <option value="office">Offices</option>
              <option value="shop">Shops</option>
            </select>
            <button onClick={() => void loadListings()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white sm:text-2xl">Available rentals</h2>
            <p className="mt-1 text-sm text-slate-400">Browse published properties and contact their managers.</p>
          </div>
          {!loading && <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-300">{filtered.length} listing{filtered.length === 1 ? '' : 's'}</span>}
        </div>

        {error && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-200"><span>{error}</span><button onClick={() => void loadListings()} className="font-bold underline">Try again</button></div>}

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((n) => <div key={n} className="animate-pulse overflow-hidden rounded-2xl border border-slate-800 bg-slate-900"><div className="h-48 bg-slate-800" /><div className="space-y-3 p-5"><div className="h-4 w-2/3 rounded bg-slate-800" /><div className="h-3 w-1/2 rounded bg-slate-800" /><div className="h-8 rounded bg-slate-800" /></div></div>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 px-6 py-16 text-center">
            <Home className="mx-auto h-9 w-9 text-slate-500" />
            <h3 className="mt-4 text-base font-bold text-white">{error ? 'Listings could not be loaded' : 'No matching rentals yet'}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">{error ? 'Please try again in a moment.' : 'Try another search, or check back soon as property managers publish more vacancies.'}</p>
            {!error && <button onClick={() => { setSearch(''); setType('all'); }} className="mt-4 rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">Clear filters</button>}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((listing) => {
              const p = listing.property;
              const image = listing.media?.find((m) => m.media_type === 'image')?.media_url || p?.cover_image_url;
              return (
                <article key={listing.id} className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 transition hover:-translate-y-1 hover:border-blue-500/40 hover:shadow-xl hover:shadow-blue-950/30">
                  <div className="relative h-52 overflow-hidden bg-gradient-to-br from-blue-950 via-slate-800 to-indigo-950">
                    {image ? <img src={image} alt={listing.title} loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center"><Home className="h-12 w-12 text-blue-300/50" /></div>}
                    <span className="absolute left-3 top-3 rounded-full border border-white/15 bg-slate-950/80 px-3 py-1 text-[11px] font-bold capitalize text-white backdrop-blur">{listing.unitType || 'Rental'}</span>
                  </div>
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div><h3 className="text-base font-bold text-white">{listing.title}</h3><p className="mt-1 text-xs text-slate-400">{p?.name || 'Rental property'}</p></div>
                      <div className="shrink-0 text-right"><p className="text-sm font-extrabold text-blue-300">{formatRent(listing.monthlyRent, listing.currency)}</p><p className="text-[10px] text-slate-500">per month</p></div>
                    </div>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400"><MapPin className="h-3.5 w-3.5 shrink-0" />{[p?.area, p?.district, p?.city].filter(Boolean).join(', ') || p?.address || 'Uganda'}</p>
                    {listing.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-400">{listing.description}</p>}
                    <div className="mt-4 flex items-center gap-4 border-t border-slate-800 pt-4 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1.5"><BedDouble className="h-4 w-4" />{listing.bedrooms} bed</span>
                      <span className="inline-flex items-center gap-1.5"><Bath className="h-4 w-4" />{listing.bathrooms} bath</span>
                      {listing.furnished && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300">Furnished</span>}
                    </div>
                    <button onClick={onSignIn} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/40 bg-blue-500/10 px-4 py-2.5 text-xs font-bold text-blue-200 transition hover:bg-blue-600 hover:text-white">Inquire / request viewing <ArrowUpRight className="h-3.5 w-3.5" /></button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <footer className="border-t border-slate-800 px-4 py-8 text-center text-xs text-slate-500">MavRent Platform · Rental discovery and property management</footer>
    </div>
  );
};
