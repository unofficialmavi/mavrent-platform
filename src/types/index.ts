export type UserRole = 'landlord' | 'tenant' | 'property_manager' | 'admin' | 'guest';

export type PropertyType =
  | 'residential'
  | 'commercial'
  | 'mixed'
  | 'hostel'
  | 'hotel'
  | 'motel'
  | 'serviced_apartment'
  | 'guesthouse'
  | 'vacation_rental';

export type AccommodationCategory =
  | 'apartment'
  | 'house'
  | 'room'
  | 'studio'
  | 'hostel'
  | 'short_stay'
  | 'hotel'
  | 'motel'
  | 'serviced_apartment'
  | 'guesthouse'
  | 'commercial';

export type StayPricingType = 'monthly' | 'nightly' | 'both';

export type UnitType = 'room' | 'apartment' | 'house' | 'office' | 'shop' | 'commercial' | 'studio' | 'suite' | 'dorm_bed';

export type UnitStatus = 'available' | 'occupied' | 'maintenance' | 'reserved';

export type ListingStatus = 'draft' | 'pending_review' | 'published' | 'paused' | 'archived';

export type PaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'card' | 'other';

export type MaintenanceCategory = 'plumbing' | 'electrical' | 'structural' | 'appliance' | 'painting' | 'cleaning' | 'other';

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';

export type MaintenanceStatus = 'pending' | 'acknowledged' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';

export type ExpenseCategory = 'repairs' | 'utilities' | 'maintenance' | 'staff' | 'security' | 'cleaning' | 'taxes' | 'other';

export interface UserProfile {
  id: string;
  role: UserRole;
  fullName: string;
  phone: string;
  email: string;
  tenantCode?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Building {
  id: string;
  propertyId: string;
  name: string;
  floors: number;
}

export interface Unit {
  id: string;
  propertyId: string;
  buildingId?: string;
  unitNumber: string;
  unitType: UnitType;
  monthlyRent: number;
  depositAmount: number;
  floor?: string;
  status: UnitStatus;
  listingStatus?: ListingStatus;
  notes?: string;
  // Unified Accommodation Marketplace Attributes
  category?: AccommodationCategory;
  stayType?: StayPricingType;
  nightlyRate?: number;
  weeklyRate?: number;
  cleaningFee?: number;
  bedrooms?: number;
  bathrooms?: number;
  maxGuests?: number;
  amenities?: string[];
  images?: string[];
  houseRules?: string[];
  marketplaceStatus?: 'draft' | 'published' | 'paused' | 'archived';
}

export interface Property {
  id: string;
  landlordId: string;
  name: string;
  address: string;
  city: string;
  country: string;
  currency: string;
  propertyType: PropertyType;
  buildings?: Building[];
  units?: Unit[];
  createdAt: string;
}

export interface Tenant {
  id: string;
  propertyId: string;
  unitId: string;
  userId?: string;
  tenantCode: string; // e.g. MVR-92841A
  fullName: string;
  phone: string;
  email: string;
  startDate: string;
  endDate?: string;
  rentAmount: number;
  dueDay: number; // 1-31
  currentBalance: number; // Outstanding unpaid rent debt (SUM of unpaid rent_records balance >= 0)
  advanceCredit?: number; // Advance overpayment credit retained for future billing periods (>= 0)
  status: 'active' | 'pending' | 'expired' | 'terminated';
  emergencyContact?: {
    name: string;
    phone: string;
    relation: string;
  };
  createdAt: string;
}

export interface RentRecord {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  billingPeriod: string; // e.g. "2026-10"
  amountDue: number;
  amountPaid: number;
  balance: number;
  dueDate: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue';
  createdAt: string;
}

export interface Payment {
  id: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  referenceNumber: string;
  idempotencyKey?: string;
  receiptNumber: string;
  notes?: string;
  status: 'confirmed' | 'pending_verification' | 'reversed';
  createdBy?: string;
  createdAt: string;
}

export interface Receipt {
  id: string;
  paymentId: string;
  receiptNumber: string;
  tenantId: string;
  propertyId: string;
  unitId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  balanceAfter: number;
  issueDate: string;
  dataSnapshot: {
    tenantName: string;
    tenantCode: string;
    propertyName: string;
    unitNumber: string;
    landlordName: string;
    currency: string;
    referenceNumber: string;
    periodCovered?: string;
  };
}

export interface MaintenanceRequest {
  id: string;
  propertyId: string;
  unitId: string;
  tenantId: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  mediaUrls: string[];
  assignedWorker?: string;
  landlordNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  propertyId: string;
  unitId?: string;
  amount: number;
  category: ExpenseCategory;
  expenseDate: string;
  description: string;
  receiptAttachment?: string;
  createdBy?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  channel: 'in_app' | 'sms' | 'whatsapp';
  read: boolean;
  type: 'rent_due' | 'overdue' | 'payment_received' | 'maintenance_update' | 'care_alert' | 'system';
  createdAt: string;
}

export interface AiAuditLog {
  id: string;
  userId: string;
  actionType: string;
  riskLevel: 'read_only' | 'low_risk_write' | 'financial_write' | 'destructive';
  prompt: string;
  preparedAction?: any;
  executed: boolean;
  confirmedBy?: string;
  createdAt: string;
}

export interface ProposedAiAction {
  action: 'RECORD_PAYMENT' | 'CREATE_MAINTENANCE' | 'UPDATE_RENT' | 'CREATE_TENANT' | 'DELETE_ENTITY';
  riskLevel: 'read_only' | 'low_risk_write' | 'financial_write' | 'destructive';
  payload: any;
  summary: string;
  requiresConfirmation: boolean;
}

export interface ShortStayReservation {
  id: string;
  unitId: string;
  propertyId: string;
  guestId?: string;
  bookingReference: string; // e.g. "MVR-STAY-94812"
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  guestCount: number;
  nights: number;
  nightlyRate: number;
  serviceFee: number;
  cleaningFee: number;
  totalAmount: number;
  currency: string;
  specialRequests?: string;
  status: 'pending_confirmation' | 'confirmed' | 'cancelled' | 'completed';
  createdAt: string;
}

export interface MarketplaceInquiry {
  id: string;
  unitId: string;
  propertyId: string;
  userId?: string;
  name: string;
  email: string;
  phone: string;
  inquiryType: 'viewing_request' | 'general_inquiry' | 'lease_application' | 'booking_inquiry';
  preferredDate?: string;
  message: string;
  status: 'pending' | 'responded' | 'scheduled' | 'closed';
  createdAt: string;
}

export interface AccommodationListing {
  id: string; // Unit ID
  propertyId: string;
  landlordId: string;
  title: string;
  propertyName: string;
  address: string;
  city: string;
  country: string;
  currency: string;
  propertyType: PropertyType;
  category: AccommodationCategory;
  stayType: StayPricingType;
  unitType: UnitType;
  unitNumber: string;
  monthlyRent: number;
  depositAmount: number;
  nightlyRate: number;
  weeklyRate?: number;
  cleaningFee: number;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  floor?: string;
  amenities: string[];
  images: string[];
  houseRules: string[];
  description: string;
  marketplaceStatus: 'draft' | 'published' | 'paused' | 'archived';
  occupancyStatus: UnitStatus;
  createdAt: string;
}
