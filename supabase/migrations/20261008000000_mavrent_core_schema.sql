-- =========================================================================
-- MavRent Platform - Core Production Relational Database Schema & RLS
-- Multi-Tenant SaaS Property Management Engine
-- =========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. PROFILES TABLE (Linked with Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL CHECK (role IN ('landlord', 'tenant', 'property_manager', 'admin')),
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  avatar_url TEXT,
  tenant_code VARCHAR(50) UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. PROPERTIES TABLE
CREATE TABLE IF NOT EXISTS public.properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  landlord_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  country VARCHAR(100) DEFAULT 'Uganda',
  currency VARCHAR(10) DEFAULT 'UGX',
  property_type VARCHAR(50) DEFAULT 'residential' CHECK (property_type IN ('residential', 'commercial', 'mixed', 'hostel')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. BUILDINGS TABLE (Optional structure within a property)
CREATE TABLE IF NOT EXISTS public.buildings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  floors INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. UNITS TABLE
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL,
  unit_number VARCHAR(50) NOT NULL,
  unit_type VARCHAR(50) NOT NULL CHECK (unit_type IN ('room', 'apartment', 'house', 'office', 'shop', 'commercial')),
  monthly_rent DECIMAL(14,2) NOT NULL DEFAULT 0,
  deposit_amount DECIMAL(14,2) DEFAULT 0,
  floor VARCHAR(20),
  status VARCHAR(50) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'maintenance', 'reserved')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TENANTS / LEASES TABLE (The central ledger link)
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tenant_code VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  start_date DATE NOT NULL,
  end_date DATE,
  rent_amount DECIMAL(14,2) NOT NULL,
  due_day INT NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  current_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'expired', 'terminated')),
  emergency_contact JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RENT RECORDS (Billing period records for single authoritative balance audit)
CREATE TABLE IF NOT EXISTS public.rent_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  billing_period VARCHAR(20) NOT NULL, -- e.g. "2026-10"
  amount_due DECIMAL(14,2) NOT NULL,
  amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
  balance DECIMAL(14,2) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. PAYMENTS TABLE (With Idempotency & Strict Ledger Allocation)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank', 'card', 'other')),
  reference_number VARCHAR(100),
  idempotency_key VARCHAR(100) UNIQUE,
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending_verification', 'reversed')),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. RECEIPTS TABLE
CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  balance_after DECIMAL(14,2) NOT NULL,
  issue_date TIMESTAMPTZ DEFAULT NOW(),
  data_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. MAINTENANCE REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('plumbing', 'electrical', 'structural', 'appliance', 'painting', 'cleaning', 'other')),
  priority VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'in_progress', 'completed', 'rejected', 'cancelled')),
  media_urls JSONB DEFAULT '[]'::jsonb,
  assigned_worker VARCHAR(255),
  landlord_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  category VARCHAR(50) NOT NULL CHECK (category IN ('repairs', 'utilities', 'maintenance', 'staff', 'security', 'cleaning', 'taxes', 'other')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  receipt_attachment TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  channel VARCHAR(50) DEFAULT 'in_app' CHECK (channel IN ('in_app', 'sms', 'whatsapp')),
  read BOOLEAN DEFAULT FALSE,
  notification_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. AI AUDIT LOGS (Security and Action Verifiability)
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  risk_level VARCHAR(50) NOT NULL CHECK (risk_level IN ('read_only', 'low_risk_write', 'financial_write', 'destructive')),
  prompt TEXT NOT NULL,
  prepared_action JSONB,
  executed BOOLEAN DEFAULT FALSE,
  confirmed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- Multi-Tenant Data Isolation: No landlord sees another landlord's data,
-- and tenants only see their own lease, payments, unit, and requests.
-- =========================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_audit_logs ENABLE ROW LEVEL SECURITY;

-- PROFILES: Users read their own profile, or landlords read their tenants' profiles
CREATE POLICY "Users can manage own profile" ON public.profiles
  FOR ALL USING (auth.uid() = id);

-- PROPERTIES: Landlords manage their own properties
CREATE POLICY "Landlords manage their properties" ON public.properties
  FOR ALL USING (landlord_id = auth.uid());

CREATE POLICY "Tenants view assigned property" ON public.properties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.property_id = properties.id AND t.user_id = auth.uid()
    )
  );

-- UNITS:
CREATE POLICY "Landlords manage units" ON public.units
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = units.property_id AND p.landlord_id = auth.uid()
    )
  );

CREATE POLICY "Tenants view assigned unit" ON public.units
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.unit_id = units.id AND t.user_id = auth.uid()
    )
  );

-- TENANTS:
CREATE POLICY "Landlords manage tenants" ON public.tenants
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = tenants.property_id AND p.landlord_id = auth.uid()
    )
  );

CREATE POLICY "Tenants view own tenant record" ON public.tenants
  FOR SELECT USING (user_id = auth.uid());

-- PAYMENTS:
CREATE POLICY "Landlords manage payments" ON public.payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = payments.property_id AND p.landlord_id = auth.uid()
    )
  );

CREATE POLICY "Tenants view own payments" ON public.payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = payments.tenant_id AND t.user_id = auth.uid()
    )
  );

-- RECEIPTS:
CREATE POLICY "Landlords view receipts" ON public.receipts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = receipts.property_id AND p.landlord_id = auth.uid()
    )
  );

CREATE POLICY "Tenants view own receipts" ON public.receipts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = receipts.tenant_id AND t.user_id = auth.uid()
    )
  );

-- MAINTENANCE REQUESTS:
CREATE POLICY "Landlords manage maintenance" ON public.maintenance_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = maintenance_requests.property_id AND p.landlord_id = auth.uid()
    )
  );

CREATE POLICY "Tenants manage own maintenance" ON public.maintenance_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = maintenance_requests.tenant_id AND t.user_id = auth.uid()
    )
  );

-- EXPENSES:
CREATE POLICY "Landlords manage expenses" ON public.expenses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = expenses.property_id AND p.landlord_id = auth.uid()
    )
  );

-- NOTIFICATIONS:
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR ALL USING (user_id = auth.uid());

-- AI AUDIT LOGS:
CREATE POLICY "Users view own AI audit logs" ON public.ai_audit_logs
  FOR ALL USING (user_id = auth.uid());
