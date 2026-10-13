-- =========================================================================
-- MavRent Platform - Hardened Management Schema & Security Migration
-- File: 20261009000002_hardened_management_schema.sql
-- Status: Review Only - Prepared for validation and approval
-- =========================================================================

-- Enable required cryptographic and UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- 1. BASELINE MARKETPLACE SCHEMA RECONCILIATION & SAFE ALTER STATEMENTS
-- =========================================================================

-- 1.1 PROFILES: Reconcile role enum and tenant_code
-- The existing marketplace profiles table uses user_role enum ('landlord', 'renter', etc.)
-- Safely add 'tenant' to user_role enum if it does not already exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e 
      JOIN pg_type t ON e.enumtypid = t.oid 
      WHERE t.typname = 'user_role' AND e.enumlabel = 'tenant'
    ) THEN
      ALTER TYPE public.user_role ADD VALUE 'tenant';
    END IF;
  END IF;

  -- Add tenant_code column to profiles if not present
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'tenant_code'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN tenant_code VARCHAR(50) UNIQUE;
  END IF;
END $$;

-- 1.2 PROPERTIES: Add landlord_id and currency without breaking marketplace owner_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'landlord_id'
  ) THEN
    ALTER TABLE public.properties ADD COLUMN landlord_id UUID REFERENCES auth.users(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'properties' AND column_name = 'currency'
  ) THEN
    ALTER TABLE public.properties ADD COLUMN currency VARCHAR(10) DEFAULT 'UGX';
  END IF;
END $$;

-- Safe backfill: Synchronize landlord_id and owner_id where one exists and the other is null
UPDATE public.properties 
SET landlord_id = owner_id 
WHERE landlord_id IS NULL AND owner_id IS NOT NULL;

UPDATE public.properties 
SET owner_id = landlord_id 
WHERE owner_id IS NULL AND landlord_id IS NOT NULL;

-- Deterministic owner_id / landlord_id synchronization trigger
-- Rejects conflicting non-null values if they do not match
CREATE OR REPLACE FUNCTION public.sync_property_ownership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.owner_id IS NOT NULL AND NEW.landlord_id IS NOT NULL THEN
    IF NEW.owner_id != NEW.landlord_id THEN
      RAISE EXCEPTION 'Ownership conflict: owner_id (%) and landlord_id (%) must be identical.', NEW.owner_id, NEW.landlord_id;
    END IF;
  ELSIF NEW.owner_id IS NOT NULL AND NEW.landlord_id IS NULL THEN
    NEW.landlord_id := NEW.owner_id;
  ELSIF NEW.landlord_id IS NOT NULL AND NEW.owner_id IS NULL THEN
    NEW.owner_id := NEW.landlord_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_sync_property_ownership ON public.properties;
CREATE TRIGGER trg_sync_property_ownership
BEFORE INSERT OR UPDATE ON public.properties
FOR EACH ROW EXECUTE FUNCTION public.sync_property_ownership();

-- 1.3 BUILDINGS: Create structure table if not existing
CREATE TABLE IF NOT EXISTS public.buildings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  floors INT DEFAULT 1 CHECK (floors >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 UNITS: Safely add management fields WITHOUT repurposing marketplace status enum
-- Marketplace status ('draft', 'pending_review', 'published', 'paused', 'rented', 'archived') remains intact
DO $$
BEGIN
  -- Add occupancy_status as a dedicated physical tenancy column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'occupancy_status'
  ) THEN
    ALTER TABLE public.units ADD COLUMN occupancy_status VARCHAR(50) NOT NULL DEFAULT 'available';
    ALTER TABLE public.units ADD CONSTRAINT chk_units_occupancy_status 
      CHECK (occupancy_status IN ('available', 'occupied', 'maintenance', 'reserved'));
  END IF;

  -- Add unit_number if missing and backfill from title
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'unit_number'
  ) THEN
    ALTER TABLE public.units ADD COLUMN unit_number VARCHAR(50);
    UPDATE public.units 
    SET unit_number = COALESCE(title, 'Unit-' || SUBSTRING(id::TEXT, 1, 4)) 
    WHERE unit_number IS NULL;
  END IF;

  -- Add building_id if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'building_id'
  ) THEN
    ALTER TABLE public.units ADD COLUMN building_id UUID REFERENCES public.buildings(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 1.5 RELATIONAL INTEGRITY TRIGGERS
-- Ensure units.building_id belongs to the same property
CREATE OR REPLACE FUNCTION public.validate_unit_building_property()
RETURNS TRIGGER AS $$
DECLARE
  v_bldg_property UUID;
BEGIN
  IF NEW.building_id IS NOT NULL THEN
    SELECT property_id INTO v_bldg_property FROM public.buildings WHERE id = NEW.building_id;
    IF v_bldg_property IS NOT NULL AND v_bldg_property != NEW.property_id THEN
      RAISE EXCEPTION 'Relational mismatch: Building % belongs to property %, but unit specifies property %.',
        NEW.building_id, v_bldg_property, NEW.property_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_unit_building ON public.units;
CREATE TRIGGER trg_validate_unit_building
BEFORE INSERT OR UPDATE OF building_id, property_id ON public.units
FOR EACH ROW EXECUTE FUNCTION public.validate_unit_building_property();

-- =========================================================================
-- 2. MANAGEMENT TABLES (Non-Destructive CREATE IF NOT EXISTS & ALTERs)
-- =========================================================================

-- TENANTS TABLE (Authoritative Lease & Ledger Anchor)
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_code VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  rent_amount DECIMAL(14,2) NOT NULL CHECK (rent_amount > 0),
  due_day INT NOT NULL DEFAULT 1 CHECK (due_day BETWEEN 1 AND 31),
  current_balance DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (current_balance >= 0),
  advance_credit DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (advance_credit >= 0),
  status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending', 'expired', 'terminated')),
  emergency_contact JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_tenant_end_date CHECK (end_date IS NULL OR end_date >= start_date)
);

-- Ensure advance_credit and current_balance constraints exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'advance_credit'
  ) THEN
    ALTER TABLE public.tenants ADD COLUMN advance_credit DECIMAL(14,2) NOT NULL DEFAULT 0;
    ALTER TABLE public.tenants ADD CONSTRAINT chk_tenant_advance_credit CHECK (advance_credit >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'tenants' AND constraint_name = 'chk_tenant_balance'
  ) THEN
    ALTER TABLE public.tenants ADD CONSTRAINT chk_tenant_balance CHECK (current_balance >= 0);
  END IF;
END $$;

-- Trigger: Ensure tenant.unit_id belongs to tenant.property_id
CREATE OR REPLACE FUNCTION public.validate_tenant_unit_property()
RETURNS TRIGGER AS $$
DECLARE
  v_unit_property UUID;
BEGIN
  SELECT property_id INTO v_unit_property FROM public.units WHERE id = NEW.unit_id;
  IF v_unit_property IS NULL THEN
    RAISE EXCEPTION 'Unit % does not exist.', NEW.unit_id;
  END IF;
  IF v_unit_property != NEW.property_id THEN
    RAISE EXCEPTION 'Relational mismatch: Unit % belongs to property %, but lease specifies property %.',
      NEW.unit_id, v_unit_property, NEW.property_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_validate_tenant_unit ON public.tenants;
CREATE TRIGGER trg_validate_tenant_unit
BEFORE INSERT OR UPDATE OF unit_id, property_id ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_unit_property();

-- Trigger: Prevent hard deletion of tenants with existing financial history
CREATE OR REPLACE FUNCTION public.prevent_tenant_financial_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE tenant_id = OLD.id) OR
     EXISTS (SELECT 1 FROM public.receipts WHERE tenant_id = OLD.id) OR
     EXISTS (SELECT 1 FROM public.rent_records WHERE tenant_id = OLD.id AND (amount_paid > 0 OR balance > 0)) THEN
    RAISE EXCEPTION 'Cannot delete tenant %: Tenant has financial payment, receipt, or rent ledger records. Set status to terminated or expired instead.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_tenant_financial_deletion ON public.tenants;
CREATE TRIGGER trg_prevent_tenant_financial_deletion
BEFORE DELETE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_financial_deletion();

-- RENT RECORDS TABLE (Authoritative Billing Period Ledger)
CREATE TABLE IF NOT EXISTS public.rent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  billing_period VARCHAR(20) NOT NULL, -- e.g. "2026-10"
  amount_due DECIMAL(14,2) NOT NULL CHECK (amount_due > 0),
  amount_paid DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  balance DECIMAL(14,2) NOT NULL CHECK (balance >= 0),
  due_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'paid', 'overdue')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_rent_paid_lte_due CHECK (amount_paid <= amount_due),
  CONSTRAINT chk_rent_balance_eq CHECK (balance = amount_due - amount_paid),
  CONSTRAINT chk_rent_status_valid CHECK (
    (status = 'paid' AND balance = 0) OR
    (status = 'partial' AND balance > 0 AND amount_paid > 0) OR
    (status IN ('pending', 'overdue') AND balance > 0)
  ),
  CONSTRAINT uq_tenant_billing_period UNIQUE (tenant_id, billing_period)
);

-- Safe, repeatable ALTER TABLE for rent_records if table already existed from earlier schema
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'rent_records' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.rent_records ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' AND table_name = 'rent_records' AND constraint_name = 'chk_rent_paid_lte_due'
  ) THEN
    ALTER TABLE public.rent_records ADD CONSTRAINT chk_rent_paid_lte_due CHECK (amount_paid <= amount_due);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' AND table_name = 'rent_records' AND constraint_name = 'chk_rent_balance_eq'
  ) THEN
    ALTER TABLE public.rent_records ADD CONSTRAINT chk_rent_balance_eq CHECK (balance = amount_due - amount_paid);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' AND table_name = 'rent_records' AND constraint_name = 'chk_rent_status_valid'
  ) THEN
    ALTER TABLE public.rent_records ADD CONSTRAINT chk_rent_status_valid CHECK (
      (status = 'paid' AND balance = 0) OR
      (status = 'partial' AND balance > 0 AND amount_paid > 0) OR
      (status IN ('pending', 'overdue') AND balance > 0)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' AND table_name = 'rent_records' AND constraint_name = 'uq_tenant_billing_period'
  ) THEN
    ALTER TABLE public.rent_records ADD CONSTRAINT uq_tenant_billing_period UNIQUE (tenant_id, billing_period);
  END IF;
END $$;

-- Trigger: Prevent deletion of rent records with partial or full settlement
CREATE OR REPLACE FUNCTION public.prevent_settled_rent_record_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.amount_paid > 0 OR OLD.status = 'paid' THEN
    RAISE EXCEPTION 'Cannot delete rent record % with settled or partial payments (amount_paid = %). Financial ledger history must be preserved.'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_prevent_settled_rent_record_deletion ON public.rent_records;
CREATE TRIGGER trg_prevent_settled_rent_record_deletion
BEFORE DELETE ON public.rent_records
FOR EACH ROW EXECUTE FUNCTION public.prevent_settled_rent_record_deletion();

-- PAYMENTS TABLE (With Concurrency-Safe Idempotency & Payload Hash)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('cash', 'mobile_money', 'bank', 'card', 'other')),
  reference_number VARCHAR(100),
  idempotency_key VARCHAR(120) UNIQUE,
  payload_hash VARCHAR(64), -- SHA-256 hash of (tenant_id, amount, payment_method, reference_number, property_id)
  receipt_number VARCHAR(50) UNIQUE,
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'pending_verification', 'rejected', 'reversed')),
  created_by UUID REFERENCES auth.users(id),
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: Prevent direct unverified insertion of confirmed payments and protect confirmed payments from deletion
CREATE OR REPLACE FUNCTION public.enforce_payment_write_rules()
RETURNS TRIGGER AS $$
BEGIN
  -- Prevent deletion of confirmed payments
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'confirmed' THEN
      RAISE EXCEPTION 'Confirmed payments are immutable financial audit records and cannot be deleted. Use reversal or credit adjustment instead.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  -- A direct insertion of status = 'confirmed' must include a generated receipt_number and confirmed_by
  IF TG_OP = 'INSERT' AND NEW.status = 'confirmed' AND (NEW.receipt_number IS NULL OR NEW.confirmed_by IS NULL) THEN
    RAISE EXCEPTION 'Direct insertion of confirmed payments without official settlement is forbidden. Use record_payment_atomic() or confirm_payment_atomic().'
      USING ERRCODE = '42501';
  END IF;

  -- Prevent altering confirmed payments directly
  IF TG_OP = 'UPDATE' AND OLD.status = 'confirmed' AND NEW.status != 'confirmed' AND NEW.status != 'reversed' THEN
    RAISE EXCEPTION 'Confirmed payments are immutable and cannot be modified directly.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_payment_write_rules ON public.payments;
CREATE TRIGGER trg_enforce_payment_write_rules
BEFORE INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_write_rules();

-- RECEIPTS TABLE (Official Proof of Confirmed Payment)
CREATE TABLE IF NOT EXISTS public.receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  receipt_number VARCHAR(50) UNIQUE NOT NULL,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(50) NOT NULL,
  balance_after DECIMAL(14,2) NOT NULL,
  issue_date TIMESTAMPTZ DEFAULT NOW(),
  data_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Safe, repeatable ALTER TABLE for payments and receipts if they already existed from earlier schema
DO $$
BEGIN
  -- Reconcile payments table columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'payload_hash'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN payload_hash VARCHAR(64);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'confirmed_by'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN confirmed_by UUID REFERENCES auth.users(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'confirmed_at'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN confirmed_at TIMESTAMPTZ;
  END IF;

  -- Ensure receipt_number is nullable so unconfirmed tenant payment claims can be submitted
  BEGIN
    ALTER TABLE public.payments ALTER COLUMN receipt_number DROP NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Ensure receipts table has data_snapshot column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'receipts' AND column_name = 'data_snapshot'
  ) THEN
    ALTER TABLE public.receipts ADD COLUMN data_snapshot JSONB;
  END IF;
END $$;

-- Safe Conversion of legacy CASCADE foreign keys to ON DELETE RESTRICT on financial tables and properties
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT 
      tc.table_name, 
      tc.constraint_name, 
      kcu.column_name, 
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name, 
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc 
      ON tc.constraint_name = rc.constraint_name 
      AND tc.constraint_schema = rc.constraint_schema
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name 
      AND tc.constraint_schema = kcu.constraint_schema
      AND tc.table_name = kcu.table_name
    JOIN information_schema.constraint_column_usage ccu 
      ON rc.unique_constraint_name = ccu.constraint_name 
      AND rc.unique_constraint_schema = ccu.constraint_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name IN ('properties', 'tenants', 'rent_records', 'payments', 'receipts')
      AND rc.delete_rule = 'CASCADE'
      AND kcu.column_name IN ('property_id', 'unit_id', 'tenant_id', 'payment_id', 'landlord_id', 'owner_id')
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I;', r.table_name, r.constraint_name);
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) ON DELETE RESTRICT;',
      r.table_name, r.constraint_name, r.column_name, r.foreign_table_schema, r.foreign_table_name, r.foreign_column_name);
  END LOOP;
END $$;

-- Trigger: Complete immutability of receipts (cannot be altered or deleted)
CREATE OR REPLACE FUNCTION public.enforce_receipt_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Receipts are immutable financial audit records and cannot be deleted.'
      USING ERRCODE = '42501';
  ELSIF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Receipts are immutable financial audit records and cannot be modified.'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_enforce_receipt_immutability ON public.receipts;
CREATE TRIGGER trg_enforce_receipt_immutability
BEFORE UPDATE OR DELETE ON public.receipts
FOR EACH ROW EXECUTE FUNCTION public.enforce_receipt_immutability();

-- MAINTENANCE REQUESTS TABLE (Strict Role Privilege Isolation)
CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

-- EXPENSES TABLE (Landlord Only)
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  amount DECIMAL(14,2) NOT NULL CHECK (amount > 0),
  category VARCHAR(50) NOT NULL CHECK (category IN ('repairs', 'utilities', 'maintenance', 'staff', 'security', 'cleaning', 'taxes', 'other')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  receipt_attachment TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTIFICATIONS TABLE (Strict User Isolation)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  channel VARCHAR(50) DEFAULT 'in_app' CHECK (channel IN ('in_app', 'sms', 'whatsapp')),
  read BOOLEAN DEFAULT FALSE,
  notification_type VARCHAR(50) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI AUDIT LOGS (Immutable Action Trace)
CREATE TABLE IF NOT EXISTS public.ai_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type VARCHAR(100) NOT NULL,
  risk_level VARCHAR(50) NOT NULL CHECK (risk_level IN ('read_only', 'low_risk_write', 'financial_write', 'destructive')),
  prompt TEXT NOT NULL,
  prepared_action JSONB,
  executed BOOLEAN DEFAULT FALSE,
  confirmed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- TENANT ACCOUNT LINKING / OTP VERIFICATION TABLE
CREATE TABLE IF NOT EXISTS public.tenant_link_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone_hash VARCHAR(64) NOT NULL,
  otp_hash VARCHAR(128) NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 3,
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================================
-- 3. PERFORMANCE INDEXES
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_properties_landlord ON public.properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_properties_owner ON public.properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_units_property ON public.units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_occupancy ON public.units(occupancy_status);
CREATE INDEX IF NOT EXISTS idx_tenants_property ON public.tenants(property_id);
CREATE INDEX IF NOT EXISTS idx_tenants_unit ON public.tenants(unit_id);
CREATE INDEX IF NOT EXISTS idx_tenants_user ON public.tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_tenants_code ON public.tenants(tenant_code);
CREATE INDEX IF NOT EXISTS idx_rent_records_tenant ON public.rent_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rent_records_status ON public.rent_records(status);
CREATE INDEX IF NOT EXISTS idx_rent_records_due ON public.rent_records(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_tenant ON public.payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_property ON public.payments(property_id);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency ON public.payments(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_receipts_payment ON public.receipts(payment_id);
CREATE INDEX IF NOT EXISTS idx_receipts_tenant ON public.receipts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tenant ON public.maintenance_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_property ON public.maintenance_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_expenses_property ON public.expenses(property_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_tenant_link_user ON public.tenant_link_requests(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_link_expires ON public.tenant_link_requests(expires_at);

-- =========================================================================
-- 4. ROW LEVEL SECURITY (RLS) INVENTORY, PURGE & LEAST-PRIVILEGE POLICIES
-- =========================================================================

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
ALTER TABLE public.tenant_link_requests ENABLE ROW LEVEL SECURITY;

-- 4.1 PROPERTIES POLICIES
DROP POLICY IF EXISTS "Owners can view own properties" ON public.properties;
DROP POLICY IF EXISTS "Owners can manage own properties" ON public.properties;
DROP POLICY IF EXISTS "Landlords manage properties" ON public.properties;
DROP POLICY IF EXISTS "Renters view properties" ON public.properties;
DROP POLICY IF EXISTS "Owners manage their properties" ON public.properties;
DROP POLICY IF EXISTS "Anyone view active units and properties" ON public.properties;
DROP POLICY IF EXISTS "Public properties select" ON public.properties;
DROP POLICY IF EXISTS "Tenants view assigned property" ON public.properties;
DROP POLICY IF EXISTS "Landlords manage owned properties" ON public.properties;
DROP POLICY IF EXISTS "Tenants view leased property" ON public.properties;
DROP POLICY IF EXISTS "Public marketplace view properties with published units" ON public.properties;

CREATE POLICY "Landlords manage owned properties" ON public.properties
  FOR ALL TO authenticated
  USING (landlord_id = auth.uid() OR owner_id = auth.uid())
  WITH CHECK (landlord_id = auth.uid() OR owner_id = auth.uid());

CREATE POLICY "Tenants view leased property" ON public.properties
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.property_id = properties.id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Public marketplace view properties with published units" ON public.properties
  FOR SELECT TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.units u
      WHERE u.property_id = properties.id AND u.status = 'published'
    )
  );

-- 4.2 BUILDINGS POLICIES
DROP POLICY IF EXISTS "Landlords manage buildings" ON public.buildings;
DROP POLICY IF EXISTS "Tenants view property buildings" ON public.buildings;

CREATE POLICY "Landlords manage buildings" ON public.buildings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = buildings.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = buildings.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Tenants view property buildings" ON public.buildings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.property_id = buildings.property_id AND t.user_id = auth.uid()
    )
  );

-- 4.3 UNITS POLICIES
DROP POLICY IF EXISTS "Owners manage units of their properties" ON public.units;
DROP POLICY IF EXISTS "Tenants and visitors view published units" ON public.units;
DROP POLICY IF EXISTS "Landlords manage property units" ON public.units;
DROP POLICY IF EXISTS "Tenants view leased unit" ON public.units;
DROP POLICY IF EXISTS "Public marketplace view published units" ON public.units;

CREATE POLICY "Landlords manage property units" ON public.units
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = units.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = units.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Tenants view leased unit" ON public.units
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.unit_id = units.id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Public marketplace view published units" ON public.units
  FOR SELECT TO authenticated, anon
  USING (status = 'published');

-- 4.4 TENANTS (LEASES) POLICIES
DROP POLICY IF EXISTS "Landlords manage tenants" ON public.tenants;
DROP POLICY IF EXISTS "Manage tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenants view own tenant record" ON public.tenants;
DROP POLICY IF EXISTS "Landlords manage property tenants" ON public.tenants;
DROP POLICY IF EXISTS "Tenants view own lease" ON public.tenants;

CREATE POLICY "Landlords manage property tenants" ON public.tenants
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = tenants.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = tenants.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Tenants view own lease" ON public.tenants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 4.5 RENT RECORDS POLICIES
DROP POLICY IF EXISTS "Manage rent records" ON public.rent_records;
DROP POLICY IF EXISTS "Landlords manage rent records" ON public.rent_records;
DROP POLICY IF EXISTS "Tenants view own rent records" ON public.rent_records;

CREATE POLICY "Landlords manage rent records" ON public.rent_records
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = rent_records.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = rent_records.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Tenants view own rent records" ON public.rent_records
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = rent_records.tenant_id AND t.user_id = auth.uid()
    )
  );

-- 4.6 PAYMENTS POLICIES
DROP POLICY IF EXISTS "Landlords manage payments" ON public.payments;
DROP POLICY IF EXISTS "Manage payments" ON public.payments;
DROP POLICY IF EXISTS "Tenants view own payments" ON public.payments;
DROP POLICY IF EXISTS "Landlords manage property payments" ON public.payments;
DROP POLICY IF EXISTS "Tenants submit payment claims" ON public.payments;

CREATE POLICY "Landlords manage property payments" ON public.payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = payments.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = payments.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Tenants view own payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = payments.tenant_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Tenants submit payment claims" ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending_verification'
    AND created_by = auth.uid()
    AND receipt_number IS NULL
    AND confirmed_by IS NULL
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = payments.tenant_id AND t.user_id = auth.uid()
    )
  );

-- 4.7 RECEIPTS POLICIES
DROP POLICY IF EXISTS "Landlords view receipts" ON public.receipts;
DROP POLICY IF EXISTS "Manage receipts" ON public.receipts;
DROP POLICY IF EXISTS "Tenants view own receipts" ON public.receipts;

CREATE POLICY "Landlords view receipts" ON public.receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = receipts.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Tenants view own receipts" ON public.receipts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = receipts.tenant_id AND t.user_id = auth.uid()
    )
  );

-- 4.8 MAINTENANCE REQUESTS POLICIES
DROP POLICY IF EXISTS "Landlords manage maintenance" ON public.maintenance_requests;
DROP POLICY IF EXISTS "Manage maintenance" ON public.maintenance_requests;
DROP POLICY IF EXISTS "Tenants manage own maintenance" ON public.maintenance_requests;
DROP POLICY IF EXISTS "Landlords manage maintenance requests" ON public.maintenance_requests;
DROP POLICY IF EXISTS "Tenants view own maintenance requests" ON public.maintenance_requests;
DROP POLICY IF EXISTS "Tenants create maintenance requests" ON public.maintenance_requests;
DROP POLICY IF EXISTS "Tenants cancel own pending maintenance" ON public.maintenance_requests;

CREATE POLICY "Landlords manage maintenance requests" ON public.maintenance_requests
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = maintenance_requests.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = maintenance_requests.property_id AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Tenants view own maintenance requests" ON public.maintenance_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = maintenance_requests.tenant_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Tenants create maintenance requests" ON public.maintenance_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND landlord_notes IS NULL
    AND assigned_worker IS NULL
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = maintenance_requests.tenant_id AND t.user_id = auth.uid()
        AND t.property_id = maintenance_requests.property_id
        AND t.unit_id = maintenance_requests.unit_id
    )
  );

CREATE POLICY "Tenants cancel own pending maintenance" ON public.maintenance_requests
  FOR UPDATE TO authenticated
  USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.tenants t
      WHERE t.id = maintenance_requests.tenant_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('pending', 'cancelled')
    AND landlord_notes IS NULL
    AND assigned_worker IS NULL
  );

-- 4.9 EXPENSES POLICIES
DROP POLICY IF EXISTS "Landlords manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "Manage expenses" ON public.expenses;

CREATE POLICY "Landlords manage expenses" ON public.expenses
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

-- 4.10 NOTIFICATIONS POLICIES
DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Manage notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users read and manage own notifications" ON public.notifications;

CREATE POLICY "Users read and manage own notifications" ON public.notifications
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 4.11 AI AUDIT LOGS
DROP POLICY IF EXISTS "Users view own AI audit logs" ON public.ai_audit_logs;
DROP POLICY IF EXISTS "Users view own audit logs" ON public.ai_audit_logs;

CREATE POLICY "Users view own audit logs" ON public.ai_audit_logs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR confirmed_by = auth.uid());

-- 4.12 TENANT LINK REQUESTS
DROP POLICY IF EXISTS "Users view own link requests" ON public.tenant_link_requests;

CREATE POLICY "Users view own link requests" ON public.tenant_link_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =========================================================================
-- 5. ATOMIC FINANCIAL TRANSACTIONS & AUTHORIZED PROCEDURES
-- =========================================================================

-- Sequence-backed receipt number generator for collision-free receipts under high concurrency
CREATE SEQUENCE IF NOT EXISTS public.receipt_number_seq START WITH 10001;

CREATE OR REPLACE FUNCTION public.generate_receipt_number()
RETURNS VARCHAR AS $$
BEGIN
  RETURN 'RCP-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(NEXTVAL('public.receipt_number_seq')::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp;

-- 5.1 RECORD PAYMENT ATOMIC (Landlord Direct Recording)
CREATE OR REPLACE FUNCTION public.record_payment_atomic(
  p_tenant_id UUID,
  p_amount DECIMAL(14,2),
  p_payment_method VARCHAR(50),
  p_reference_number VARCHAR(100),
  p_payment_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key VARCHAR(120) DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_tenant RECORD;
  v_property RECORD;
  v_unit RECORD;
  v_payment_id UUID;
  v_receipt_id UUID;
  v_receipt_number VARCHAR(50);
  v_payload_hash VARCHAR(64);
  v_existing_payment RECORD;
  v_existing_receipt RECORD;
  v_remaining_payment DECIMAL(14,2) := p_amount;
  v_record RECORD;
  v_allocation DECIMAL(14,2);
  v_allocations JSONB := '[]'::jsonb;
  v_new_balance DECIMAL(14,2);
  v_new_advance_credit DECIMAL(14,2);
  v_snapshot JSONB;
  v_property_id UUID;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.' USING ERRCODE = '22003';
  END IF;

  -- 1. Strict Owner Authorization check FIRST: Verify caller owns property BEFORE acquiring exclusive locks or disclosing receipt info
  SELECT property_id INTO v_property_id FROM public.tenants WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant record % not found.', p_tenant_id USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_property FROM public.properties 
  WHERE id = v_property_id AND (landlord_id = v_caller OR owner_id = v_caller);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: Caller % does not own property %.', v_caller, v_property_id USING ERRCODE = '42501';
  END IF;

  -- 2. Lock tenant row under verified authorization
  SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

  SELECT * INTO v_unit FROM public.units WHERE id = v_tenant.unit_id;

  -- 3. Compute deterministic payload hash for idempotency integrity
  v_payload_hash := encode(digest(p_tenant_id::TEXT || ':' || p_amount::TEXT || ':' || p_payment_method || ':' || COALESCE(p_reference_number, '') || ':' || v_tenant.property_id::TEXT, 'sha256'), 'hex');

  -- 4. Handle idempotency check under lock
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing_payment FROM public.payments WHERE idempotency_key = p_idempotency_key FOR UPDATE;
    IF FOUND THEN
      IF v_existing_payment.payload_hash != v_payload_hash THEN
        RAISE EXCEPTION 'Idempotency conflict: key % already used with conflicting parameters.', p_idempotency_key USING ERRCODE = '23505';
      END IF;
      SELECT * INTO v_existing_receipt FROM public.receipts WHERE payment_id = v_existing_payment.id;
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'payment', row_to_json(v_existing_payment),
        'receipt', row_to_json(v_existing_receipt)
      );
    END IF;
  END IF;

  v_receipt_number := public.generate_receipt_number();

  -- 5. Insert Confirmed Payment Record
  INSERT INTO public.payments (
    tenant_id, property_id, unit_id, amount, payment_date, payment_method,
    reference_number, idempotency_key, payload_hash, receipt_number, notes,
    status, created_by, confirmed_by, confirmed_at
  ) VALUES (
    v_tenant.id, v_tenant.property_id, v_tenant.unit_id, p_amount, COALESCE(p_payment_date, CURRENT_DATE),
    p_payment_method, p_reference_number, p_idempotency_key, v_payload_hash, v_receipt_number,
    p_notes, 'confirmed', v_caller, v_caller, NOW()
  ) RETURNING id INTO v_payment_id;

    -- 6. Allocate payment across outstanding rent records (oldest due_date first, deterministic id order)
    FOR v_record IN
      SELECT * FROM public.rent_records
      WHERE tenant_id = v_tenant.id AND status IN ('pending', 'partial', 'overdue')
      ORDER BY due_date ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining_payment <= 0;
      v_allocation := LEAST(v_remaining_payment, v_record.balance);
      
      UPDATE public.rent_records
      SET 
        amount_paid = amount_paid + v_allocation,
        balance = balance - v_allocation,
        status = CASE WHEN (balance - v_allocation) = 0 THEN 'paid' ELSE 'partial' END,
        updated_at = NOW()
      WHERE id = v_record.id;

      v_allocations := v_allocations || jsonb_build_object(
        'rent_record_id', v_record.id,
        'billing_period', v_record.billing_period,
        'amount_allocated', v_allocation,
        'prior_balance', v_record.balance,
        'new_balance', v_record.balance - v_allocation
      );

      v_remaining_payment := v_remaining_payment - v_allocation;
    END LOOP;

    -- 7. Calculate tenant advance credit and authoritative balance
    IF v_remaining_payment > 0 THEN
      v_new_advance_credit := v_tenant.advance_credit + v_remaining_payment;
      v_allocations := v_allocations || jsonb_build_object(
        'advance_credit', v_remaining_payment
      );
    ELSE
      v_new_advance_credit := v_tenant.advance_credit;
    END IF;

    -- Authoritative reconciliation: current_balance = SUM(balance) of all rent records
    SELECT COALESCE(SUM(balance), 0) INTO v_new_balance
    FROM public.rent_records
    WHERE tenant_id = v_tenant.id;

    UPDATE public.tenants
    SET 
      current_balance = v_new_balance,
      advance_credit = v_new_advance_credit,
      updated_at = NOW()
    WHERE id = v_tenant.id;

    -- 8. Create immutable receipt snapshot
    v_snapshot := jsonb_build_object(
      'tenantName', v_tenant.full_name,
      'tenantCode', v_tenant.tenant_code,
      'propertyName', v_property.name,
      'unitNumber', COALESCE(v_unit.unit_number, v_unit.title, 'Unit'),
      'landlordName', 'Property Management',
      'currency', COALESCE(v_property.currency, 'UGX'),
      'referenceNumber', p_reference_number,
      'allocations', v_allocations,
      'advanceCredit', v_remaining_payment,
      'balanceAfter', v_new_balance,
      'confirmedBy', v_caller,
      'issueDate', NOW()
    );

    INSERT INTO public.receipts (
      payment_id, receipt_number, tenant_id, property_id, unit_id,
      amount, payment_method, balance_after, data_snapshot
    ) VALUES (
      v_payment_id, v_receipt_number, v_tenant.id, v_tenant.property_id, v_tenant.unit_id,
      p_amount, p_payment_method, v_new_balance, v_snapshot
    ) RETURNING id INTO v_receipt_id;

    -- 9. Notify tenant if linked to auth user
    IF v_tenant.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id, title, message, channel, notification_type
      ) VALUES (
        v_tenant.user_id,
        'Payment Confirmed',
        'Your payment of ' || COALESCE(v_property.currency, 'UGX') || ' ' || p_amount::TEXT || ' has been confirmed. Receipt: ' || v_receipt_number,
        'in_app',
        'payment_received'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_payment_id,
      'receipt_number', v_receipt_number,
      'balance_after', v_new_balance,
      'advance_credit', v_new_advance_credit,
      'allocations', v_allocations
    );
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

  -- 5.2 CONFIRM PAYMENT ATOMIC (Landlord Confirms Tenant Payment Claim)
  CREATE OR REPLACE FUNCTION public.confirm_payment_atomic(
    p_payment_id UUID
  )
  RETURNS JSONB AS $$
  DECLARE
    v_caller UUID := auth.uid();
    v_peek RECORD;
    v_payment RECORD;
    v_tenant RECORD;
    v_property RECORD;
    v_unit RECORD;
    v_receipt_id UUID;
    v_receipt_number VARCHAR(50);
    v_remaining_payment DECIMAL(14,2);
    v_record RECORD;
    v_allocation DECIMAL(14,2);
    v_allocations JSONB := '[]'::jsonb;
    v_new_balance DECIMAL(14,2);
    v_new_advance_credit DECIMAL(14,2);
    v_snapshot JSONB;
  BEGIN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    -- 1. Peek payment to verify authorization BEFORE acquiring exclusive locks or disclosing receipt info
    SELECT id, tenant_id, property_id, status, receipt_number INTO v_peek 
    FROM public.payments WHERE id = p_payment_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Payment record % not found.', p_payment_id USING ERRCODE = 'P0002';
    END IF;

    -- 2. Strict Owner Authorization check FIRST:
    SELECT * INTO v_property FROM public.properties 
    WHERE id = v_peek.property_id AND (landlord_id = v_caller OR owner_id = v_caller);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unauthorized: Caller % does not own property %.', v_caller, v_peek.property_id USING ERRCODE = '42501';
    END IF;

    -- 3. Idempotent return if already confirmed
    IF v_peek.status = 'confirmed' THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_confirmed', true,
        'payment_id', p_payment_id,
        'receipt_number', v_peek.receipt_number
      );
    END IF;

    IF v_peek.status != 'pending_verification' THEN
      RAISE EXCEPTION 'Payment % is in status % and cannot be confirmed.', p_payment_id, v_peek.status USING ERRCODE = '22023';
    END IF;

    -- 4. Global Lock Ordering: Acquire exclusive lock on TENANT row FIRST to prevent deadlocks
    SELECT * INTO v_tenant FROM public.tenants WHERE id = v_peek.tenant_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tenant % not found.', v_peek.tenant_id USING ERRCODE = 'P0002';
    END IF;

    -- 5. Lock payment row
    SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
    IF v_payment.status = 'confirmed' THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_confirmed', true,
        'payment_id', p_payment_id,
        'receipt_number', v_payment.receipt_number
      );
    END IF;

    SELECT * INTO v_unit FROM public.units WHERE id = v_payment.unit_id;

    v_receipt_number := public.generate_receipt_number();
    v_remaining_payment := v_payment.amount;

    -- 6. Allocate payment across outstanding rent records (oldest due_date first, deterministic id order)
    FOR v_record IN
      SELECT * FROM public.rent_records
      WHERE tenant_id = v_tenant.id AND status IN ('pending', 'partial', 'overdue')
      ORDER BY due_date ASC, id ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining_payment <= 0;
      v_allocation := LEAST(v_remaining_payment, v_record.balance);
      
      UPDATE public.rent_records
      SET 
        amount_paid = amount_paid + v_allocation,
        balance = balance - v_allocation,
        status = CASE WHEN (balance - v_allocation) = 0 THEN 'paid' ELSE 'partial' END,
        updated_at = NOW()
      WHERE id = v_record.id;

      v_allocations := v_allocations || jsonb_build_object(
        'rent_record_id', v_record.id,
        'billing_period', v_record.billing_period,
        'amount_allocated', v_allocation,
        'prior_balance', v_record.balance,
        'new_balance', v_record.balance - v_allocation
      );

      v_remaining_payment := v_remaining_payment - v_allocation;
    END LOOP;

    -- 7. Update tenant advance credit and authoritative balance
    IF v_remaining_payment > 0 THEN
      v_new_advance_credit := v_tenant.advance_credit + v_remaining_payment;
      v_allocations := v_allocations || jsonb_build_object('advance_credit', v_remaining_payment);
    ELSE
      v_new_advance_credit := v_tenant.advance_credit;
    END IF;

    -- Authoritative balance: SUM of remaining rent records balances
    SELECT COALESCE(SUM(balance), 0) INTO v_new_balance
    FROM public.rent_records
    WHERE tenant_id = v_tenant.id;

    UPDATE public.tenants
    SET 
      current_balance = v_new_balance,
      advance_credit = v_new_advance_credit,
      updated_at = NOW()
    WHERE id = v_tenant.id;

    -- 8. Update payment row to confirmed
    UPDATE public.payments
    SET 
      status = 'confirmed',
      receipt_number = v_receipt_number,
      confirmed_by = v_caller,
      confirmed_at = NOW()
    WHERE id = v_payment.id;

    -- 9. Issue official receipt
    v_snapshot := jsonb_build_object(
      'tenantName', v_tenant.full_name,
      'tenantCode', v_tenant.tenant_code,
      'propertyName', v_property.name,
      'unitNumber', COALESCE(v_unit.unit_number, v_unit.title, 'Unit'),
      'landlordName', 'Property Management',
      'currency', COALESCE(v_property.currency, 'UGX'),
      'referenceNumber', v_payment.reference_number,
      'allocations', v_allocations,
      'advanceCredit', v_remaining_payment,
      'balanceAfter', v_new_balance,
      'confirmedBy', v_caller,
      'issueDate', NOW()
    );

    INSERT INTO public.receipts (
      payment_id, receipt_number, tenant_id, property_id, unit_id,
      amount, payment_method, balance_after, data_snapshot
    ) VALUES (
      v_payment.id, v_receipt_number, v_tenant.id, v_tenant.property_id, v_tenant.unit_id,
      v_payment.amount, v_payment.payment_method, v_new_balance, v_snapshot
    ) RETURNING id INTO v_receipt_id;

    -- 10. Notify tenant
    IF v_tenant.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id, title, message, channel, notification_type
      ) VALUES (
        v_tenant.user_id,
        'Payment Claim Confirmed',
        'Your payment claim of ' || COALESCE(v_property.currency, 'UGX') || ' ' || v_payment.amount::TEXT || ' has been approved. Receipt: ' || v_receipt_number,
        'in_app',
        'payment_received'
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'payment_id', v_payment.id,
      'receipt_number', v_receipt_number,
      'balance_after', v_new_balance,
      'advance_credit', v_new_advance_credit,
      'allocations', v_allocations
    );
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

  -- 5.3 AUTOMATIC ADVANCE CREDIT APPLICATION (Consumes advance credit for single or all outstanding periods)
  CREATE OR REPLACE FUNCTION public.apply_advance_credit_atomic(
    p_tenant_id UUID,
    p_rent_record_id UUID DEFAULT NULL
  )
  RETURNS JSONB AS $$
  DECLARE
    v_caller UUID := auth.uid();
    v_tenant RECORD;
    v_property RECORD;
    v_record RECORD;
    v_applied DECIMAL(14,2);
    v_total_applied DECIMAL(14,2) := 0;
    v_remaining_credit DECIMAL(14,2);
    v_new_balance DECIMAL(14,2);
    v_allocations JSONB := '[]'::jsonb;
    v_property_id UUID;
  BEGIN
    IF v_caller IS NULL THEN
      RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
    END IF;

    -- 1. Strict Owner Authorization check FIRST: Verify caller owns property BEFORE acquiring exclusive transaction locks
    SELECT property_id INTO v_property_id FROM public.tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tenant % not found.', p_tenant_id USING ERRCODE = 'P0002';
    END IF;

    SELECT * INTO v_property FROM public.properties 
    WHERE id = v_property_id AND (landlord_id = v_caller OR owner_id = v_caller);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unauthorized: Caller % does not own property %.', v_caller, v_property_id USING ERRCODE = '42501';
    END IF;

    -- 2. Lock tenant row under verified authorization
    SELECT * INTO v_tenant FROM public.tenants WHERE id = p_tenant_id FOR UPDATE;

    IF v_tenant.advance_credit <= 0 THEN
      RETURN jsonb_build_object('success', true, 'applied', 0, 'message', 'No advance credit available.');
    END IF;

    v_remaining_credit := v_tenant.advance_credit;

    -- 3. Lock and allocate across rent record(s) in deterministic order
    IF p_rent_record_id IS NOT NULL THEN
      SELECT * INTO v_record FROM public.rent_records WHERE id = p_rent_record_id FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Rent record % not found.', p_rent_record_id USING ERRCODE = 'P0002';
      END IF;
      IF v_record.tenant_id != v_tenant.id THEN
        RAISE EXCEPTION 'Rent record % does not belong to tenant %.', p_rent_record_id, p_tenant_id USING ERRCODE = '42501';
      END IF;
      IF v_record.property_id != v_tenant.property_id THEN
        RAISE EXCEPTION 'Rent record % does not belong to property %.', p_rent_record_id, v_tenant.property_id USING ERRCODE = '42501';
      END IF;

      IF v_record.balance > 0 THEN
        v_applied := LEAST(v_remaining_credit, v_record.balance);
        UPDATE public.rent_records
        SET 
          amount_paid = amount_paid + v_applied,
          balance = balance - v_applied,
          status = CASE WHEN (balance - v_applied) = 0 THEN 'paid' ELSE 'partial' END,
          updated_at = NOW()
        WHERE id = v_record.id;

        v_remaining_credit := v_remaining_credit - v_applied;
        v_total_applied := v_total_applied + v_applied;
        v_allocations := v_allocations || jsonb_build_object(
          'rent_record_id', v_record.id,
          'billing_period', v_record.billing_period,
          'applied', v_applied,
          'new_balance', v_record.balance - v_applied
        );
      END IF;
    ELSE
      FOR v_record IN
        SELECT * FROM public.rent_records
        WHERE tenant_id = v_tenant.id AND status IN ('pending', 'partial', 'overdue') AND balance > 0
        ORDER BY due_date ASC, id ASC
        FOR UPDATE
      LOOP
        EXIT WHEN v_remaining_credit <= 0;
        v_applied := LEAST(v_remaining_credit, v_record.balance);
        UPDATE public.rent_records
        SET 
          amount_paid = amount_paid + v_applied,
          balance = balance - v_applied,
          status = CASE WHEN (balance - v_applied) = 0 THEN 'paid' ELSE 'partial' END,
          updated_at = NOW()
        WHERE id = v_record.id;

        v_remaining_credit := v_remaining_credit - v_applied;
        v_total_applied := v_total_applied + v_applied;
        v_allocations := v_allocations || jsonb_build_object(
          'rent_record_id', v_record.id,
          'billing_period', v_record.billing_period,
          'applied', v_applied,
          'new_balance', v_record.balance - v_applied
        );
      END LOOP;
    END IF;

    -- Authoritatively recompute current_balance as sum of remaining rent record balances
    SELECT COALESCE(SUM(balance), 0) INTO v_new_balance 
    FROM public.rent_records 
    WHERE tenant_id = v_tenant.id;

    UPDATE public.tenants
    SET 
      advance_credit = v_remaining_credit,
      current_balance = v_new_balance,
      updated_at = NOW()
    WHERE id = v_tenant.id;

    RETURN jsonb_build_object(
      'success', true,
      'applied', v_total_applied,
      'remaining_advance_credit', v_remaining_credit,
      'new_tenant_balance', v_new_balance,
      'allocations', v_allocations
    );
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

  -- Explicit grants and revokes using precise signatures
  REVOKE ALL ON FUNCTION public.record_payment_atomic(UUID, DECIMAL, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.confirm_payment_atomic(UUID) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.apply_advance_credit_atomic(UUID, UUID) FROM PUBLIC;

  GRANT EXECUTE ON FUNCTION public.record_payment_atomic(UUID, DECIMAL, VARCHAR, VARCHAR, DATE, TEXT, VARCHAR) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.confirm_payment_atomic(UUID) TO authenticated;
  GRANT EXECUTE ON FUNCTION public.apply_advance_credit_atomic(UUID, UUID) TO authenticated;

-- =========================================================================
-- 6. REALTIME PUBLICATION REGISTRATION
-- =========================================================================

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
