-- MavRent Platform management schema and private maintenance media.
-- Safe to review and apply after confirming the target project. This file is not
-- executed automatically by the application.

begin;

-- Preserve the marketplace's existing properties and units.
alter table public.properties add column if not exists landlord_id uuid;
alter table public.properties add column if not exists currency text not null default 'UGX';
update public.properties set landlord_id = owner_id where landlord_id is null and owner_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'properties_landlord_id_fkey'
      and conrelid = 'public.properties'::regclass
  ) then
    alter table public.properties
      add constraint properties_landlord_id_fkey
      foreign key (landlord_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

create or replace function public.sync_property_owner_landlord()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.owner_id is null and new.landlord_id is not null then
    new.owner_id := new.landlord_id;
  elsif new.landlord_id is null and new.owner_id is not null then
    new.landlord_id := new.owner_id;
  elsif new.owner_id is not null and new.landlord_id is not null
        and new.owner_id <> new.landlord_id then
    raise exception 'owner_id and landlord_id must identify the same account';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_property_owner on public.properties;
create trigger trg_sync_property_owner
before insert or update of owner_id, landlord_id on public.properties
for each row execute function public.sync_property_owner_landlord();

alter table public.units add column if not exists unit_number text;
alter table public.units add column if not exists floor text;
alter table public.units add column if not exists occupancy_status text not null default 'available';
alter table public.units add column if not exists currency text not null default 'UGX';
alter table public.units add column if not exists furnished boolean not null default false;
alter table public.units add column if not exists available_from date;
alter table public.units add column if not exists bedrooms integer not null default 0;
alter table public.units add column if not exists bathrooms integer not null default 1;
update public.units set unit_number = title where unit_number is null and title is not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'units_occupancy_status_check' and conrelid = 'public.units'::regclass) then
    alter table public.units add constraint units_occupancy_status_check
      check (occupancy_status in ('available','occupied','maintenance','reserved'));
  end if;
end $$;

create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  name text not null,
  floors integer not null default 1 check (floors > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  user_id uuid references public.profiles(id) on delete set null,
  tenant_code text not null unique,
  full_name text not null,
  phone text not null,
  email text,
  start_date date not null default current_date,
  end_date date,
  rent_amount numeric(14,2) not null check (rent_amount >= 0),
  due_day integer not null default 1 check (due_day between 1 and 31),
  current_balance numeric(14,2) not null default 0,
  advance_credit numeric(14,2) not null default 0 check (advance_credit >= 0),
  status text not null default 'active' check (status in ('active','pending','expired','terminated')),
  emergency_contact jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenants_property_id_idx on public.tenants(property_id);
create index if not exists tenants_unit_id_idx on public.tenants(unit_id);
create index if not exists tenants_user_id_idx on public.tenants(user_id);

create table if not exists public.rent_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  billing_period text not null,
  amount_due numeric(14,2) not null check (amount_due >= 0),
  amount_paid numeric(14,2) not null default 0 check (amount_paid >= 0),
  balance numeric(14,2) not null default 0,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','partial','paid','overdue')),
  created_at timestamptz not null default now(),
  unique (tenant_id, billing_period)
);

create index if not exists rent_records_property_period_idx on public.rent_records(property_id, billing_period);
create index if not exists rent_records_tenant_due_idx on public.rent_records(tenant_id, due_date);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default current_date,
  payment_method text not null default 'cash',
  reference_number text,
  idempotency_key text unique,
  payload_hash text,
  receipt_number text unique,
  notes text,
  status text not null default 'confirmed' check (status in ('confirmed','pending_verification','reversed')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payments_property_date_idx on public.payments(property_id, payment_date desc);
create index if not exists payments_tenant_date_idx on public.payments(tenant_id, payment_date desc);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  receipt_number text not null unique,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null,
  balance_after numeric(14,2) not null default 0,
  issue_date timestamptz not null default now(),
  data_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  title text not null,
  description text not null,
  category text not null default 'other',
  priority text not null default 'medium' check (priority in ('low','medium','high','urgent')),
  status text not null default 'pending' check (status in ('pending','acknowledged','in_progress','completed','rejected','cancelled')),
  media_urls jsonb not null default '[]'::jsonb,
  assigned_worker text,
  landlord_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_property_status_idx on public.maintenance_requests(property_id, status);
create index if not exists maintenance_tenant_created_idx on public.maintenance_requests(tenant_id, created_at desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete restrict,
  unit_id uuid references public.units(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  category text not null default 'other',
  expense_date date not null default current_date,
  description text not null,
  receipt_attachment text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  channel text not null default 'in_app' check (channel in ('in_app','sms','whatsapp','email')),
  read boolean not null default false,
  notification_type text not null default 'system',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  action_type text not null,
  risk_level text not null default 'read_only' check (risk_level in ('read_only','low_risk_write','financial_write','destructive')),
  prompt text,
  prepared_action jsonb,
  executed boolean not null default false,
  confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Enable row-level security on all private management data.
alter table public.buildings enable row level security;
alter table public.tenants enable row level security;
alter table public.rent_records enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.expenses enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_audit_logs enable row level security;

-- Buildings: only the property's owner/manager may manage them.
drop policy if exists "platform_buildings_owner_manage" on public.buildings;
create policy "platform_buildings_owner_manage" on public.buildings for all to authenticated
using (exists (select 1 from public.properties p where p.id = buildings.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())))
with check (exists (select 1 from public.properties p where p.id = buildings.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())));

-- Tenants: landlord manages tenancy records; a linked tenant can only read their own record.
drop policy if exists "platform_tenants_owner_manage" on public.tenants;
create policy "platform_tenants_owner_manage" on public.tenants for all to authenticated
using (exists (select 1 from public.properties p where p.id = tenants.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())))
with check (exists (select 1 from public.properties p where p.id = tenants.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())));
drop policy if exists "platform_tenants_read_self" on public.tenants;
create policy "platform_tenants_read_self" on public.tenants for select to authenticated using (user_id = auth.uid());

-- Rent ledger, payments and receipts: landlord manages; tenants can read only their own records.
drop policy if exists "platform_rent_owner_manage" on public.rent_records;
create policy "platform_rent_owner_manage" on public.rent_records for all to authenticated
using (exists (select 1 from public.properties p where p.id = rent_records.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())))
with check (exists (select 1 from public.properties p where p.id = rent_records.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())));
drop policy if exists "platform_rent_tenant_read" on public.rent_records;
create policy "platform_rent_tenant_read" on public.rent_records for select to authenticated using (exists (select 1 from public.tenants t where t.id = rent_records.tenant_id and t.user_id = auth.uid()));

drop policy if exists "platform_payments_owner_manage" on public.payments;
create policy "platform_payments_owner_manage" on public.payments for all to authenticated
using (exists (select 1 from public.properties p where p.id = payments.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())))
with check (exists (select 1 from public.properties p where p.id = payments.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())));
drop policy if exists "platform_payments_tenant_read" on public.payments;
create policy "platform_payments_tenant_read" on public.payments for select to authenticated using (exists (select 1 from public.tenants t where t.id = payments.tenant_id and t.user_id = auth.uid()));

drop policy if exists "platform_receipts_owner_manage" on public.receipts;
create policy "platform_receipts_owner_manage" on public.receipts for all to authenticated
using (exists (select 1 from public.properties p where p.id = receipts.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())))
with check (exists (select 1 from public.properties p where p.id = receipts.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())));
drop policy if exists "platform_receipts_tenant_read" on public.receipts;
create policy "platform_receipts_tenant_read" on public.receipts for select to authenticated using (exists (select 1 from public.tenants t where t.id = receipts.tenant_id and t.user_id = auth.uid()));

-- Maintenance: owner manages; a linked tenant can read and submit only for their own lease.
drop policy if exists "platform_maintenance_owner_manage" on public.maintenance_requests;
create policy "platform_maintenance_owner_manage" on public.maintenance_requests for all to authenticated
using (exists (select 1 from public.properties p where p.id = maintenance_requests.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())))
with check (exists (select 1 from public.properties p where p.id = maintenance_requests.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())));
drop policy if exists "platform_maintenance_tenant_read" on public.maintenance_requests;
create policy "platform_maintenance_tenant_read" on public.maintenance_requests for select to authenticated using (exists (select 1 from public.tenants t where t.id = maintenance_requests.tenant_id and t.user_id = auth.uid()));
drop policy if exists "platform_maintenance_tenant_insert" on public.maintenance_requests;
create policy "platform_maintenance_tenant_insert" on public.maintenance_requests for insert to authenticated with check (
  exists (select 1 from public.tenants t where t.id = maintenance_requests.tenant_id and t.user_id = auth.uid()
    and t.property_id = maintenance_requests.property_id and t.unit_id = maintenance_requests.unit_id and t.status = 'active')
);

-- Expenses are landlord-private.
drop policy if exists "platform_expenses_owner_manage" on public.expenses;
create policy "platform_expenses_owner_manage" on public.expenses for all to authenticated
using (exists (select 1 from public.properties p where p.id = expenses.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())))
with check (exists (select 1 from public.properties p where p.id = expenses.property_id and (p.owner_id = auth.uid() or p.landlord_id = auth.uid())));

-- Notifications and AI audit rows are private to their account.
drop policy if exists "platform_notifications_read_own" on public.notifications;
create policy "platform_notifications_read_own" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "platform_notifications_update_own" on public.notifications;
create policy "platform_notifications_update_own" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "platform_audit_read_own" on public.ai_audit_logs;
create policy "platform_audit_read_own" on public.ai_audit_logs for select to authenticated using (user_id = auth.uid());
drop policy if exists "platform_audit_insert_own" on public.ai_audit_logs;
create policy "platform_audit_insert_own" on public.ai_audit_logs for insert to authenticated with check (user_id = auth.uid());

-- Private bucket for maintenance evidence. Paths are property-id / uploader-user-id / filename.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maintenance-media', 'maintenance-media', false, 52428800, array['image/*','video/*'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['image/*','video/*'];

drop policy if exists "platform_maintenance_media_read" on storage.objects;
create policy "platform_maintenance_media_read" on storage.objects for select to authenticated using (
  bucket_id = 'maintenance-media' and (
    exists (select 1 from public.properties p where p.id::text = (storage.foldername(name))[1] and (p.owner_id = auth.uid() or p.landlord_id = auth.uid()))
    or exists (select 1 from public.tenants t where t.property_id::text = (storage.foldername(name))[1] and t.user_id = auth.uid() and (storage.foldername(name))[2] = auth.uid()::text)
  )
);
drop policy if exists "platform_maintenance_media_insert" on storage.objects;
create policy "platform_maintenance_media_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'maintenance-media' and (storage.foldername(name))[2] = auth.uid()::text and (
    exists (select 1 from public.properties p where p.id::text = (storage.foldername(name))[1] and (p.owner_id = auth.uid() or p.landlord_id = auth.uid()))
    or exists (select 1 from public.tenants t where t.property_id::text = (storage.foldername(name))[1] and t.user_id = auth.uid() and t.status = 'active')
  )
);
drop policy if exists "platform_maintenance_media_delete" on storage.objects;
create policy "platform_maintenance_media_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'maintenance-media' and (storage.foldername(name))[2] = auth.uid()::text and (
    exists (select 1 from public.properties p where p.id::text = (storage.foldername(name))[1] and (p.owner_id = auth.uid() or p.landlord_id = auth.uid()))
    or exists (select 1 from public.tenants t where t.property_id::text = (storage.foldername(name))[1] and t.user_id = auth.uid() and t.status = 'active')
  )
);

commit;
