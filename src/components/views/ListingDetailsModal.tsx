import React, { useState } from 'react';
import {
  X,
  MapPin,
  Calendar,
  Users,
  Bed,
  Bath,
  CheckCircle2,
  DollarSign,
  Shield,
  Clock,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertCircle,
  FileText,
  KeyRound,
  Info,
} from 'lucide-react';
import { AccommodationListing, ShortStayReservation } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface ListingDetailsModalProps {
  listing: AccommodationListing | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenAuthModal?: () => void;
}

export const ListingDetailsModal: React.FC<ListingDetailsModalProps> = ({
  listing,
  isOpen,
  onClose,
  onOpenAuthModal,
}) => {
  const { currentUser } = useAuth();

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<'details' | 'book_stay' | 'inquiry'>('details');

  // Booking Form State
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [guestCount, setGuestCount] = useState(1);
  const [guestName, setGuestName] = useState(currentUser?.fullName || '');
  const [guestEmail, setGuestEmail] = useState(currentUser?.email || '');
  const [guestPhone, setGuestPhone] = useState(currentUser?.phone || '');
  const [specialRequests, setSpecialRequests] = useState('');
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<ShortStayReservation | null>(null);
  const [bookingError, setBookingError] = useState('');

  // Inquiry Form State
  const [inquiryType, setInquiryType] = useState<'viewing_request' | 'general_inquiry' | 'lease_application'>('viewing_request');
  const [preferredDate, setPreferredDate] = useState('');
  const [inquiryMessage, setInquiryMessage] = useState('');
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [inquirySuccess, setInquirySuccess] = useState(false);
  const [inquiryError, setInquiryError] = useState('');

  if (!isOpen || !listing) return null;

  const images = listing.images && listing.images.length > 0
    ? listing.images
    : ['https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80'];

  // Price calculation helper
  const calculateEstimate = () => {
    if (!checkIn || !checkOut) return null;
    const inDate = new Date(checkIn);
    const outDate = new Date(checkOut);
    if (isNaN(inDate.getTime()) || isNaN(outDate.getTime()) || inDate >= outDate) return null;

    const nights = Math.max(1, Math.round((outDate.getTime() - inDate.getTime()) / (1000 * 60 * 60 * 24)));
    const subtotal = nights * listing.nightlyRate;
    const serviceFee = Math.round(subtotal * 0.05);
    const cleaningFee = listing.cleaningFee || 35000;
    const total = subtotal + serviceFee + cleaningFee;

    return { nights, subtotal, serviceFee, cleaningFee, total };
  };

  const estimate = calculateEstimate();

  const handleBookReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    setBookingError('');
    setBookingLoading(true);

    try {
      const resp = await fetch('/api/marketplace/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: listing.id,
          propertyId: listing.propertyId,
          checkIn,
          checkOut,
          guestName,
          guestEmail,
          guestPhone,
          guestCount,
          specialRequests,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'Failed to submit reservation request.');
      }

      setBookingSuccess(data.reservation);
    } catch (err: any) {
      setBookingError(err.message || 'Booking submission failed. Please verify dates.');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleSendInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setInquiryError('');
    setInquiryLoading(true);

    try {
      const resp = await fetch('/api/marketplace/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId: listing.id,
          propertyId: listing.propertyId,
          name: guestName || 'Prospective Tenant',
          email: guestEmail,
          phone: guestPhone,
          inquiryType,
          preferredDate: preferredDate || null,
          message: inquiryMessage || `Inquiry regarding ${listing.title}`,
        }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || 'Failed to send inquiry.');
      }

      setInquirySuccess(true);
    } catch (err: any) {
      setInquiryError(err.message || 'Inquiry submission failed.');
    } finally {
      setInquiryLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden my-6 max-h-[92vh] flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-900/90 sticky top-0 z-20">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-blue-500/15 px-2 py-0.5 text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                {(listing.category || 'stay').replace(/_/g, ' ')}
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-300 font-medium">{listing.propertyName}</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5 line-clamp-1">
              {listing.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Image Gallery Carousel */}
          <div className="relative w-full h-64 sm:h-80 rounded-xl overflow-hidden bg-slate-950 group">
            <img
              src={images[activeImageIdx]}
              alt={listing.title}
              className="w-full h-full object-cover transition duration-300"
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setActiveImageIdx((prev) => (prev === 0 ? images.length - 1 : prev - 1))}
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/70 text-white hover:bg-slate-900 transition backdrop-blur-sm opacity-90 group-hover:opacity-100"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveImageIdx((prev) => (prev === images.length - 1 ? 0 : prev + 1))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-slate-950/70 text-white hover:bg-slate-900 transition backdrop-blur-sm opacity-90 group-hover:opacity-100"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <div className="absolute bottom-3 right-3 rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                  {activeImageIdx + 1} / {images.length}
                </div>
              </>
            )}
          </div>

          {/* Quick Specifications Pill Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <MapPin className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase">Location</p>
                <p className="text-xs font-bold text-white line-clamp-1">{listing.city}</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase">
                  {listing.stayType === 'monthly' ? 'Monthly Rent' : 'Nightly Rate'}
                </p>
                <p className="text-xs font-bold text-emerald-400">
                  {listing.currency} {listing.stayType === 'monthly' ? listing.monthlyRent.toLocaleString() : listing.nightlyRate.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                <Bed className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase">Rooms & Beds</p>
                <p className="text-xs font-bold text-white">
                  {listing.bedrooms} Bed • {listing.bathrooms} Bath
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-950/60 border border-slate-800/80 p-3 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-medium uppercase">Max Guests</p>
                <p className="text-xs font-bold text-white">{listing.maxGuests} Guests</p>
              </div>
            </div>
          </div>

          {/* Action Navigation Tabs */}
          <div className="flex border-b border-slate-800 gap-4">
            <button
              onClick={() => setActiveTab('details')}
              className={`pb-2.5 text-xs font-bold transition border-b-2 ${
                activeTab === 'details'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              Overview & Amenities
            </button>
            {listing.stayType !== 'monthly' && (
              <button
                onClick={() => setActiveTab('book_stay')}
                className={`pb-2.5 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
                  activeTab === 'book_stay'
                    ? 'border-blue-500 text-blue-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Book Short Stay</span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('inquiry')}
              className={`pb-2.5 text-xs font-bold transition border-b-2 flex items-center gap-1.5 ${
                activeTab === 'inquiry'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Schedule Viewing / Inquiry</span>
            </button>
          </div>

          {/* Tab 1: Overview & Amenities */}
          {activeTab === 'details' && (
            <div className="space-y-6 animate-in fade-in">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Description
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed">{listing.description}</p>
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Full Address: {listing.address}, {listing.city}, {listing.country}</span>
                </p>
              </div>

              {/* Pricing Structure Card */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Transparent Pricing Structure
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {listing.nightlyRate > 0 && (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                      <span className="text-slate-400 block text-[10px]">Short-Stay Rate</span>
                      <span className="font-bold text-white text-sm">
                        {listing.currency} {listing.nightlyRate.toLocaleString()}
                      </span>
                      <span className="text-slate-400 text-[10px]"> / night</span>
                    </div>
                  )}
                  {listing.monthlyRent > 0 && (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                      <span className="text-slate-400 block text-[10px]">Long-Term Rent</span>
                      <span className="font-bold text-white text-sm">
                        {listing.currency} {listing.monthlyRent.toLocaleString()}
                      </span>
                      <span className="text-slate-400 text-[10px]"> / month</span>
                    </div>
                  )}
                  {listing.depositAmount > 0 && (
                    <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80">
                      <span className="text-slate-400 block text-[10px]">Security Deposit</span>
                      <span className="font-bold text-white text-sm">
                        {listing.currency} {listing.depositAmount.toLocaleString()}
                      </span>
                      <span className="text-slate-400 text-[10px]"> (Refundable)</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Amenities */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                  Property & Room Amenities
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {listing.amenities.map((amenity, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-lg bg-slate-950/50 border border-slate-800 px-3 py-2 text-xs text-slate-300"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      <span>{amenity}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* House Rules */}
              {listing.houseRules && listing.houseRules.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                    House Rules & Policies
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {listing.houseRules.map((rule, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Book Short Stay */}
          {activeTab === 'book_stay' && (
            <div className="space-y-6 animate-in fade-in">
              {bookingSuccess ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-6 text-center space-y-3">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">Reservation Request Submitted!</h3>
                  <p className="text-xs text-slate-300 max-w-md mx-auto">
                    Your reservation has been created with reference{' '}
                    <span className="font-mono font-bold text-emerald-400">{bookingSuccess.bookingReference}</span>.
                    The host has been notified to confirm availability.
                  </p>
                  <div className="rounded-lg bg-slate-900 border border-slate-800 p-3 max-w-sm mx-auto text-left text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Stay Duration:</span>
                      <span className="text-white font-medium">{bookingSuccess.nights} nights ({bookingSuccess.checkIn} to {bookingSuccess.checkOut})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Estimated Total:</span>
                      <span className="text-emerald-400 font-bold">{bookingSuccess.currency} {bookingSuccess.totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleBookReservation} className="space-y-4">
                  {bookingError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-2.5 text-xs text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{bookingError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Check-in Date
                      </label>
                      <input
                        type="date"
                        required
                        value={checkIn}
                        onChange={(e) => setCheckIn(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Check-out Date
                      </label>
                      <input
                        type="date"
                        required
                        value={checkOut}
                        onChange={(e) => setCheckOut(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Guests
                      </label>
                      <input
                        type="number"
                        min="1"
                        max={listing.maxGuests || 4}
                        required
                        value={guestCount}
                        onChange={(e) => setGuestCount(Number(e.target.value))}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Guest Full Name
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="John Doe"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="+256 700 000000"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Email Address (for booking voucher)
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="john@example.com"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Special Requests / Notes (Optional)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Late check-in arrival around 8 PM, extra towels..."
                      value={specialRequests}
                      onChange={(e) => setSpecialRequests(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  {/* Estimated Price Breakdown */}
                  {estimate && (
                    <div className="rounded-xl border border-blue-500/20 bg-blue-950/20 p-4 space-y-2">
                      <div className="flex justify-between text-xs text-slate-300">
                        <span>{listing.currency} {listing.nightlyRate.toLocaleString()} × {estimate.nights} nights</span>
                        <span>{listing.currency} {estimate.subtotal.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Platform Service Fee (5%)</span>
                        <span>{listing.currency} {estimate.serviceFee.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>Cleaning Fee</span>
                        <span>{listing.currency} {estimate.cleaningFee.toLocaleString()}</span>
                      </div>
                      <div className="border-t border-slate-800 pt-2 flex justify-between text-sm font-bold text-white">
                        <span>Total Estimated Cost</span>
                        <span className="text-emerald-400">{listing.currency} {estimate.total.toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg bg-slate-950/40 border border-slate-800/80 p-3 flex items-start gap-2.5 text-xs text-slate-400">
                    <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                    <span>
                      Payment authorization is confirmed upon host approval. No money is deducted automatically until availability is verified on the server.
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={bookingLoading}
                    className="w-full rounded-xl bg-blue-600 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 transition disabled:opacity-50"
                  >
                    {bookingLoading ? 'Checking Availability & Reserving...' : 'Submit Short-Stay Booking Request'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* Tab 3: Viewing Request / Inquiry */}
          {activeTab === 'inquiry' && (
            <div className="space-y-6 animate-in fade-in">
              {inquirySuccess ? (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-6 text-center space-y-2">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">Viewing Request Received</h3>
                  <p className="text-xs text-slate-300 max-w-sm mx-auto">
                    The property management team has received your message. You will be contacted at {guestPhone || guestEmail} to confirm the viewing schedule.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSendInquiry} className="space-y-4">
                  {inquiryError && (
                    <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 px-4 py-2.5 text-xs text-rose-300">
                      {inquiryError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Inquiry Purpose
                      </label>
                      <select
                        value={inquiryType}
                        onChange={(e: any) => setInquiryType(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      >
                        <option value="viewing_request">Physical Property Viewing</option>
                        <option value="lease_application">Long-term Lease Application</option>
                        <option value="general_inquiry">General Question / Availability</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Preferred Viewing Date (Optional)
                      </label>
                      <input
                        type="date"
                        value={preferredDate}
                        onChange={(e) => setPreferredDate(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Your Full Name</label>
                      <input
                        type="text"
                        required
                        placeholder="John Doe"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Phone Number</label>
                      <input
                        type="tel"
                        required
                        placeholder="+256 700 000000"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Email</label>
                      <input
                        type="email"
                        required
                        placeholder="john@example.com"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Message / Questions
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="I would like to schedule a physical walkthrough this weekend. Are utilities included?"
                      value={inquiryMessage}
                      onChange={(e) => setInquiryMessage(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-xs text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={inquiryLoading}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition disabled:opacity-50"
                  >
                    {inquiryLoading ? 'Submitting Inquiry...' : 'Submit Inquiry & Schedule Viewing'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
