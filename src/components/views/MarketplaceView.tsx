import React, { useState, useEffect } from 'react';
import {
  Search,
  SlidersHorizontal,
  MapPin,
  Calendar,
  Users,
  Bed,
  Bath,
  Heart,
  Star,
  CheckCircle2,
  DollarSign,
  Building2,
  Home,
  Sparkles,
  ArrowRight,
  Filter,
  RefreshCw,
  Info,
} from 'lucide-react';
import { AccommodationListing, AccommodationCategory, StayPricingType } from '../../types';
import { ListingDetailsModal } from './ListingDetailsModal';
import { useAuth } from '../../context/AuthContext';

export const MarketplaceView: React.FC = () => {
  const { role } = useAuth();

  const [listings, setListings] = useState<AccommodationListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStayType, setSelectedStayType] = useState<string>('all');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [minGuests, setMinGuests] = useState<number>(0);
  const [minBedrooms, setMinBedrooms] = useState<number>(0);
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);

  // Favorites
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('mavrent_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [viewFavoritesOnly, setViewFavoritesOnly] = useState(false);

  // Modal State
  const [selectedListing, setSelectedListing] = useState<AccommodationListing | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchListings = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.set('category', selectedCategory);
      if (selectedStayType !== 'all') params.set('stayType', selectedStayType);
      if (searchQuery.trim()) params.set('city', searchQuery.trim());
      if (minPrice) params.set('minPrice', minPrice);
      if (maxPrice) params.set('maxPrice', maxPrice);
      if (minGuests > 0) params.set('guests', String(minGuests));

      const resp = await fetch(`/api/marketplace/listings?${params.toString()}`);
      if (!resp.ok) {
        throw new Error(`Failed to load listings (Status ${resp.status})`);
      }
      const data = await resp.json();
      setListings(data.listings || []);
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve marketplace listings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchListings();
  }, [selectedCategory, selectedStayType]);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const updated = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
      try {
        localStorage.setItem('mavrent_favorites', JSON.stringify(updated));
      } catch {
        // storage fallback
      }
      return updated;
    });
  };

  const categories: { id: string; label: string; icon: string }[] = [
    { id: 'all', label: 'All Stays & Rentals', icon: '✨' },
    { id: 'apartment', label: 'Apartments & Flats', icon: '🏢' },
    { id: 'short_stay', label: 'Short-Stay & Stays', icon: '🌴' },
    { id: 'hotel', label: 'Hotels & Motels', icon: '🏨' },
    { id: 'serviced_apartment', label: 'Serviced Aparthotels', icon: '🛎️' },
    { id: 'hostel', label: 'Hostels & Student Housing', icon: '🎓' },
    { id: 'guesthouse', label: 'Guesthouses & Lodges', icon: '🏡' },
    { id: 'commercial', label: 'Commercial Spaces', icon: '💼' },
  ];

  const filteredListings = listings.filter((l) => {
    if (viewFavoritesOnly && !favorites.includes(l.id)) return false;
    if (minBedrooms > 0 && l.bedrooms < minBedrooms) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        l.title.toLowerCase().includes(q) ||
        l.propertyName.toLowerCase().includes(q) ||
        l.city.toLowerCase().includes(q) ||
        l.address.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Hero Marketplace Banner */}
      <div className="relative rounded-3xl bg-gradient-to-r from-slate-900 via-blue-950/80 to-slate-900 border border-slate-800 p-6 sm:p-8 overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(59,130,246,0.18),rgba(255,255,255,0))]" />
        
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-bold text-blue-400 ring-1 ring-blue-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>MavRent Accommodation Marketplace</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Discover Verified Stays, Apartments & Hospitality
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
            From short-stay vacation villas and executive hotel suites to student hostels and long-term residential leases. Backed by verified landlords and secure ledger tracking.
          </p>

          {/* Quick Search Bar */}
          <div className="pt-2">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                fetchListings();
              }}
              className="flex flex-col sm:flex-row items-center gap-2 rounded-2xl bg-slate-950/90 border border-slate-700/80 p-2 shadow-xl"
            >
              <div className="flex flex-1 items-center gap-2.5 px-3 py-1.5 w-full">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Search city, neighborhood (e.g. Kololo, Kampala, Entebbe)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={selectedStayType}
                  onChange={(e) => setSelectedStayType(e.target.value)}
                  className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none"
                >
                  <option value="all">Any Stay Duration</option>
                  <option value="nightly">Short-Stay (Nightly)</option>
                  <option value="monthly">Long-Term (Monthly)</option>
                </select>

                <button
                  type="button"
                  onClick={() => setShowFiltersDrawer(!showFiltersDrawer)}
                  className={`rounded-xl p-2 text-xs font-semibold border transition flex items-center gap-1.5 ${
                    showFiltersDrawer || minPrice || maxPrice || minGuests > 0 || minBedrooms > 0
                      ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                  title="More Filters"
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>

                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/30 hover:bg-blue-500 transition shrink-0"
                >
                  Search
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Advanced Filters Expandable Drawer */}
      {showFiltersDrawer && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-blue-400" />
              <span>Refine Search Criteria</span>
            </h3>
            <button
              onClick={() => {
                setMinPrice('');
                setMaxPrice('');
                setMinGuests(0);
                setMinBedrooms(0);
                setSelectedStayType('all');
                setSelectedCategory('all');
              }}
              className="text-xs text-blue-400 hover:underline"
            >
              Reset Filters
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Min Price (UGX)</label>
              <input
                type="number"
                placeholder="e.g. 50000"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Max Price (UGX)</label>
              <input
                type="number"
                placeholder="e.g. 3000000"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Min Bedrooms</label>
              <select
                value={minBedrooms}
                onChange={(e) => setMinBedrooms(Number(e.target.value))}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="0">Any Bedrooms</option>
                <option value="1">1+ Bedrooms</option>
                <option value="2">2+ Bedrooms</option>
                <option value="3">3+ Bedrooms</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1">Min Guests</label>
              <select
                value={minGuests}
                onChange={(e) => setMinGuests(Number(e.target.value))}
                className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-white focus:outline-none"
              >
                <option value="0">Any Guest Count</option>
                <option value="1">1+ Guest</option>
                <option value="2">2+ Guests</option>
                <option value="4">4+ Guests</option>
                <option value="6">6+ Guests</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Category Pills Carousel */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all ${
              selectedCategory === cat.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'bg-slate-900/90 text-slate-400 border border-slate-800/80 hover:text-white hover:bg-slate-800'
            }`}
          >
            <span>{cat.icon}</span>
            <span>{cat.label}</span>
          </button>
        ))}

        <div className="h-5 w-px bg-slate-800 shrink-0 mx-1" />

        <button
          onClick={() => setViewFavoritesOnly(!viewFavoritesOnly)}
          className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-all ${
            viewFavoritesOnly
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30'
              : 'bg-slate-900/90 text-slate-400 border border-slate-800/80 hover:text-rose-400'
          }`}
        >
          <Heart className={`w-3.5 h-3.5 ${viewFavoritesOnly ? 'fill-white' : ''}`} />
          <span>Saved ({favorites.length})</span>
        </button>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-slate-400">
        <p>
          Showing <span className="font-bold text-white">{filteredListings.length}</span> accommodations available
        </p>
        <button
          onClick={() => fetchListings()}
          className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-semibold"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Listings Grid */}
      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center text-center space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-500 border-t-transparent" />
          <p className="text-xs text-slate-400">Retrieving accommodations and verified rates...</p>
        </div>
      ) : filteredListings.length === 0 ? (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-slate-400">
            <Home className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Matching Accommodations Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {viewFavoritesOnly
              ? "You haven't saved any listings to your favorites yet. Click the heart icon on any accommodation to save it."
              : 'Try relaxing your search query or selecting a different category filter.'}
          </p>
          <button
            onClick={() => {
              setSelectedCategory('all');
              setSelectedStayType('all');
              setSearchQuery('');
              setViewFavoritesOnly(false);
            }}
            className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-500 transition mt-2"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredListings.map((listing) => {
            const isFav = favorites.includes(listing.id);
            const heroImage = listing.images && listing.images.length > 0
              ? listing.images[0]
              : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80';

            return (
              <div
                key={listing.id}
                onClick={() => {
                  setSelectedListing(listing);
                  setIsModalOpen(true);
                }}
                className="group cursor-pointer rounded-2xl bg-slate-900 border border-slate-800/80 hover:border-slate-700 shadow-xl overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-blue-900/10 flex flex-col"
              >
                {/* Image Container with Badges */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-950">
                  <img
                    src={heroImage}
                    alt={listing.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />

                  {/* Top Overlay Badges */}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    <span className="rounded-lg bg-slate-950/80 backdrop-blur-md px-2.5 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                      {listing.category.replace('_', ' ')}
                    </span>
                    {listing.stayType === 'both' ? (
                      <span className="rounded-lg bg-blue-600/90 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white">
                        Nightly & Monthly
                      </span>
                    ) : listing.stayType === 'nightly' ? (
                      <span className="rounded-lg bg-emerald-600/90 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white">
                        Short Stay
                      </span>
                    ) : (
                      <span className="rounded-lg bg-indigo-600/90 backdrop-blur-md px-2 py-1 text-[10px] font-bold text-white">
                        Long Term
                      </span>
                    )}
                  </div>

                  {/* Favorite Toggle Button */}
                  <button
                    onClick={(e) => toggleFavorite(listing.id, e)}
                    className="absolute top-3 right-3 p-2 rounded-full bg-slate-950/70 text-white hover:scale-110 transition backdrop-blur-md"
                  >
                    <Heart className={`w-4 h-4 ${isFav ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
                  </button>

                  {/* Bottom Image Gradient Price Bar */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent p-4 flex items-end justify-between">
                    <div>
                      {listing.stayType !== 'monthly' && listing.nightlyRate > 0 ? (
                        <div>
                          <span className="text-base sm:text-lg font-black text-white">
                            {listing.currency} {listing.nightlyRate.toLocaleString()}
                          </span>
                          <span className="text-slate-300 text-xs"> / night</span>
                        </div>
                      ) : (
                        <div>
                          <span className="text-base sm:text-lg font-black text-white">
                            {listing.currency} {listing.monthlyRent.toLocaleString()}
                          </span>
                          <span className="text-slate-300 text-xs"> / month</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-full bg-slate-900/90 px-2 py-0.5 text-[10px] font-bold text-slate-300 border border-slate-700">
                      {listing.city}
                    </div>
                  </div>
                </div>

                {/* Card Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <p className="text-xs text-blue-400 font-semibold">{listing.propertyName}</p>
                    <h3 className="text-sm font-bold text-white tracking-tight line-clamp-1 group-hover:text-blue-400 transition">
                      {listing.title}
                    </h3>
                    <p className="text-xs text-slate-400 line-clamp-2 mt-1">{listing.description}</p>
                  </div>

                  {/* Attributes Summary */}
                  <div className="border-t border-slate-800/80 pt-3 flex items-center justify-between text-xs text-slate-300">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Bed className="w-3.5 h-3.5 text-slate-400" />
                        <span>{listing.bedrooms} bds</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Bath className="w-3.5 h-3.5 text-slate-400" />
                        <span>{listing.bathrooms} ba</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{listing.maxGuests} max</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-blue-400 font-bold group-hover:translate-x-0.5 transition">
                      <span>Explore</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Listing Details & Booking Modal */}
      <ListingDetailsModal
        listing={selectedListing}
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedListing(null);
        }}
      />
    </div>
  );
};
