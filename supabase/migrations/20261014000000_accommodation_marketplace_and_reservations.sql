-- =========================================================================
-- MavRent Platform - Accommodation Marketplace & Short-Stay Reservations
-- Migration: 20261014000000_accommodation_marketplace_and_reservations.sql
-- Status: Review Only - Prepared for validation and preflight
-- =========================================================================

-- 1. RECONCILE UNITS COLUMNS FOR UNIFIED MARKETPLACE & SHORT-STAY
DO $$
BEGIN
  -- Category
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'category'
  ) THEN
    ALTER TABLE public.units ADD COLUMN category VARCHAR(50) DEFAULT 'apartment';
  END IF;

  -- Stay Type: 'monthly', 'nightly', 'both'
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'stay_type'
  ) THEN
    ALTER TABLE public.units ADD COLUMN stay_type VARCHAR(20) DEFAULT 'monthly';
  END IF;

  -- Nightly Rate
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'nightly_rate'
  ) THEN
    ALTER TABLE public.units ADD COLUMN nightly_rate DECIMAL(14,2) DEFAULT 0;
  END IF;

  -- Weekly Rate
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'weekly_rate'
  ) THEN
    ALTER TABLE public.units ADD COLUMN weekly_rate DECIMAL(14,2);
  END IF;

  -- Cleaning Fee
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'cleaning_fee'
  ) THEN
    ALTER TABLE public.units ADD COLUMN cleaning_fee DECIMAL(14,2) DEFAULT 0;
  END IF;

  -- Bedrooms
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'bedrooms'
  ) THEN
    ALTER TABLE public.units ADD COLUMN bedrooms INT DEFAULT 1;
  END IF;

  -- Bathrooms
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'bathrooms'
  ) THEN
    ALTER TABLE public.units ADD COLUMN bathrooms DECIMAL(3,1) DEFAULT 1;
  END IF;

  -- Max Guests
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'max_guests'
  ) THEN
    ALTER TABLE public.units ADD COLUMN max_guests INT DEFAULT 2;
  END IF;

  -- Amenities JSONB
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'amenities'
  ) THEN
    ALTER TABLE public.units ADD COLUMN amenities JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- Images JSONB
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'images'
  ) THEN
    ALTER TABLE public.units ADD COLUMN images JSONB DEFAULT '[]'::jsonb;
  END IF;

  -- House Rules JSONB
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name = 'house_rules'
  ) THEN
    ALTER TABLE public.units ADD COLUMN house_rules JSONB DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- 2. SHORT-STAY RESERVATIONS TABLE
-- Strictly separated from long-term lease ledgers and tenant rent records
CREATE TABLE IF NOT EXISTS public.short_stay_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  guest_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  booking_reference VARCHAR(50) NOT NULL UNIQUE,
  guest_name VARCHAR(255) NOT NULL,
  guest_email VARCHAR(255) NOT NULL,
  guest_phone VARCHAR(50) NOT NULL,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  guest_count INT NOT NULL DEFAULT 1 CHECK (guest_count >= 1),
  nights INT NOT NULL CHECK (nights >= 1),
  nightly_rate DECIMAL(14,2) NOT NULL CHECK (nightly_rate >= 0),
  service_fee DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  cleaning_fee DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (cleaning_fee >= 0),
  total_amount DECIMAL(14,2) NOT NULL CHECK (total_amount >= 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'UGX',
  special_requests TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending_confirmation' 
    CHECK (status IN ('pending_confirmation', 'confirmed', 'cancelled', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_dates_valid CHECK (check_in < check_out)
);

-- Performance indexes for short-stay reservations
CREATE INDEX IF NOT EXISTS idx_reservations_unit ON public.short_stay_reservations(unit_id);
CREATE INDEX IF NOT EXISTS idx_reservations_property ON public.short_stay_reservations(property_id);
CREATE INDEX IF NOT EXISTS idx_reservations_dates ON public.short_stay_reservations(unit_id, check_in, check_out);
CREATE INDEX IF NOT EXISTS idx_reservations_status ON public.short_stay_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_ref ON public.short_stay_reservations(booking_reference);

-- 3. MARKETPLACE INQUIRIES & VIEWING REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.marketplace_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  inquiry_type VARCHAR(50) NOT NULL DEFAULT 'general_inquiry'
    CHECK (inquiry_type IN ('viewing_request', 'general_inquiry', 'lease_application', 'booking_inquiry')),
  preferred_date DATE,
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'responded', 'scheduled', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inquiries_unit ON public.marketplace_inquiries(unit_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_property ON public.marketplace_inquiries(property_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_user ON public.marketplace_inquiries(user_id);

-- 4. OVERLAPPING RESERVATION CONCURRENCY TRIGGER
-- Strictly prevents double-booking of confirmed reservations on the same unit
CREATE OR REPLACE FUNCTION public.check_reservation_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'confirmed' THEN
    IF EXISTS (
      SELECT 1 FROM public.short_stay_reservations
      WHERE unit_id = NEW.unit_id
        AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
        AND status = 'confirmed'
        AND NOT (check_out <= NEW.check_in OR check_in >= NEW.check_out)
    ) THEN
      RAISE EXCEPTION 'Double-booking conflict: Unit % already has a confirmed reservation overlapping dates % to %.',
        NEW.unit_id, NEW.check_in, NEW.check_out
        USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_check_reservation_overlap ON public.short_stay_reservations;
CREATE TRIGGER trg_check_reservation_overlap
BEFORE INSERT OR UPDATE ON public.short_stay_reservations
FOR EACH ROW EXECUTE FUNCTION public.check_reservation_overlap();

-- 5. ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.short_stay_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_inquiries ENABLE ROW LEVEL SECURITY;

-- 5.1 RESERVATIONS POLICIES
DROP POLICY IF EXISTS "Hosts view property reservations" ON public.short_stay_reservations;
DROP POLICY IF EXISTS "Guests view own reservations" ON public.short_stay_reservations;
DROP POLICY IF EXISTS "Guests create reservation requests" ON public.short_stay_reservations;
DROP POLICY IF EXISTS "Hosts manage property reservations" ON public.short_stay_reservations;

CREATE POLICY "Hosts manage property reservations" ON public.short_stay_reservations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = short_stay_reservations.property_id
        AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = short_stay_reservations.property_id
        AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Guests view own reservations" ON public.short_stay_reservations
  FOR SELECT TO authenticated
  USING (guest_id = auth.uid());

CREATE POLICY "Anyone submit reservation requests" ON public.short_stay_reservations
  FOR INSERT TO authenticated, anon
  WITH CHECK (status = 'pending_confirmation');

-- 5.2 INQUIRIES POLICIES
DROP POLICY IF EXISTS "Hosts manage inquiries" ON public.marketplace_inquiries;
DROP POLICY IF EXISTS "Users view own inquiries" ON public.marketplace_inquiries;
DROP POLICY IF EXISTS "Anyone submit inquiries" ON public.marketplace_inquiries;

CREATE POLICY "Hosts manage inquiries" ON public.marketplace_inquiries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = marketplace_inquiries.property_id
        AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = marketplace_inquiries.property_id
        AND (p.landlord_id = auth.uid() OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Users view own inquiries" ON public.marketplace_inquiries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Anyone submit inquiries" ON public.marketplace_inquiries
  FOR INSERT TO authenticated, anon
  WITH CHECK (status = 'pending');
