export type UserRole = 'landlord' | 'tenant' | 'property_manager' | 'admin';

export type PropertyType = 'residential' | 'commercial' | 'mixed' | 'hostel';

export type UnitType = 'room' | 'apartment' | 'house' | 'office' | 'shop' | 'commercial';

export type UnitStatus = 'available' | 'occupied' | 'maintenance' | 'reserved';

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
  notes?: string;
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
