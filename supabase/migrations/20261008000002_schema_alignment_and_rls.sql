-- =========================================================================
-- MavRent Platform - Migration 20261008000002_schema_alignment_and_rls.sql
-- Synchronizes schema columns, tenant access, and enables Supabase Realtime
-- =========================================================================

-- 1. Ensure properties table supports both landlord_id and owner_id columns seamlessly
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'owner_id'
  ) THEN
    ALTER TABLE public.properties ADD COLUMN owner_id UUID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'landlord_id'
  ) THEN
    ALTER TABLE public.properties ADD COLUMN landlord_id UUID;
  END IF;
END $$;

-- Keep landlord_id and owner_id in sync
CREATE OR REPLACE FUNCTION sync_property_owner_landlord()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.landlord_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    NEW.landlord_id := NEW.owner_id;
  ELSIF NEW.owner_id IS NULL AND NEW.landlord_id IS NOT NULL THEN
    NEW.owner_id := NEW.landlord_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_property_owner ON public.properties;
CREATE TRIGGER trg_sync_property_owner
BEFORE INSERT OR UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION sync_property_owner_landlord();

-- 2. Ensure rent_records table exists with proper indexes and RLS
CREATE TABLE IF NOT EXISTS public.rent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  billing_period VARCHAR(20) NOT NULL, -- e.g. "2026-10"
  amount_due DECIMAL(14,2) NOT NULL,
  amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0,
  balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.rent_records ENABLE ROW LEVEL SECURITY;

-- 3. Comprehensive RLS policies for multi-tenant isolation

-- Properties policies
DROP POLICY IF EXISTS "Owners manage their properties" ON public.properties;
DROP POLICY IF EXISTS "Anyone view active units and properties" ON public.properties;

CREATE POLICY "Owners manage their properties" ON public.properties
  FOR ALL TO authenticated
  USING (
    landlord_id = auth.uid() OR owner_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.tenants t WHERE t.property_id = properties.id AND (t.user_id = auth.uid() OR t.email = (auth.jwt()->>'email')))
  )
  WITH CHECK (landlord_id = auth.uid() OR owner_id = auth.uid());

CREATE POLICY "Public properties select" ON public.properties
  FOR SELECT TO authenticated
  USING (true);

-- Units policies
DROP POLICY IF EXISTS "Owners manage units of their properties" ON public.units;
DROP POLICY IF EXISTS "Tenants and visitors view published units" ON public.units;

CREATE POLICY "Owners manage units of their properties" ON public.units
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = units.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.unit_id = units.id AND (t.user_id = auth.uid() OR t.email = (auth.jwt()->>'email'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = units.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Public units select" ON public.units
  FOR SELECT TO authenticated
  USING (true);

-- Tenants policies
DROP POLICY IF EXISTS "Manage tenants" ON public.tenants;

CREATE POLICY "Manage tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = tenants.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
    OR user_id = auth.uid()
    OR email = (auth.jwt()->>'email')
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = tenants.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
    OR user_id = auth.uid()
  );

-- Payments policies
DROP POLICY IF EXISTS "Manage payments" ON public.payments;

CREATE POLICY "Manage payments" ON public.payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = payments.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = payments.tenant_id AND (t.user_id = auth.uid() OR t.email = (auth.jwt()->>'email'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = payments.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = payments.tenant_id AND (t.user_id = auth.uid() OR t.email = (auth.jwt()->>'email'))
    )
  );

-- Receipts policies
DROP POLICY IF EXISTS "Manage receipts" ON public.receipts;

CREATE POLICY "Manage receipts" ON public.receipts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = receipts.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = receipts.tenant_id AND (t.user_id = auth.uid() OR t.email = (auth.jwt()->>'email'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = receipts.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

-- Rent Records policies
DROP POLICY IF EXISTS "Manage rent records" ON public.rent_records;

CREATE POLICY "Manage rent records" ON public.rent_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = rent_records.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = rent_records.tenant_id AND (t.user_id = auth.uid() OR t.email = (auth.jwt()->>'email'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = rent_records.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

-- Maintenance Requests policies
DROP POLICY IF EXISTS "Manage maintenance" ON public.maintenance_requests;

CREATE POLICY "Manage maintenance" ON public.maintenance_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = maintenance_requests.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = maintenance_requests.tenant_id AND (t.user_id = auth.uid() OR t.email = (auth.jwt()->>'email'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = maintenance_requests.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = maintenance_requests.tenant_id AND (t.user_id = auth.uid() OR t.email = (auth.jwt()->>'email'))
    )
  );

-- Expenses policies (Landlord only)
DROP POLICY IF EXISTS "Manage expenses" ON public.expenses;

CREATE POLICY "Manage expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = expenses.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = expenses.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

-- Notifications policies (Strict user_id)
DROP POLICY IF EXISTS "Manage notifications" ON public.notifications;

CREATE POLICY "Manage notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4. Enable Supabase Realtime Publication for live updates
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE 
      public.properties, 
      public.units, 
      public.tenants, 
      public.payments, 
      public.receipts, 
      public.maintenance_requests, 
      public.expenses, 
      public.notifications,
      public.rent_records;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
  END;
END $$;
