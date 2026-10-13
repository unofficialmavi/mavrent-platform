import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  Property,
  Building,
  Unit,
  Tenant,
  RentRecord,
  Payment,
  Receipt,
  MaintenanceRequest,
  Expense,
  NotificationItem,
  AiAuditLog,
  ProposedAiAction,
  PaymentMethod,
  MaintenanceStatus,
  ExpenseCategory,
  UnitType,
} from '../types';
import { useAuth } from './AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface PropertyContextType {
  properties: Property[];
  buildings: Building[];
  units: Unit[];
  tenants: Tenant[];
  rentRecords: RentRecord[];
  payments: Payment[];
  receipts: Receipt[];
  maintenanceRequests: MaintenanceRequest[];
  expenses: Expense[];
  notifications: NotificationItem[];
  aiAuditLogs: AiAuditLog[];
  activeReceipt: Receipt | null;
  setActiveReceipt: (receipt: Receipt | null) => void;
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;
  lastSyncedAt: string | null;
  // Property Actions
  addProperty: (property: Omit<Property, 'id' | 'createdAt'>) => Promise<Property>;
  updateProperty: (id: string, updates: Partial<Property>) => Promise<void>;
  deleteProperty: (id: string) => Promise<void>;
  // Unit Actions
  addUnit: (propertyId: string, unit: Omit<Unit, 'id' | 'propertyId'>) => Promise<Unit>;
  updateUnit: (propertyId: string, unitId: string, updates: Partial<Unit>) => Promise<void>;
  deleteUnit: (propertyId: string, unitId: string) => Promise<void>;
  // Tenant Actions
  addTenant: (tenant: Omit<Tenant, 'id' | 'tenantCode' | 'createdAt' | 'currentBalance'>) => Promise<Tenant>;
  updateTenant: (id: string, updates: Partial<Tenant>) => Promise<void>;
  terminateTenant: (id: string) => Promise<void>;
  // Rent & Payment Engine
  recordPayment: (paymentData: {
    tenantId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNumber?: string;
    notes?: string;
    paymentDate?: string;
  }) => Promise<{ success: boolean; receipt?: Receipt; error?: string }>;
  confirmPayment: (paymentId: string) => Promise<{ success: boolean; receipt?: Receipt; error?: string }>;
  applyAdvanceCredit: (tenantId: string, rentRecordId?: string) => Promise<{ success: boolean; totalApplied?: number; error?: string }>;
  requestTenantOtp: (tenantCode: string, phone: string) => Promise<{ success: boolean; status?: string; message?: string; error?: string }>;
  verifyTenantOtp: (otp: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  // Maintenance Actions
  createMaintenanceRequest: (request: Omit<MaintenanceRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>) => Promise<MaintenanceRequest>;
  updateMaintenanceStatus: (id: string, status: MaintenanceStatus, notes?: string, worker?: string) => Promise<void>;
  // Expense Actions
  addExpense: (expense: Omit<Expense, 'id' | 'createdAt'>) => Promise<Expense>;
  deleteExpense: (id: string) => Promise<void>;
  // Notification Actions
  markNotificationRead: (id: string) => Promise<void>;
  sendNotification: (notification: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => Promise<void>;
  // Care Mode Automation
  runCareModeAutomation: () => Promise<{ remindersSent: number; overdueAlerts: number }>;
  // Mav AI Action Dispatcher
  executeAiAction: (action: ProposedAiAction, promptText: string) => Promise<{ success: boolean; message: string }>;
  // Refresh & Stats
  refreshPortfolio: () => Promise<void>;
  getPortfolioMetrics: () => {
    totalProperties: number;
    totalUnits: number;
    occupiedUnits: number;
    vacantUnits: number;
    occupancyRate: number;
    expectedRent: number;
    collectedRent: number;
    outstandingRent: number;
    overdueRent: number;
    totalExpenses: number;
    netOperatingIncome: number;
    pendingMaintenanceCount: number;
  };
}

const PropertyContext = createContext<PropertyContextType | undefined>(undefined);

export const PropertyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, role } = useAuth();

  const [properties, setProperties] = useState<Property[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rentRecords, setRentRecords] = useState<RentRecord[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [aiAuditLogs, setAiAuditLogs] = useState<AiAuditLog[]>([]);
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const isMountedRef = useRef<boolean>(true);

  // Helper to retrieve auth bearer token
  const getAuthToken = async (): Promise<string> => {
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        return session?.access_token || '';
      } catch {
        return '';
      }
    }
    return '';
  };

  // Helper for authenticated API calls
  const authFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
    const token = await getAuthToken();
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, { ...options, headers });
  };

  // Authoritative data sync from Supabase
  const refreshPortfolio = async () => {
    if (!isMountedRef.current) return;
    setIsSyncing(true);
    setSyncError(null);

    try {
      const response = await authFetch('/api/data/portfolio');

      if (!response.ok) {
        throw new Error(`Failed to retrieve portfolio (Status ${response.status})`);
      }

      const data = await response.json();

      if (data.success && isMountedRef.current) {
        // Map raw database units
        const rawUnits = data.units || [];
        const rawBuildings = data.buildings || [];

        // Map database properties
        const mappedProps: Property[] = (data.properties || []).map((p: any) => {
          const propUnits: Unit[] = rawUnits
            .filter((u: any) => u.property_id === p.id)
            .map((u: any) => ({
              id: u.id,
              propertyId: u.property_id,
              buildingId: u.building_id || undefined,
              unitNumber: u.title || u.unit_number || 'Unit',
              unitType: (u.unit_type as UnitType) || 'apartment',
              monthlyRent: Number(u.monthly_rent || 0),
              depositAmount: Number(u.deposit_amount || 0),
              floor: u.floor || undefined,
              status: (u.status === 'rented' ? 'occupied' : u.status === 'published' ? 'available' : u.status === 'paused' ? 'maintenance' : u.status === 'draft' ? 'reserved' : (u.status || 'available')),
              notes: u.notes || u.description || '',
            }));

          const propBuildings: Building[] = rawBuildings
            .filter((b: any) => b.property_id === p.id)
            .map((b: any) => ({
              id: b.id,
              propertyId: b.property_id,
              name: b.name,
              floors: Number(b.floors || 1),
            }));

          return {
            id: p.id,
            landlordId: p.landlord_id || p.owner_id || p.ownerId || '',
            name: p.name,
            address: p.address,
            city: p.city || 'Kampala',
            country: p.country || 'Uganda',
            currency: p.currency || 'UGX',
            propertyType: p.property_type || 'residential',
            buildings: propBuildings,
            units: propUnits,
            createdAt: p.created_at,
          };
        });

        // Map tenants
        const mappedTenants: Tenant[] = (data.tenants || []).map((t: any) => ({
          id: t.id,
          propertyId: t.property_id,
          unitId: t.unit_id,
          userId: t.user_id || undefined,
          tenantCode: t.tenant_code,
          fullName: t.full_name,
          phone: t.phone,
          email: t.email || '',
          startDate: t.start_date,
          endDate: t.end_date || undefined,
          rentAmount: Number(t.rent_amount || 0),
          dueDay: Number(t.due_day || 1),
          currentBalance: Number(t.current_balance || 0),
          advanceCredit: Number(t.advance_credit || 0),
          status: t.status || 'active',
          emergencyContact: t.emergency_contact || undefined,
          createdAt: t.created_at,
        }));

        // Map rent records
        const mappedRentRecords: RentRecord[] = (data.rentRecords || []).map((r: any) => ({
          id: r.id,
          tenantId: r.tenant_id,
          propertyId: r.property_id,
          unitId: r.unit_id,
          billingPeriod: r.billing_period,
          amountDue: Number(r.amount_due || 0),
          amountPaid: Number(r.amount_paid || 0),
          balance: Number(r.balance || 0),
          dueDate: r.due_date,
          status: r.status || 'pending',
          createdAt: r.created_at,
        }));

        // Map payments
        const mappedPayments: Payment[] = (data.payments || []).map((pay: any) => ({
          id: pay.id,
          tenantId: pay.tenant_id,
          propertyId: pay.property_id,
          unitId: pay.unit_id,
          amount: Number(pay.amount || 0),
          paymentDate: pay.payment_date,
          paymentMethod: pay.payment_method || 'cash',
          referenceNumber: pay.reference_number || '',
          idempotencyKey: pay.idempotency_key || undefined,
          receiptNumber: pay.receipt_number,
          notes: pay.notes || '',
          status: pay.status || 'confirmed',
          createdBy: pay.created_by || undefined,
          createdAt: pay.created_at,
        }));

        // Map receipts
        const mappedReceipts: Receipt[] = (data.receipts || []).map((rcp: any) => ({
          id: rcp.id,
          paymentId: rcp.payment_id,
          receiptNumber: rcp.receipt_number,
          tenantId: rcp.tenant_id,
          propertyId: rcp.property_id,
          unitId: rcp.unit_id,
          amount: Number(rcp.amount || 0),
          paymentMethod: rcp.payment_method || 'cash',
          balanceAfter: Number(rcp.balance_after || 0),
          issueDate: rcp.issue_date,
          dataSnapshot: rcp.data_snapshot || {},
        }));

        // Map maintenance requests
        const mappedMaintenance: MaintenanceRequest[] = (data.maintenanceRequests || []).map((m: any) => ({
          id: m.id,
          propertyId: m.property_id,
          unitId: m.unit_id,
          tenantId: m.tenant_id,
          title: m.title,
          description: m.description,
          category: m.category || 'other',
          priority: m.priority || 'medium',
          status: m.status || 'pending',
          mediaUrls: Array.isArray(m.media_urls) ? m.media_urls : [],
          assignedWorker: m.assigned_worker || undefined,
          landlordNotes: m.landlord_notes || undefined,
          createdAt: m.created_at,
          updatedAt: m.updated_at,
        }));

        // Map expenses
        const mappedExpenses: Expense[] = (data.expenses || []).map((e: any) => ({
          id: e.id,
          propertyId: e.property_id,
          unitId: e.unit_id || undefined,
          amount: Number(e.amount || 0),
          category: e.category || 'other',
          expenseDate: e.expense_date,
          description: e.description,
          receiptAttachment: e.receipt_attachment || undefined,
          createdBy: e.created_by || undefined,
          createdAt: e.created_at,
        }));

        // Map notifications
        const mappedNotifications: NotificationItem[] = (data.notifications || []).map((n: any) => ({
          id: n.id,
          userId: n.user_id,
          title: n.title,
          message: n.message,
          channel: n.channel || 'in_app',
          read: Boolean(n.read),
          type: n.notification_type || 'system',
          createdAt: n.created_at,
        }));

        setProperties(mappedProps);
        setBuildings(rawBuildings);
        setTenants(mappedTenants);
        setRentRecords(mappedRentRecords);
        setPayments(mappedPayments);
        setReceipts(mappedReceipts);
        setMaintenanceRequests(mappedMaintenance);
        setExpenses(mappedExpenses);
        setNotifications(mappedNotifications);
        setLastSyncedAt(new Date().toLocaleTimeString());
      }
    } catch (err: any) {
      console.warn('Portfolio sync warning:', err);
      if (isMountedRef.current) {
        setSyncError(err.message || 'Could not synchronize with Supabase.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setIsSyncing(false);
      }
    }
  };

  // Initial load when currentUser or role changes
  useEffect(() => {
    isMountedRef.current = true;
    refreshPortfolio();
    return () => {
      isMountedRef.current = false;
    };
  }, [currentUser?.id, role]);

  // Real-time Supabase Subscriptions with automatic cleanup
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    // Single unified realtime channel for the portfolio
    const realtimeChannel = supabase
      .channel('mavrent_realtime_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'properties' }, () => {
        refreshPortfolio();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, () => {
        refreshPortfolio();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tenants' }, () => {
        refreshPortfolio();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rent_records' }, () => {
        refreshPortfolio();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
        refreshPortfolio();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts' }, () => {
        refreshPortfolio();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_requests' }, () => {
        refreshPortfolio();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
        refreshPortfolio();
      })
      .subscribe();

    return () => {
      if (supabase && realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  // 1. ADD PROPERTY -> Persisted to Supabase
  const addProperty = async (propData: Omit<Property, 'id' | 'createdAt'>): Promise<Property> => {
    const res = await authFetch('/api/data/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: propData.name,
        address: propData.address,
        city: propData.city,
        country: propData.country,
        currency: propData.currency || 'UGX',
        propertyType: propData.propertyType,
        ownerId: currentUser?.id,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save property to Supabase');
    }

    const json = await res.json();
    const createdProp: Property = {
      id: json.property.id,
      landlordId: json.property.landlord_id || json.property.owner_id || currentUser?.id || '',
      name: json.property.name,
      address: json.property.address,
      city: json.property.city,
      country: json.property.country,
      currency: json.property.currency || 'UGX',
      propertyType: json.property.property_type,
      buildings: [],
      units: [],
      createdAt: json.property.created_at,
    };

    setProperties((prev) => [createdProp, ...prev]);
    return createdProp;
  };

  // 2. UPDATE PROPERTY -> Persisted to Supabase
  const updateProperty = async (id: string, updates: Partial<Property>) => {
    const previous = properties;
    // Optimistic update
    setProperties((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));

    try {
      const res = await authFetch(`/api/data/properties/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update property in Supabase');
      }
    } catch (err: any) {
      // Rollback on failure
      setProperties(previous);
      throw err;
    }
  };

  // 3. DELETE PROPERTY -> Persisted to Supabase
  const deleteProperty = async (id: string) => {
    const previous = properties;
    setProperties((prev) => prev.filter((p) => p.id !== id));

    try {
      const res = await authFetch(`/api/data/properties/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete property from Supabase');
      }
    } catch (err: any) {
      setProperties(previous);
      throw err;
    }
  };

  // 4. ADD UNIT -> Persisted to Supabase
  const addUnit = async (propertyId: string, unitData: Omit<Unit, 'id' | 'propertyId'>): Promise<Unit> => {
    const res = await authFetch('/api/data/units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId,
        unitNumber: unitData.unitNumber,
        title: unitData.unitNumber,
        unitType: unitData.unitType,
        monthlyRent: unitData.monthlyRent,
        depositAmount: unitData.depositAmount,
        currency: 'UGX',
        floor: unitData.floor,
        notes: unitData.notes,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save unit to Supabase');
    }

    const json = await res.json();
    const createdUnit: Unit = {
      id: json.unit.id,
      propertyId,
      unitNumber: json.unit.title || json.unit.unit_number || unitData.unitNumber,
      unitType: (json.unit.unit_type as UnitType) || 'apartment',
      monthlyRent: Number(json.unit.monthly_rent || 0),
      depositAmount: Number(json.unit.deposit_amount || 0),
      floor: json.unit.floor || unitData.floor,
      status: 'available',
      notes: json.unit.notes || unitData.notes,
    };

    setProperties((prev) =>
      prev.map((prop) => {
        if (prop.id === propertyId) {
          return { ...prop, units: [...(prop.units || []), createdUnit] };
        }
        return prop;
      })
    );
    return createdUnit;
  };

  // 5. UPDATE UNIT -> Persisted to Supabase
  const updateUnit = async (propertyId: string, unitId: string, updates: Partial<Unit>) => {
    const previous = properties;
    setProperties((prev) =>
      prev.map((prop) => {
        if (prop.id === propertyId) {
          return {
            ...prop,
            units: (prop.units || []).map((u) => (u.id === unitId ? { ...u, ...updates } : u)),
          };
        }
        return prop;
      })
    );

    try {
      const res = await authFetch(`/api/data/units/${unitId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update unit in Supabase');
      }
    } catch (err: any) {
      setProperties(previous);
      throw err;
    }
  };

  // 6. DELETE UNIT -> Persisted to Supabase
  const deleteUnit = async (propertyId: string, unitId: string) => {
    const previous = properties;
    setProperties((prev) =>
      prev.map((prop) => {
        if (prop.id === propertyId) {
          return {
            ...prop,
            units: (prop.units || []).filter((u) => u.id !== unitId),
          };
        }
        return prop;
      })
    );

    try {
      const res = await authFetch(`/api/data/units/${unitId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete unit from Supabase');
      }
    } catch (err: any) {
      setProperties(previous);
      throw err;
    }
  };

  // 7. ASSIGN TENANT -> Persisted to Supabase
  const addTenant = async (tenantData: Omit<Tenant, 'id' | 'tenantCode' | 'createdAt' | 'currentBalance'>): Promise<Tenant> => {
    const res = await authFetch('/api/data/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyId: tenantData.propertyId,
        unitId: tenantData.unitId,
        fullName: tenantData.fullName,
        phone: tenantData.phone,
        email: tenantData.email,
        startDate: tenantData.startDate,
        endDate: tenantData.endDate,
        rentAmount: tenantData.rentAmount,
        dueDay: tenantData.dueDay,
        emergencyContact: tenantData.emergencyContact,
        userId: tenantData.userId,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to register tenant in Supabase');
    }

    const json = await res.json();
    const createdTenant: Tenant = {
      id: json.tenant.id,
      propertyId: json.tenant.property_id,
      unitId: json.tenant.unit_id,
      userId: json.tenant.user_id || undefined,
      tenantCode: json.tenant.tenant_code,
      fullName: json.tenant.full_name,
      phone: json.tenant.phone,
      email: json.tenant.email || '',
      startDate: json.tenant.start_date,
      endDate: json.tenant.end_date || undefined,
      rentAmount: Number(json.tenant.rent_amount || 0),
      dueDay: Number(json.tenant.due_day || 1),
      currentBalance: Number(json.tenant.current_balance || json.tenant.rent_amount || 0),
      advanceCredit: Number(json.tenant.advance_credit || 0),
      status: 'active',
      emergencyContact: json.tenant.emergency_contact || undefined,
      createdAt: json.tenant.created_at,
    };

    setTenants((prev) => [createdTenant, ...prev]);

    // Mark unit occupied in properties state
    setProperties((prev) =>
      prev.map((p) => {
        if (p.id === tenantData.propertyId) {
          return {
            ...p,
            units: (p.units || []).map((u) => (u.id === tenantData.unitId ? { ...u, status: 'occupied' } : u)),
          };
        }
        return p;
      })
    );

    // Refresh rent records for the new tenant
    refreshPortfolio();
    return createdTenant;
  };

  // 8. UPDATE TENANT -> Persisted to Supabase
  const updateTenant = async (id: string, updates: Partial<Tenant>) => {
    const previous = tenants;
    setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));

    try {
      const res = await authFetch(`/api/data/tenants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update tenant in Supabase');
      }
    } catch (err: any) {
      setTenants(previous);
      throw err;
    }
  };

  // 9. TERMINATE TENANT -> Persisted to Supabase
  const terminateTenant = async (id: string) => {
    const previousTenants = tenants;
    const previousProperties = properties;

    const target = tenants.find((t) => t.id === id);
    if (!target) return;

    setTenants((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'terminated' } : t)));
    setProperties((prev) =>
      prev.map((p) => {
        if (p.id === target.propertyId) {
          return {
            ...p,
            units: (p.units || []).map((u) => (u.id === target.unitId ? { ...u, status: 'available' } : u)),
          };
        }
        return p;
      })
    );

    try {
      const res = await authFetch(`/api/data/tenants/${id}/terminate`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to terminate lease in Supabase');
      }
    } catch (err: any) {
      setTenants(previousTenants);
      setProperties(previousProperties);
      throw err;
    }
  };

  // 10. RECORD PAYMENT & RECEIPT -> Persisted to Supabase
  const recordPayment = async (paymentData: {
    tenantId: string;
    amount: number;
    paymentMethod: PaymentMethod;
    referenceNumber?: string;
    notes?: string;
    paymentDate?: string;
  }): Promise<{ success: boolean; receipt?: Receipt; error?: string }> => {
    try {
      const res = await authFetch('/api/data/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(paymentData),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'Failed to record payment in Supabase' };
      }

      const paymentRow = json.payment;
      const receiptRow = json.receipt;

      const newPayment: Payment = {
        id: paymentRow.id,
        tenantId: paymentRow.tenant_id,
        propertyId: paymentRow.property_id,
        unitId: paymentRow.unit_id,
        amount: Number(paymentRow.amount),
        paymentDate: paymentRow.payment_date,
        paymentMethod: paymentRow.payment_method,
        referenceNumber: paymentRow.reference_number,
        idempotencyKey: paymentRow.idempotency_key,
        receiptNumber: paymentRow.receipt_number,
        notes: paymentRow.notes || '',
        status: paymentRow.status || 'confirmed',
        createdAt: paymentRow.created_at,
      };

      setPayments((prev) => [newPayment, ...prev]);

      let newReceipt: Receipt | undefined = undefined;
      if (receiptRow) {
        newReceipt = {
          id: receiptRow.id,
          paymentId: receiptRow.payment_id,
          receiptNumber: receiptRow.receipt_number,
          tenantId: receiptRow.tenant_id,
          propertyId: receiptRow.property_id,
          unitId: receiptRow.unit_id,
          amount: Number(receiptRow.amount),
          paymentMethod: receiptRow.payment_method,
          balanceAfter: Number(receiptRow.balance_after),
          issueDate: receiptRow.issue_date,
          dataSnapshot: receiptRow.data_snapshot,
        };
        setReceipts((prev) => [newReceipt!, ...prev]);
        setActiveReceipt(newReceipt);
      }

      // Update tenant balance and advance credit in state ONLY if confirmed
      if (paymentRow.status === 'confirmed') {
        setTenants((prev) =>
          prev.map((t) => {
            if (t.id === paymentData.tenantId) {
              const allocated = Math.min(t.currentBalance, paymentData.amount);
              const remaining = paymentData.amount - allocated;
              return {
                ...t,
                currentBalance: Math.max(0, t.currentBalance - allocated),
                advanceCredit: (t.advanceCredit || 0) + (remaining > 0 ? remaining : 0),
              };
            }
            return t;
          })
        );
      }

      // Trigger full sync to reflect updated rent_records and balances
      refreshPortfolio();
      return { success: true, receipt: newReceipt };
    } catch (err: any) {
      return { success: false, error: err.message || 'Payment processing failed' };
    }
  };

  // 10b. CONFIRM TENANT PAYMENT CLAIM -> Persisted to Supabase
  const confirmPayment = async (
    paymentId: string
  ): Promise<{ success: boolean; receipt?: Receipt; error?: string }> => {
    try {
      const res = await authFetch(`/api/data/payments/${paymentId}/confirm`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'Failed to confirm payment in Supabase' };
      }

      if (json.receipt) {
        const receiptRow = json.receipt;
        const newReceipt: Receipt = {
          id: receiptRow.id,
          paymentId: receiptRow.payment_id,
          receiptNumber: receiptRow.receipt_number,
          tenantId: receiptRow.tenant_id,
          propertyId: receiptRow.property_id,
          unitId: receiptRow.unit_id,
          amount: Number(receiptRow.amount),
          paymentMethod: receiptRow.payment_method,
          balanceAfter: Number(receiptRow.balance_after),
          issueDate: receiptRow.issue_date,
          dataSnapshot: receiptRow.data_snapshot,
        };
        setActiveReceipt(newReceipt);
      }

      await refreshPortfolio();
      return { success: true, receipt: json.receipt };
    } catch (err: any) {
      return { success: false, error: err.message || 'Payment confirmation failed' };
    }
  };

  // 10b. APPLY ADVANCE CREDIT TO RENT RECORDS
  const applyAdvanceCredit = async (
    tenantId: string,
    rentRecordId?: string
  ): Promise<{ success: boolean; totalApplied?: number; error?: string }> => {
    try {
      const res = await authFetch(`/api/data/tenants/${tenantId}/apply-advance-credit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rentRecordId }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json.error || 'Failed to apply advance credit' };
      }

      await refreshPortfolio();
      return { success: true, totalApplied: json.totalApplied };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network exception while applying advance credit' };
    }
  };

  // 10c. REQUEST TENANT OTP -> Persisted to Supabase
  const requestTenantOtp = async (
    tenantCode: string,
    phone: string
  ): Promise<{ success: boolean; status?: string; message?: string; error?: string }> => {
    try {
      const res = await authFetch('/api/auth/tenant-link/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantCode, phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to request verification code' };
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Network exception' };
    }
  };

  // 10d. VERIFY TENANT OTP & LINK LEASE -> Persisted to Supabase
  const verifyTenantOtp = async (
    otp: string
  ): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const res = await authFetch('/api/auth/tenant-link/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Verification failed' };
      }
      await refreshPortfolio();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network exception' };
    }
  };

  // 11. CREATE MAINTENANCE REQUEST -> Persisted to Supabase
  const createMaintenanceRequest = async (
    requestData: Omit<MaintenanceRequest, 'id' | 'status' | 'createdAt' | 'updatedAt'>
  ): Promise<MaintenanceRequest> => {
    const res = await authFetch('/api/data/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create maintenance ticket in Supabase');
    }

    const json = await res.json();
    const created: MaintenanceRequest = {
      id: json.maintenanceRequest.id,
      propertyId: json.maintenanceRequest.property_id,
      unitId: json.maintenanceRequest.unit_id,
      tenantId: json.maintenanceRequest.tenant_id,
      title: json.maintenanceRequest.title,
      description: json.maintenanceRequest.description,
      category: json.maintenanceRequest.category,
      priority: json.maintenanceRequest.priority,
      status: json.maintenanceRequest.status,
      mediaUrls: json.maintenanceRequest.media_urls || [],
      assignedWorker: json.maintenanceRequest.assigned_worker || undefined,
      landlordNotes: json.maintenanceRequest.landlord_notes || undefined,
      createdAt: json.maintenanceRequest.created_at,
      updatedAt: json.maintenanceRequest.updated_at,
    };

    setMaintenanceRequests((prev) => [created, ...prev]);
    return created;
  };

  // 12. UPDATE MAINTENANCE STATUS -> Persisted to Supabase
  const updateMaintenanceStatus = async (id: string, status: MaintenanceStatus, notes?: string, worker?: string) => {
    const previous = maintenanceRequests;
    setMaintenanceRequests((prev) =>
      prev.map((req) => {
        if (req.id === id) {
          return {
            ...req,
            status,
            landlordNotes: notes !== undefined ? notes : req.landlordNotes,
            assignedWorker: worker !== undefined ? worker : req.assignedWorker,
            updatedAt: new Date().toISOString(),
          };
        }
        return req;
      })
    );

    try {
      const res = await authFetch(`/api/data/maintenance/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, landlordNotes: notes, assignedWorker: worker }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update maintenance request in Supabase');
      }
    } catch (err: any) {
      setMaintenanceRequests(previous);
      throw err;
    }
  };

  // 13. ADD EXPENSE -> Persisted to Supabase
  const addExpense = async (expenseData: Omit<Expense, 'id' | 'createdAt'>): Promise<Expense> => {
    const res = await authFetch('/api/data/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expenseData),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to save expense in Supabase');
    }

    const json = await res.json();
    const created: Expense = {
      id: json.expense.id,
      propertyId: json.expense.property_id,
      unitId: json.expense.unit_id || undefined,
      amount: Number(json.expense.amount),
      category: json.expense.category,
      expenseDate: json.expense.expense_date,
      description: json.expense.description,
      receiptAttachment: json.expense.receipt_attachment || undefined,
      createdBy: json.expense.created_by || undefined,
      createdAt: json.expense.created_at,
    };

    setExpenses((prev) => [created, ...prev]);
    return created;
  };

  // 14. DELETE EXPENSE -> Persisted to Supabase
  const deleteExpense = async (id: string) => {
    const previous = expenses;
    setExpenses((prev) => prev.filter((e) => e.id !== id));

    try {
      const res = await authFetch(`/api/data/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete expense from Supabase');
      }
    } catch (err: any) {
      setExpenses(previous);
      throw err;
    }
  };

  // 15. MARK NOTIFICATION READ -> Persisted to Supabase
  const markNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await authFetch(`/api/data/notifications/${id}/read`, { method: 'PATCH' });
    } catch (err) {
      console.warn('Could not mark notification read on server:', err);
    }
  };

  // 16. SEND NOTIFICATION -> Persisted to Supabase
  const sendNotification = async (notifData: Omit<NotificationItem, 'id' | 'createdAt' | 'read'>) => {
    try {
      const res = await authFetch('/api/data/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifData),
      });

      if (res.ok) {
        const json = await res.json();
        const created: NotificationItem = {
          id: json.notification.id,
          userId: json.notification.user_id,
          title: json.notification.title,
          message: json.notification.message,
          channel: json.notification.channel || 'in_app',
          read: Boolean(json.notification.read),
          type: json.notification.notification_type || 'system',
          createdAt: json.notification.created_at,
        };
        setNotifications((prev) => [created, ...prev]);
      }
    } catch (err) {
      console.warn('Could not persist notification to Supabase:', err);
    }
  };

  // CARE MODE AUTOMATION
  const runCareModeAutomation = async (): Promise<{ remindersSent: number; overdueAlerts: number }> => {
    let remindersCount = 0;
    let overdueCount = 0;
    const now = new Date();
    const currentDay = now.getDate();

    for (const tenant of tenants) {
      const property = properties.find((p) => p.id === tenant.propertyId);
      const currency = property?.currency || 'UGX';

      if (tenant.currentBalance > 0) {
        overdueCount++;
        await sendNotification({
          userId: currentUser?.id || 'usr-landlord-001',
          title: 'Care Mode Overdue Warning',
          message: `${tenant.fullName} has an overdue balance of ${currency} ${tenant.currentBalance.toLocaleString()}. Rent was due on day ${tenant.dueDay}.`,
          channel: 'in_app',
          type: 'overdue',
        });
      }

      const daysUntilDue = tenant.dueDay - currentDay;
      if (daysUntilDue >= 0 && daysUntilDue <= 3) {
        remindersCount++;
        await sendNotification({
          userId: tenant.userId || currentUser?.id || 'usr-tenant-001',
          title: 'Upcoming Rent Reminder',
          message: `Dear ${tenant.fullName}, your rent of ${currency} ${tenant.rentAmount.toLocaleString()} is due on the ${tenant.dueDay}th of this month.`,
          channel: 'in_app',
          type: 'rent_due',
        });
      }
    }

    return { remindersSent: remindersCount, overdueAlerts: overdueCount };
  };

  // MAV AI ACTION EXECUTOR
  const executeAiAction = async (
    proposed: ProposedAiAction,
    promptText: string
  ): Promise<{ success: boolean; message: string }> => {
    try {
      let resultMessage = '';

      if (proposed.action === 'RECORD_PAYMENT') {
        const payload = proposed.payload;
        let targetTenant = tenants.find((t) => t.id === payload.tenantId);
        if (!targetTenant && payload.tenantName) {
          targetTenant = tenants.find((t) =>
            t.fullName.toLowerCase().includes(payload.tenantName.toLowerCase())
          );
        }

        if (!targetTenant) {
          throw new Error(`Tenant "${payload.tenantName || payload.tenantId}" could not be located in database.`);
        }

        const res = await recordPayment({
          tenantId: targetTenant.id,
          amount: Number(payload.amount),
          paymentMethod: (payload.paymentMethod as PaymentMethod) || 'cash',
          referenceNumber: payload.referenceNumber || `MAV-AI-${Date.now()}`,
          notes: payload.notes || `Payment recorded via Mav AI copilot: ${promptText}`,
        });

        if (!res.success) {
          throw new Error(res.error || 'Failed to record payment');
        }
        resultMessage = `Successfully recorded payment of ${payload.amount.toLocaleString()} for ${targetTenant.fullName}. Receipt ${res.receipt?.receiptNumber} generated in Supabase!`;
      } else if (proposed.action === 'CREATE_MAINTENANCE') {
        const payload = proposed.payload;
        let tenant = tenants.find((t) => t.id === payload.tenantId) || tenants[0];
        if (!tenant) throw new Error('No tenant found for maintenance request.');
        await createMaintenanceRequest({
          propertyId: tenant.propertyId,
          unitId: tenant.unitId,
          tenantId: tenant.id,
          title: payload.title || 'Maintenance Request via Mav AI',
          description: payload.description || promptText,
          category: payload.category || 'other',
          priority: payload.priority || 'medium',
          mediaUrls: [],
        });
        resultMessage = `Maintenance request "${payload.title}" created successfully in Supabase!`;
      } else {
        resultMessage = `Executed action: ${proposed.action}`;
      }

      const auditLog: AiAuditLog = {
        id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        userId: currentUser?.id || 'usr-landlord-001',
        actionType: proposed.action,
        riskLevel: proposed.riskLevel,
        prompt: promptText,
        preparedAction: proposed,
        executed: true,
        confirmedBy: currentUser?.id,
        createdAt: new Date().toISOString(),
      };
      setAiAuditLogs((prev) => [auditLog, ...prev]);

      return { success: true, message: resultMessage };
    } catch (err: any) {
      return { success: false, message: err.message || 'Action execution failed' };
    }
  };

  // PORTFOLIO METRICS
  const getPortfolioMetrics = () => {
    let totalUnits = 0;
    let occupiedUnits = 0;
    let vacantUnits = 0;
    let expectedRent = 0;

    properties.forEach((prop) => {
      (prop.units || []).forEach((unit) => {
        totalUnits++;
        expectedRent += Number(unit.monthlyRent || 0);
        if (unit.status === 'occupied') {
          occupiedUnits++;
        } else {
          vacantUnits++;
        }
      });
    });

    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;

    let collectedRent = 0;
    payments.forEach((pay) => {
      if (pay.status === 'confirmed') {
        collectedRent += Number(pay.amount || 0);
      }
    });

    let outstandingRent = 0;
    let overdueRent = 0;
    tenants.forEach((t) => {
      if (t.currentBalance > 0) {
        outstandingRent += Number(t.currentBalance);
        overdueRent += Number(t.currentBalance);
      }
    });

    let totalExpenses = 0;
    expenses.forEach((e) => {
      totalExpenses += Number(e.amount || 0);
    });

    const netOperatingIncome = collectedRent - totalExpenses;

    const pendingMaintenanceCount = maintenanceRequests.filter(
      (m) => m.status === 'pending' || m.status === 'in_progress'
    ).length;

    return {
      totalProperties: properties.length,
      totalUnits,
      occupiedUnits,
      vacantUnits,
      occupancyRate,
      expectedRent,
      collectedRent,
      outstandingRent,
      overdueRent,
      totalExpenses,
      netOperatingIncome,
      pendingMaintenanceCount,
    };
  };

  return (
    <PropertyContext.Provider
      value={{
        properties,
        buildings,
        units: properties.flatMap((p) => p.units || []),
        tenants,
        rentRecords,
        payments,
        receipts,
        maintenanceRequests,
        expenses,
        notifications,
        aiAuditLogs,
        activeReceipt,
        setActiveReceipt,
        isLoading,
        isSyncing,
        syncError,
        lastSyncedAt,
        addProperty,
        updateProperty,
        deleteProperty,
        addUnit,
        updateUnit,
        deleteUnit,
        addTenant,
        updateTenant,
        terminateTenant,
        recordPayment,
        confirmPayment,
        applyAdvanceCredit,
        requestTenantOtp,
        verifyTenantOtp,
        createMaintenanceRequest,
        updateMaintenanceStatus,
        addExpense,
        deleteExpense,
        markNotificationRead,
        sendNotification,
        runCareModeAutomation,
        executeAiAction,
        refreshPortfolio,
        getPortfolioMetrics,
      }}
    >
      {children}
    </PropertyContext.Provider>
  );
};

export function useProperty() {
  const context = useContext(PropertyContext);
  if (!context) {
    throw new Error('useProperty must be used within a PropertyProvider');
  }
  return context;
}
