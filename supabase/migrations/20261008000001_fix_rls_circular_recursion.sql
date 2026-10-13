-- =========================================================================
-- MavRent Platform - RLS Policy Circular Recursion Fix & Extension Schema
-- Fixes PostgreSQL error 42P17: "infinite recursion detected in policy for relation 'properties'"
-- =========================================================================

-- 1. FIX CIRCULAR POLICIES ON PROPERTIES AND UNITS
-- Drop existing recursive policies that cause mutual query loops
DROP POLICY IF EXISTS "Owners can view own properties" ON public.properties;
DROP POLICY IF EXISTS "Owners can manage own properties" ON public.properties;
DROP POLICY IF EXISTS "Landlords manage properties" ON public.properties;
DROP POLICY IF EXISTS "Renters view properties" ON public.properties;

DROP POLICY IF EXISTS "Owners can view own units" ON public.units;
DROP POLICY IF EXISTS "Owners can manage own units" ON public.units;
DROP POLICY IF EXISTS "Landlords manage units" ON public.units;
DROP POLICY IF EXISTS "Renters view units" ON public.units;

-- Clean non-recursive policies:
CREATE POLICY "Owners manage their properties" ON public.properties
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Anyone view active units and properties" ON public.properties
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Owners manage units of their properties" ON public.units
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = units.property_id AND p.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = units.property_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Tenants and visitors view published units" ON public.units
  FOR SELECT TO authenticated
  USING (true);

-- 2. CREATE SAAS EXTENSION TABLES IF NOT ALREADY PRESENT
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tenant_code VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  rent_amount DECIMAL(14,2) NOT NULL,
  due_day INT NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  current_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  emergency_contact JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50) NOT NULL,
  reference_number VARCHAR(100),
  idempotency_key VARCHAR(100) UNIQUE,
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  priority VARCHAR(50) NOT NULL DEFAULT 'medium',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  media_urls JSONB DEFAULT '[]'::jsonb,
  assigned_worker VARCHAR(255),
  landlord_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  category VARCHAR(50) NOT NULL,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  receipt_attachment TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  channel VARCHAR(50) DEFAULT 'in_app',
  read BOOLEAN DEFAULT FALSE,
  notification_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on extension tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Manage tenants" ON public.tenants FOR ALL TO authenticated USING (true);
CREATE POLICY "Manage payments" ON public.payments FOR ALL TO authenticated USING (true);
CREATE POLICY "Manage receipts" ON public.receipts FOR ALL TO authenticated USING (true);
CREATE POLICY "Manage maintenance" ON public.maintenance_requests FOR ALL TO authenticated USING (true);
CREATE POLICY "Manage expenses" ON public.expenses FOR ALL TO authenticated USING (true);
CREATE POLICY "Manage notifications" ON public.notifications FOR ALL TO authenticated USING (user_id = auth.uid());
