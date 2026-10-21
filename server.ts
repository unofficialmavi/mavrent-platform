import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';
import { fileURLToPath, pathToFileURL } from 'url';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Initialize Google Gemini on the server side (API key never exposed to browser)
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey
  ? new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// Initialize Supabase Admin client on the server side (Protected Service Role)
const rawUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseUrl = rawUrl.startsWith('http')
  ? rawUrl
  : rawUrl ? `https://${rawUrl}.supabase.co` : '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    })
  : null;

// Helper to map property types to database enum: 'apartment' | 'house' | 'room' | 'hostel' | 'studio' | 'office' | 'shop' | 'other'
function mapPropertyTypeToDb(rawType?: string): string {
  if (!rawType) return 'apartment';
  const norm = rawType.toLowerCase().trim();
  const validDbTypes = ['apartment', 'house', 'room', 'hostel', 'studio', 'office', 'shop', 'other'];
  if (validDbTypes.includes(norm)) return norm;
  if (norm === 'residential') return 'apartment';
  if (norm === 'commercial') return 'office';
  if (norm === 'mixed') return 'other';
  return 'apartment';
}

// Helper to map management unit status: preserves physical occupancy without auto-publishing marketplace listings
// Management occupancy status: 'available' | 'occupied' | 'maintenance' | 'reserved'
function mapUnitStatusToDb(rawStatus?: string): string {
  if (!rawStatus) return 'available';
  const norm = rawStatus.toLowerCase().trim();
  const validDbStatuses = ['available', 'occupied', 'maintenance', 'reserved'];
  if (validDbStatuses.includes(norm)) return norm;
  if (norm === 'rented') return 'occupied';
  return 'available';
}

// Helper to authenticate request from Bearer JWT
async function getAuthenticatedUser(req: express.Request) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !supabaseAdmin) return null;
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return null;
    return user;
  } catch (err) {
    return null;
  }
}

// API root status endpoint
app.get('/api', (_req, res) => {
  res.json({
    status: 'online',
    service: 'MavRent Platform API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.all('/api', (req, res) => {
  res.setHeader('Allow', 'GET');
  res.status(405).json({
    success: false,
    error: `Method ${req.method} not allowed on /api. Please use GET.`,
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'MavRent Platform API',
    timestamp: new Date().toISOString(),
    geminiConfigured: !!apiKey,
    supabaseConfigured: !!supabaseAdmin || !!(supabaseUrl && supabaseAnonKey),
  });
});

// Provide public Supabase client config to the client application
app.get('/api/config/supabase', (req, res) => {
  res.json({
    configured: !!(supabaseUrl && supabaseAnonKey),
    url: supabaseUrl || '',
    anonKey: supabaseAnonKey || '',
  });
});

// =========================================================================
// AUTHENTICATION ROUTES (Real Supabase Auth with Server Safeguards)
// =========================================================================

app.post('/api/auth/signup', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase admin is not configured.' });
    }
    const { email, password, fullName, phone, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (role && role !== 'landlord' && role !== 'tenant') {
      return res.status(400).json({ error: 'Public sign-up supports landlord or tenant accounts only.' });
    }

    // Create user in Supabase auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email for frictionless SaaS verification
      user_metadata: { full_name: fullName, role: role || 'landlord' },
    });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    const userId = authData.user.id;
    const dbRole = role === 'tenant' ? 'renter' : 'landlord';

    // Insert or update profile
    await supabaseAdmin.from('profiles').upsert({
      id: userId,
      full_name: fullName || '',
      phone: phone || null,
      role: dbRole,
    });

    // Create a session for client
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: sessionData, error: sessionError } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) {
      return res.json({
        success: true,
        user: authData.user,
        message: 'Account created. Please sign in.',
      });
    }

    res.json({
      success: true,
      session: sessionData.session,
      user: sessionData.user,
      profile: {
        id: userId,
        fullName,
        email,
        phone,
        role: role || 'landlord',
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Signup failed' });
  }
});

app.all('/api/auth/signup', (req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({
    success: false,
    error: `Method ${req.method} not allowed on /api/auth/signup. Please use POST.`,
  });
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(503).json({ error: 'Supabase is not configured.' });
    }
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: sessionData, error: sessionError } = await anonClient.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError) {
      // If error is email_not_confirmed, auto-confirm via admin and retry
      if (sessionError.message.includes('Email not confirmed') && supabaseAdmin) {
        const { data: users } = await supabaseAdmin.auth.admin.listUsers();
        const target = users?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (target) {
          await supabaseAdmin.auth.admin.updateUserById(target.id, { email_confirm: true });
          const retry = await anonClient.auth.signInWithPassword({ email, password });
          if (!retry.error) {
            let prof = null;
            if (supabaseAdmin) {
              const { data: p } = await supabaseAdmin.from('profiles').select('*').eq('id', target.id).single();
              prof = p;
            }
            return res.json({
              success: true,
              session: retry.data.session,
              user: retry.data.user,
              profile: prof,
            });
          }
        }
      }
      return res.status(401).json({ error: sessionError.message });
    }

    let profile = null;
    if (supabaseAdmin && sessionData.user) {
      const { data: p } = await supabaseAdmin.from('profiles').select('*').eq('id', sessionData.user.id).single();
      profile = p;
    }

    res.json({
      success: true,
      session: sessionData.session,
      user: sessionData.user,
      profile,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Signin failed' });
  }
});

app.all('/api/auth/signin', (req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({
    success: false,
    error: `Method ${req.method} not allowed on /api/auth/signin. Please use POST.`,
  });
});

// Public rental marketplace: only explicitly published listings are exposed.
app.get('/api/marketplace/listings', async (_req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ success: false, error: 'Marketplace is temporarily unavailable.' });
    }

    const { data: units, error: unitsError } = await supabaseAdmin
      .from('units')
      .select('*')
      .eq('status', 'published')
      .order('created_at', { ascending: false })
      .limit(100);

    if (unitsError) {
      console.error('Marketplace listings query failed:', unitsError);
      return res.status(500).json({ success: false, error: 'Unable to load available rentals.' });
    }

    const rows = (units || []).filter((unit: any) => !unit.occupancy_status || unit.occupancy_status === 'available');
    const propertyIds = [...new Set(rows.map((unit: any) => unit.property_id).filter(Boolean))];
    if (!propertyIds.length) return res.json({ success: true, listings: [] });

    const [{ data: properties, error: propertiesError }, { data: media }] = await Promise.all([
      supabaseAdmin.from('properties').select('id,name,description,address,area,district,city,country,property_type,cover_image_url').in('id', propertyIds),
      supabaseAdmin.from('listing_media').select('unit_id,media_url,media_type,sort_order').in('unit_id', rows.map((unit: any) => unit.id)).order('sort_order', { ascending: true }),
    ]);

    if (propertiesError) {
      console.error('Marketplace property query failed:', propertiesError);
      return res.status(500).json({ success: false, error: 'Unable to load rental details.' });
    }

    const propertyMap = new Map((properties || []).map((property: any) => [property.id, property]));
    const mediaMap = new Map<string, any[]>();
    for (const item of media || []) {
      const existing = mediaMap.get(item.unit_id) || [];
      existing.push(item);
      mediaMap.set(item.unit_id, existing);
    }

    const listings = rows
      .map((unit: any) => {
        const prop = propertyMap.get(unit.property_id);
        const unitMedia = mediaMap.get(unit.id) || [];
        const mediaUrls = unitMedia.map((m: any) => m.media_url).filter(Boolean);
        const imagesList = Array.isArray(unit.images) && unit.images.length > 0
          ? unit.images
          : mediaUrls.length > 0
          ? mediaUrls
          : (prop?.cover_image_url ? [prop.cover_image_url] : []);

        const category = unit.category || unit.accommodation_category || prop?.property_type || 'apartment';
        const stayType = unit.stay_type || (unit.nightly_rate > 0 ? (unit.monthly_rent > 0 ? 'both' : 'nightly') : 'monthly');

        return {
          id: unit.id,
          propertyId: unit.property_id,
          landlordId: prop?.landlord_id || prop?.owner_id || '',
          title: unit.title || `${prop?.name || 'Property'} - Unit ${unit.unit_number || ''}`.trim(),
          propertyName: prop?.name || 'Property',
          address: prop?.address || '',
          city: prop?.city || prop?.district || prop?.area || 'Kampala',
          country: prop?.country || 'Uganda',
          currency: unit.currency || prop?.currency || 'UGX',
          propertyType: prop?.property_type || 'residential',
          category: category,
          stayType: stayType,
          unitType: unit.unit_type || 'apartment',
          unitNumber: unit.unit_number || '',
          monthlyRent: Number(unit.monthly_rent || 0),
          depositAmount: Number(unit.deposit_amount || 0),
          nightlyRate: Number(unit.nightly_rate || 0),
          weeklyRate: unit.weekly_rate ? Number(unit.weekly_rate) : undefined,
          cleaningFee: Number(unit.cleaning_fee || 0),
          bedrooms: Number(unit.bedrooms || 1),
          bathrooms: Number(unit.bathrooms || 1),
          maxGuests: Number(unit.max_guests || 2),
          floor: unit.floor || undefined,
          amenities: Array.isArray(unit.amenities) ? unit.amenities : [],
          images: imagesList,
          houseRules: Array.isArray(unit.house_rules) ? unit.house_rules : [],
          description: unit.description || prop?.description || '',
          marketplaceStatus: unit.status || 'published',
          occupancyStatus: unit.occupancy_status || 'available',
          property: prop || null,
          media: unitMedia,
        };
      })
      .filter((listing: any) => listing.property !== null);

    return res.json({ success: true, listings });
  } catch (error: any) {
    console.error('Marketplace listings error:', error);
    return res.status(500).json({ success: false, error: 'Unable to load available rentals.' });
  }
});

// Public marketplace inquiry and viewing-request endpoints.
app.post('/api/marketplace/inquiries', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Marketplace is temporarily unavailable.' });
    const { unitId, name, phone, email, message } = req.body;
    if (!unitId || !name || !phone || !email) {
      return res.status(400).json({ success: false, error: 'Rental, name, phone, and email are required.' });
    }
    const { data: unit, error: unitError } = await supabaseAdmin.from('units').select('id,status').eq('id', unitId).maybeSingle();
    if (unitError) return res.status(503).json({ success: false, error: 'Marketplace data is not ready.' });
    if (!unit || unit.status !== 'published') return res.status(404).json({ success: false, error: 'This rental listing is no longer available.' });
    const user = await getAuthenticatedUser(req);
    const { data, error } = await supabaseAdmin.from('inquiries').insert({
      unit_id: unitId, renter_id: user?.id || null, name: String(name).trim(),
      phone: String(phone).trim(), email: String(email).trim().toLowerCase(),
      message: String(message || '').trim() || null, status: 'new',
    }).select('id,status,created_at').single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    return res.json({ success: true, inquiry: data, message: 'Your inquiry has been sent to the property manager.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Could not submit your inquiry.' });
  }
});

app.post('/api/marketplace/viewings', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ success: false, error: 'Marketplace is temporarily unavailable.' });
    const { unitId, name, phone, email, preferredDate, preferredTime, note } = req.body;
    if (!unitId || !name || !phone || !email || !preferredDate || !preferredTime) {
      return res.status(400).json({ success: false, error: 'Rental, contact details, preferred date, and time are required.' });
    }
    const { data: unit, error: unitError } = await supabaseAdmin.from('units').select('id,status').eq('id', unitId).maybeSingle();
    if (unitError) return res.status(503).json({ success: false, error: 'Marketplace data is not ready.' });
    if (!unit || unit.status !== 'published') return res.status(404).json({ success: false, error: 'This rental listing is no longer available.' });
    const user = await getAuthenticatedUser(req);
    const { data, error } = await supabaseAdmin.from('viewing_requests').insert({
      unit_id: unitId, renter_id: user?.id || null,
      preferred_date: preferredDate, preferred_time: String(preferredTime).trim(),
      note: [`Name: ${String(name).trim()}`, `Phone: ${String(phone).trim()}`, `Email: ${String(email).trim().toLowerCase()}`, String(note || '').trim()].filter(Boolean).join(' | '),
      status: 'requested',
    }).select('id,status,created_at').single();
    if (error) return res.status(400).json({ success: false, error: error.message });
    return res.json({ success: true, viewing: data, message: 'Your viewing request has been sent to the property manager.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Could not submit your viewing request.' });
  }
});

// =========================================================================
// REAL-TIME DATA & PORTFOLIO ROUTES (Connected to Live Supabase Database)
// =========================================================================

app.get('/api/data/portfolio', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({
        success: false,
        error: 'Server database credentials are missing. Please contact platform support.',
      });
    }

    const user = await getAuthenticatedUser(req);
    let isTenant = false;
    let userProfile = null;

    if (user) {
      const { data: p } = await supabaseAdmin.from('profiles').select('*').eq('id', user.id).single();
      userProfile = p;
      if (p?.role === 'renter' || p?.role === 'tenant') {
        isTenant = true;
      }
    }

    // Branch 1: Tenant data isolation
    if (isTenant && user) {
      // Find tenant record linked to this authenticated user (strictly verified user_id only)
      const { data: tenantRecords, error: tenantRecordsError } = await supabaseAdmin
        .from('tenants')
        .select('*')
        .eq('user_id', user.id);
      if (tenantRecordsError) {
        console.error('Tenant portfolio schema/query error:', tenantRecordsError);
        return res.status(503).json({ error: 'Tenant management data is not ready. Please contact platform support.' });
      }

      const tenantRows = tenantRecords || [];
      const tenantIds = tenantRows.map((t) => t.id);
      const propertyIds = tenantRows.map((t) => t.property_id);
      const unitIds = tenantRows.map((t) => t.unit_id);

      let properties: any[] = [];
      let units: any[] = [];
      let buildings: any[] = [];
      let rentRecords: any[] = [];
      let payments: any[] = [];
      let receipts: any[] = [];
      let maintenanceRequests: any[] = [];
      let notifications: any[] = [];

      if (propertyIds.length > 0) {
        const { data: pData } = await supabaseAdmin.from('properties').select('*').in('id', propertyIds);
        properties = pData || [];
        const { data: bData } = await supabaseAdmin.from('buildings').select('*').in('property_id', propertyIds);
        buildings = bData || [];
      }

      if (unitIds.length > 0) {
        const { data: uData } = await supabaseAdmin.from('units').select('*').in('id', unitIds);
        units = uData || [];
      }

      if (tenantIds.length > 0) {
        const { data: rData } = await supabaseAdmin.from('rent_records').select('*').in('tenant_id', tenantIds);
        rentRecords = rData || [];
        const { data: payData } = await supabaseAdmin.from('payments').select('*').in('tenant_id', tenantIds);
        payments = payData || [];
        const { data: rcpData } = await supabaseAdmin.from('receipts').select('*').in('tenant_id', tenantIds);
        receipts = rcpData || [];
        const { data: mData } = await supabaseAdmin.from('maintenance_requests').select('*').in('tenant_id', tenantIds);
        maintenanceRequests = mData || [];
      }

      const { data: nData } = await supabaseAdmin.from('notifications').select('*').eq('user_id', user.id);
      notifications = nData || [];

      return res.json({
        success: true,
        fromSupabase: true,
        role: 'tenant',
        properties,
        buildings,
        units,
        tenants: tenantRows,
        rentRecords,
        payments,
        receipts,
        maintenanceRequests,
        expenses: [], // strictly hidden from tenants
        notifications,
      });
    }

    // Branch 2: Landlord / Property Manager Portfolio
    if (!user) {
      return res.status(401).json({ error: 'Authentication required to view landlord management portfolio.' });
    }

    const { data: properties, error: propErr } = await supabaseAdmin
      .from('properties')
      .select('*')
      .or(`landlord_id.eq.${user.id},owner_id.eq.${user.id}`);
    if (propErr) {
      console.error('Error querying properties:', propErr);
      return res.status(500).json({ error: 'Failed to load properties', details: propErr.message });
    }

    const propList = properties || [];
    const propIds = propList.map((p) => p.id);

    let buildings: any[] = [];
    let units: any[] = [];
    let tenants: any[] = [];
    let rentRecords: any[] = [];
    let payments: any[] = [];
    let receipts: any[] = [];
    let maintenanceRequests: any[] = [];
    let expenses: any[] = [];
    let notifications: any[] = [];

    if (propIds.length > 0) {
      const [bRes, uRes, tRes, rrRes, payRes, rcpRes, mRes, expRes] = await Promise.all([
        supabaseAdmin.from('buildings').select('*').in('property_id', propIds),
        supabaseAdmin.from('units').select('*').in('property_id', propIds),
        supabaseAdmin.from('tenants').select('*').in('property_id', propIds),
        supabaseAdmin.from('rent_records').select('*').in('property_id', propIds),
        supabaseAdmin.from('payments').select('*').in('property_id', propIds),
        supabaseAdmin.from('receipts').select('*').in('property_id', propIds),
        supabaseAdmin.from('maintenance_requests').select('*').in('property_id', propIds),
        supabaseAdmin.from('expenses').select('*').in('property_id', propIds),
      ]);

      const schemaError = [bRes.error, uRes.error, tRes.error, rrRes.error, payRes.error, rcpRes.error, mRes.error, expRes.error].find(Boolean);
      if (schemaError) {
        console.error('Management schema/query error:', schemaError);
        return res.status(503).json({ error: 'Management database setup is incomplete. Please contact platform support to finish the setup.' });
      }

      if (bRes.data) buildings = bRes.data;
      if (uRes.data) units = uRes.data;
      if (tRes.data) tenants = tRes.data;
      if (rrRes.data) rentRecords = rrRes.data;
      if (payRes.data) payments = payRes.data;
      if (rcpRes.data) receipts = rcpRes.data;
      if (mRes.data) maintenanceRequests = mRes.data;
      if (expRes.data) expenses = expRes.data;
    }

    if (user) {
      const { data: notifData } = await supabaseAdmin.from('notifications').select('*').eq('user_id', user.id);
      if (notifData) notifications = notifData;
    }

    res.json({
      success: true,
      fromSupabase: true,
      role: 'landlord',
      properties: propList,
      buildings,
      units,
      tenants,
      rentRecords,
      payments,
      receipts,
      maintenanceRequests,
      expenses,
      notifications,
    });
  } catch (err: any) {
    console.error('Portfolio query error:', err);
    res.status(500).json({ error: 'Internal server error fetching portfolio', details: err.message });
  }
});

// Create property in live Supabase
app.post('/api/data/properties', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase admin is not configured.' });
    }
    const user = await getAuthenticatedUser(req);
    const { name, address, area, district, city, country, propertyType, currency } = req.body;

    if (!name || !address) {
      return res.status(400).json({ error: 'Name and address are required' });
    }

    if (!user) {
      return res.status(401).json({ error: 'Authentication required to create a property.' });
    }
    const ownerId = user.id;

    const dbPropertyType = mapPropertyTypeToDb(propertyType);

    const { data, error } = await supabaseAdmin
      .from('properties')
      .insert({
        owner_id: ownerId,
        landlord_id: ownerId,
        name,
        address,
        area: area || city || 'Central',
        district: district || city || 'Central',
        city: city || 'Kampala',
        country: country || 'Uganda',
        currency: currency || 'UGX',
        property_type: dbPropertyType,
      })
      .select()
      .single();

    if (error) {
      console.error('Create property error:', error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, property: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create property' });
  }
});

// Create unit in live Supabase
app.post('/api/data/units', async (req, res) => {
  try {
    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Supabase admin is not configured.' });
    }
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { propertyId, unitNumber, title, unitType, monthlyRent, depositAmount, currency, floor, status } = req.body;

    if (!propertyId) {
      return res.status(400).json({ error: 'propertyId is required' });
    }

    // Verify caller owns propertyId
    const { data: prop } = await supabaseAdmin
      .from('properties')
      .select('id, landlord_id, owner_id')
      .eq('id', propertyId)
      .single();

    if (!prop || (prop.landlord_id !== user.id && prop.owner_id !== user.id)) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this property.' });
    }

    const dbStatus = mapUnitStatusToDb(status || 'available');

    const { data, error } = await supabaseAdmin
      .from('units')
      .insert({
        property_id: propertyId,
        title: title || unitNumber || 'Unit',
        unit_number: unitNumber || title || 'Unit',
        unit_type: unitType || 'apartment',
        monthly_rent: Number(monthlyRent || 0),
        deposit_amount: Number(depositAmount || monthlyRent || 0),
        currency: currency || 'UGX',
        occupancy_status: dbStatus,
        status: 'draft',
      })
      .select()
      .single();

    if (error) {
      console.error('Create unit error:', error);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, unit: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create unit' });
  }
});

// Explicitly publish or pause a listing; occupancy remains a separate field.
app.patch('/api/data/units/:id/listing-status', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });

    const { id } = req.params;
    const { status } = req.body;
    const allowedStatuses = ['draft', 'pending_review', 'published', 'paused', 'archived'];
    if (!allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid marketplace listing status.' });

    const { data: unit, error: unitError } = await supabaseAdmin
      .from('units').select('id,property_id,occupancy_status').eq('id', id).maybeSingle();
    if (unitError) return res.status(503).json({ error: 'Unit database is not ready.' });
    if (!unit) return res.status(404).json({ error: 'Unit not found.' });

    const { data: property } = await supabaseAdmin
      .from('properties').select('owner_id,landlord_id').eq('id', unit.property_id).maybeSingle();
    if (!property || (property.owner_id !== user.id && property.landlord_id !== user.id)) {
      return res.status(403).json({ error: "Only the property's landlord or manager can publish listings." });
    }
    if (status === 'published' && unit.occupancy_status !== 'available') {
      return res.status(409).json({ error: 'Only physically available units can be published. Update occupancy first.' });
    }

    const { data, error } = await supabaseAdmin
      .from('units').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, unit: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update listing status.' });
  }
});

// Attach public marketplace media to a unit after a verified storage upload.
app.post('/api/data/units/:id/media', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    const { id } = req.params;
    const { objectPath, mediaType } = req.body;
    if (!objectPath || !['image', 'video'].includes(mediaType)) {
      return res.status(400).json({ error: 'A media path and type (image or video) are required.' });
    }
    const { data: unit } = await supabaseAdmin.from('units').select('id,property_id').eq('id', id).maybeSingle();
    if (!unit) return res.status(404).json({ error: 'Unit not found.' });
    const expectedPrefix = `${unit.property_id}/${unit.id}/${user.id}/`;
    if (typeof objectPath !== 'string' || !objectPath.startsWith(expectedPrefix)) {
      return res.status(400).json({ error: 'The uploaded media path is invalid for this unit.' });
    }
    const { data: property } = await supabaseAdmin.from('properties').select('owner_id,landlord_id').eq('id', unit.property_id).maybeSingle();
    if (!property || (property.owner_id !== user.id && property.landlord_id !== user.id)) {
      return res.status(403).json({ error: "Only the property's landlord or manager can add listing media." });
    }
    const publicUrl = supabaseAdmin.storage.from('rental-listing-media').getPublicUrl(objectPath).data.publicUrl;
    const { data, error } = await supabaseAdmin.from('listing_media').insert({
      unit_id: unit.id,
      media_url: publicUrl,
      media_type: mediaType,
      sort_order: 0,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, media: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Could not save listing media.' });
  }
});

// Update property in live Supabase
app.put('/api/data/properties/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { id } = req.params;
    const { data: prop } = await supabaseAdmin
      .from('properties')
      .select('landlord_id, owner_id')
      .eq('id', id)
      .single();

    if (!prop || (prop.landlord_id !== user.id && prop.owner_id !== user.id)) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this property.' });
    }

    const { name, address, city, country, propertyType, currency } = req.body;
    const { data, error } = await supabaseAdmin
      .from('properties')
      .update({
        ...(name ? { name } : {}),
        ...(address ? { address } : {}),
        ...(city ? { city } : {}),
        ...(country ? { country } : {}),
        ...(propertyType ? { property_type: mapPropertyTypeToDb(propertyType) } : {}),
        ...(currency ? { currency } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, property: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update unit in live Supabase
app.put('/api/data/units/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { id } = req.params;
    const { data: unit } = await supabaseAdmin
      .from('units')
      .select('property_id')
      .eq('id', id)
      .single();

    if (!unit) return res.status(404).json({ error: 'Unit not found.' });

    const { data: prop } = await supabaseAdmin
      .from('properties')
      .select('landlord_id, owner_id')
      .eq('id', unit.property_id)
      .single();

    if (!prop || (prop.landlord_id !== user.id && prop.owner_id !== user.id)) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this property.' });
    }

    const { unitNumber, title, unitType, monthlyRent, depositAmount, status, notes, floor } = req.body;
    const { data, error } = await supabaseAdmin
      .from('units')
      .update({
        ...(title || unitNumber ? { title: title || unitNumber, unit_number: unitNumber || title } : {}),
        ...(unitType ? { unit_type: unitType } : {}),
        ...(monthlyRent !== undefined ? { monthly_rent: Number(monthlyRent) } : {}),
        ...(depositAmount !== undefined ? { deposit_amount: Number(depositAmount) } : {}),
        ...(status ? { occupancy_status: mapUnitStatusToDb(status) } : {}),
        ...(notes !== undefined ? { notes } : {}),
        ...(floor !== undefined ? { floor } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, unit: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete property in live Supabase (with active lease protection)
app.delete('/api/data/properties/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { id } = req.params;
    const { data: prop } = await supabaseAdmin
      .from('properties')
      .select('landlord_id, owner_id')
      .eq('id', id)
      .single();

    if (!prop || (prop.landlord_id !== user.id && prop.owner_id !== user.id)) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this property.' });
    }

    const { data: activeTenants } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('property_id', id)
      .limit(1);

    if (activeTenants && activeTenants.length > 0) {
      return res.status(400).json({ error: 'Cannot delete property with active leases. Terminate leases first.' });
    }

    const { error } = await supabaseAdmin.from('properties').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, message: 'Property deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete unit in live Supabase (with active lease protection)
app.delete('/api/data/units/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { id } = req.params;
    const { data: unit } = await supabaseAdmin
      .from('units')
      .select('property_id')
      .eq('id', id)
      .single();

    if (!unit) return res.status(404).json({ error: 'Unit not found.' });

    const { data: prop } = await supabaseAdmin
      .from('properties')
      .select('landlord_id, owner_id')
      .eq('id', unit.property_id)
      .single();

    if (!prop || (prop.landlord_id !== user.id && prop.owner_id !== user.id)) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this property.' });
    }

    const { data: unitTenants } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('unit_id', id)
      .limit(1);

    if (unitTenants && unitTenants.length > 0) {
      return res.status(400).json({ error: 'Cannot delete unit with active lease. Vacate or terminate lease first.' });
    }

    const { error } = await supabaseAdmin.from('units').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, message: 'Unit deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create tenant / lease in live Supabase
app.post('/api/data/tenants', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const {
      propertyId,
      unitId,
      fullName,
      phone,
      email,
      startDate,
      endDate,
      rentAmount,
      dueDay,
      emergencyContact,
    } = req.body;

    if (!propertyId || !unitId || !fullName || !phone) {
      return res.status(400).json({ error: 'Missing required tenant fields: propertyId, unitId, fullName, phone' });
    }

    // Verify caller owns propertyId
    const { data: prop } = await supabaseAdmin
      .from('properties')
      .select('id, landlord_id, owner_id')
      .eq('id', propertyId)
      .single();

    if (!prop || (prop.landlord_id !== user.id && prop.owner_id !== user.id)) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this property.' });
    }

    // Verify unit belongs to propertyId
    const { data: unitRecord } = await supabaseAdmin
      .from('units')
      .select('property_id')
      .eq('id', unitId)
      .single();

    if (!unitRecord || unitRecord.property_id !== propertyId) {
      return res.status(400).json({ error: 'Relational mismatch: Unit does not belong to specified property.' });
    }

    const randomSuffix = Math.floor(100000 + Math.random() * 900000);
    const tenantCode = `MVR-${randomSuffix}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .insert({
        property_id: propertyId,
        unit_id: unitId,
        user_id: null,
        tenant_code: tenantCode,
        full_name: fullName,
        phone,
        email: email || null,
        start_date: startDate || new Date().toISOString().split('T')[0],
        end_date: endDate || null,
        rent_amount: Number(rentAmount || 0),
        due_day: Number(dueDay || 1),
        current_balance: Number(rentAmount || 0),
        advance_credit: 0,
        status: 'active',
        emergency_contact: emergencyContact || null,
      })
      .select()
      .single();

    if (tenantErr) {
      console.error('Create tenant error:', tenantErr);
      return res.status(400).json({ error: tenantErr.message });
    }

    // Mark unit occupancy as occupied
    await supabaseAdmin
      .from('units')
      .update({ occupancy_status: 'occupied', status: 'paused' })
      .eq('id', unitId);

    // Create current billing period rent record
    const currentPeriod = new Date().toISOString().substring(0, 7);
    const dueDate = new Date();
    dueDate.setDate(Number(dueDay || 1));

    await supabaseAdmin.from('rent_records').insert({
      tenant_id: tenant.id,
      property_id: propertyId,
      unit_id: unitId,
      billing_period: currentPeriod,
      amount_due: Number(rentAmount || 0),
      amount_paid: 0,
      balance: Number(rentAmount || 0),
      due_date: dueDate.toISOString().split('T')[0],
      status: 'pending',
    });

    res.json({ success: true, tenant });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create tenant' });
  }
});

// Update tenant in live Supabase
app.put('/api/data/tenants/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { id } = req.params;
    const { data: existingTenant } = await supabaseAdmin
      .from('tenants')
      .select('property_id')
      .eq('id', id)
      .single();

    if (!existingTenant) return res.status(404).json({ error: 'Tenant not found.' });

    const { data: prop } = await supabaseAdmin
      .from('properties')
      .select('landlord_id, owner_id')
      .eq('id', existingTenant.property_id)
      .single();

    if (!prop || (prop.landlord_id !== user.id && prop.owner_id !== user.id)) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this property.' });
    }

    const { fullName, phone, email, rentAmount, dueDay, status, emergencyContact } = req.body;

    const { data, error } = await supabaseAdmin
      .from('tenants')
      .update({
        ...(fullName ? { full_name: fullName } : {}),
        ...(phone ? { phone } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(rentAmount !== undefined ? { rent_amount: Number(rentAmount) } : {}),
        ...(dueDay !== undefined ? { due_day: Number(dueDay) } : {}),
        ...(status ? { status } : {}),
        ...(emergencyContact !== undefined ? { emergency_contact: emergencyContact } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json({ success: true, tenant: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Terminate tenant
app.post('/api/data/tenants/:id/terminate', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { id } = req.params;

    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('unit_id, property_id')
      .eq('id', id)
      .single();

    if (fetchErr || !tenant) return res.status(404).json({ error: 'Tenant not found' });

    const { data: prop } = await supabaseAdmin
      .from('properties')
      .select('landlord_id, owner_id')
      .eq('id', tenant.property_id)
      .single();

    if (!prop || (prop.landlord_id !== user.id && prop.owner_id !== user.id)) {
      return res.status(403).json({ error: 'Unauthorized: You do not own this property.' });
    }

    await supabaseAdmin
      .from('tenants')
      .update({ status: 'terminated', updated_at: new Date().toISOString() })
      .eq('id', id);

    // Release unit: mark occupancy as available without auto-publishing marketplace listing
    await supabaseAdmin
      .from('units')
      .update({ occupancy_status: 'available', status: 'paused' })
      .eq('id', tenant.unit_id);

    res.json({ success: true, message: 'Lease terminated and unit released.' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Precise financial rounding helper to prevent IEEE 754 floating-point drift
function roundMoney(val: number): number {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;
}

// In-memory rate limiting and OTP store for tenant account linking
interface TenantOtpRecord {
  tenantId: string;
  phoneHash: string;
  otpHash: string;
  attempts: number;
  expiresAt: number;
  resendAvailableAt: number;
}
const tenantOtpStore = new Map<string, TenantOtpRecord>();
const otpRateLimitStore = new Map<string, { count: number; windowStart: number }>();

// Helper to dispatch SMS via real SMS provider gateways (Africa's Talking or Twilio)
async function dispatchSms(to: string, message: string): Promise<{ success: boolean; error?: string }> {
  const provider = (process.env.SMS_PROVIDER || '').toLowerCase().trim();
  const apiKey = (process.env.SMS_API_KEY || '').trim();
  const senderId = process.env.SMS_SENDER_ID || 'MavRent';

  if (!provider || !apiKey) {
    return { success: false, error: 'SMS provider or API key is not configured.' };
  }

  try {
    if (provider === 'africastalking') {
      const username = process.env.AFRICASTALKING_USERNAME || 'sandbox';
      const endpoint = username === 'sandbox' 
        ? 'https://api.sandbox.africastalking.com/version1/messaging'
        : 'https://api.africastalking.com/version1/messaging';

      const body = new URLSearchParams({
        username,
        to,
        message,
        from: senderId,
      });

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apiKey': apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      });

      if (!resp.ok) {
        return { success: false, error: `Africa's Talking gateway error (${resp.status})` };
      }
      const data = await resp.json();
      const recipients = data?.SMSMessageData?.Recipients;
      if (Array.isArray(recipients) && recipients.length > 0 && (recipients[0].status === 'Success' || recipients[0].statusCode === 101)) {
        return { success: true };
      }
      return { success: false, error: recipients?.[0]?.status || 'SMS delivery rejected by gateway.' };
    } else if (provider === 'twilio') {
      const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
      const fromNumber = process.env.TWILIO_FROM_NUMBER || '';
      if (!accountSid || !fromNumber) {
        return { success: false, error: 'TWILIO_ACCOUNT_SID or TWILIO_FROM_NUMBER is missing.' };
      }
      const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const body = new URLSearchParams({
        To: to,
        From: fromNumber,
        Body: message,
      });
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${apiKey}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });
      if (!resp.ok) {
        return { success: false, error: `Twilio gateway error (${resp.status})` };
      }
      return { success: true };
    }

    return { success: false, error: `Unsupported SMS provider: ${provider}. Supported: africastalking, twilio.` };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network exception while connecting to SMS gateway.' };
  }
}

// =========================================================================
// TENANT ACCOUNT LINKING & OTP VERIFICATION ENDPOINTS
// =========================================================================

app.post('/api/auth/tenant-link/request-otp', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Database service not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required to link tenant account.' });

    const { tenantCode, phone } = req.body;
    if (!tenantCode || !phone) {
      return res.status(400).json({ error: 'Tenant code and phone number are required.' });
    }

    // Server-side rate limiting (max 3 requests per 15 minutes per user)
    const now = Date.now();
    const rateLimit = otpRateLimitStore.get(user.id);
    if (rateLimit) {
      if (now - rateLimit.windowStart < 15 * 60 * 1000) {
        if (rateLimit.count >= 3) {
          return res.status(429).json({ error: 'Too many verification attempts. Please try again after 15 minutes.' });
        }
        rateLimit.count += 1;
      } else {
        otpRateLimitStore.set(user.id, { count: 1, windowStart: now });
      }
    } else {
      otpRateLimitStore.set(user.id, { count: 1, windowStart: now });
    }

    // Normalize phone
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '').trim();
    const cleanCode = tenantCode.trim().toUpperCase();

    // Query tenant record
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, user_id, phone, tenant_code, full_name, property_id')
      .eq('tenant_code', cleanCode)
      .maybeSingle();

    const normalizedTenantPhone = tenant?.phone ? tenant.phone.replace(/[\s\-\(\)]/g, '').trim() : '';

    // Anti-enumeration protection: Return identical response if lease does not exist,
    // phone does not match, or lease is already claimed by another user account
    const isAlreadyClaimedByOther = tenant && tenant.user_id && tenant.user_id !== user.id;
    const isPhoneMatch = tenant && (normalizedTenantPhone === cleanPhone || normalizedTenantPhone.endsWith(cleanPhone) || cleanPhone.endsWith(normalizedTenantPhone));

    if (!tenant || !isPhoneMatch || isAlreadyClaimedByOther) {
      return res.json({
        success: true,
        status: 'pending_verification',
        message: 'If the provided lease details match an active unlinked lease, a verification code has been dispatched.',
      });
    }

    // Check if SMS provider is properly configured
    const smsProvider = process.env.SMS_PROVIDER;
    const smsApiKey = process.env.SMS_API_KEY;
    if (!smsProvider || !smsApiKey) {
      return res.json({
        success: false,
        status: 'sms_provider_unconfigured',
        message: 'SMS verification gateway is not configured on this server. Please contact your property manager to manually link your account.',
      });
    }

    // Cooldown check
    const existing = tenantOtpStore.get(user.id);
    if (existing && now < existing.resendAvailableAt) {
      const waitSec = Math.ceil((existing.resendAvailableAt - now) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSec} seconds before requesting a new code.` });
    }

    // Cryptographically secure 6-digit OTP generator
    const otp = crypto.randomInt(100000, 1000000).toString();
    const secretSalt = process.env.APP_SECRET || 'mavrent-secure-otp-salt';
    const otpHash = crypto.createHash('sha256').update(otp + secretSalt).digest('hex');
    const phoneHash = crypto.createHash('sha256').update(cleanPhone).digest('hex');

    // Dispatch SMS to tenant's registered phone in database (NOT arbitrary user input)
    const smsMessage = `Your MavRent verification code is ${otp}. Valid for 10 minutes. Do not share this code.`;
    const dispatchResult = await dispatchSms(tenant.phone, smsMessage);

    if (!dispatchResult.success) {
      return res.status(502).json({
        success: false,
        status: 'sms_delivery_failed',
        error: dispatchResult.error || 'Failed to dispatch verification SMS via configured gateway.',
      });
    }

    // 1. In-memory store for local worker/single-instance caching
    tenantOtpStore.set(user.id, {
      tenantId: tenant.id,
      phoneHash,
      otpHash,
      attempts: 0,
      expiresAt: now + 10 * 60 * 1000, // 10 minutes expiry
      resendAvailableAt: now + 60 * 1000, // 60 seconds cooldown
    });

    // 2. Shared database persistence in tenant_link_requests for multi-instance / serverless deployment scalability
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from('tenant_link_requests').insert({
          user_id: user.id,
          tenant_id: tenant.id,
          phone_hash: phoneHash,
          otp_hash: otpHash,
          attempts: 0,
          max_attempts: 3,
          expires_at: new Date(now + 10 * 60 * 1000).toISOString(),
          resend_available_at: new Date(now + 60 * 1000).toISOString(),
        });
      } catch {
        // Handled gracefully: table may not yet be active prior to migration execution
      }
    }

    res.json({
      success: true,
      status: 'otp_dispatched',
      message: 'A 6-digit verification code has been dispatched to your registered mobile number.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to process verification request.' });
  }
});

app.post('/api/auth/tenant-link/verify-otp', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Database service not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { otp } = req.body;
    if (!otp || typeof otp !== 'string') {
      return res.status(400).json({ error: 'Verification code is required.' });
    }

    let record = tenantOtpStore.get(user.id);
    let dbRequestId: string | null = null;

    // Multi-instance / serverless shared-storage lookup
    if (!record && supabaseAdmin) {
      try {
        const { data: dbReq } = await supabaseAdmin
          .from('tenant_link_requests')
          .select('*')
          .eq('user_id', user.id)
          .is('verified_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (dbReq) {
          dbRequestId = dbReq.id;
          record = {
            tenantId: dbReq.tenant_id,
            phoneHash: dbReq.phone_hash,
            otpHash: dbReq.otp_hash,
            attempts: dbReq.attempts || 0,
            expiresAt: new Date(dbReq.expires_at).getTime(),
            resendAvailableAt: new Date(dbReq.resend_available_at).getTime(),
          };
        }
      } catch {
        // Handled gracefully if table is not yet migrated
      }
    }

    if (!record) {
      return res.status(400).json({ error: 'No active verification request found. Please request a new code.' });
    }

    const now = Date.now();
    if (now > record.expiresAt) {
      tenantOtpStore.delete(user.id);
      if (dbRequestId && supabaseAdmin) {
        await supabaseAdmin.from('tenant_link_requests').delete().eq('id', dbRequestId);
      }
      return res.status(400).json({ error: 'Verification code has expired. Please request a new code.' });
    }

    record.attempts += 1;
    if (record.attempts > 3) {
      tenantOtpStore.delete(user.id);
      if (dbRequestId && supabaseAdmin) {
        await supabaseAdmin.from('tenant_link_requests').delete().eq('id', dbRequestId);
      }
      return res.status(429).json({ error: 'Maximum attempts exceeded. Please request a new code.' });
    }

    const secretSalt = process.env.APP_SECRET || 'mavrent-secure-otp-salt';
    const inputHash = crypto.createHash('sha256').update(otp.trim() + secretSalt).digest('hex');

    // Constant-time hash comparison
    const isMatch = crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(record.otpHash));
    if (!isMatch) {
      if (dbRequestId && supabaseAdmin) {
        await supabaseAdmin.from('tenant_link_requests').update({ attempts: record.attempts }).eq('id', dbRequestId);
      }
      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Single-use atomic consumption: delete OTP immediately upon verified match
    tenantOtpStore.delete(user.id);
    if (dbRequestId && supabaseAdmin) {
      await supabaseAdmin.from('tenant_link_requests').update({ verified_at: new Date().toISOString() }).eq('id', dbRequestId);
    }

    // Verify tenant still exists and is not claimed by another user
    const { data: tenant, error: fetchErr } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('id', record.tenantId)
      .single();

    if (fetchErr || !tenant) {
      return res.status(404).json({ error: 'Lease record not found.' });
    }

    if (tenant.user_id && tenant.user_id !== user.id) {
      return res.status(409).json({ error: 'This lease has already been claimed by another account.' });
    }

    // Atomically link tenant to authenticated user (concurrency guard against simultaneous claims)
    const { data: linkedTenant, error: linkErr } = await supabaseAdmin
      .from('tenants')
      .update({ user_id: user.id, updated_at: new Date().toISOString() })
      .eq('id', tenant.id)
      .or(`user_id.is.null,user_id.eq.${user.id}`)
      .select()
      .single();

    if (linkErr || !linkedTenant) {
      return res.status(409).json({ error: 'This lease has just been claimed by another account.' });
    }

    // Update profile tenant_code without overwriting privileged roles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const newRole = profile?.role === 'landlord' || profile?.role === 'admin' ? profile.role : 'tenant';
    await supabaseAdmin
      .from('profiles')
      .update({
        role: newRole,
        tenant_code: tenant.tenant_code,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    // Audit log
    await supabaseAdmin.from('ai_audit_logs').insert({
      user_id: user.id,
      action_type: 'TENANT_ACCOUNT_LINKED',
      risk_level: 'low_risk_write',
      prompt: `Verified phone ownership for tenant ${tenant.tenant_code}`,
      executed: true,
      confirmed_by: user.id,
    });

    tenantOtpStore.delete(user.id);

    res.json({
      success: true,
      message: 'Lease successfully linked to your account.',
      tenant,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Verification failed.' });
  }
});

// =========================================================================
// HARDENED PAYMENT PROCESSING (Strict Role Isolation & Atomic Settlement)
// =========================================================================

// Record Payment or Submit Payment Claim
app.post('/api/data/payments', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Database service not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { tenantId, amount, paymentMethod, referenceNumber, notes, paymentDate, idempotencyKey: clientIdempotency } = req.body;

    if (!tenantId || !amount || Number(amount) <= 0) {
      return res.status(400).json({ error: 'Tenant ID and valid positive amount are required.' });
    }

    // Fetch tenant, property, and unit
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('*, properties(*), units(*)')
      .eq('id', tenantId)
      .single();

    if (tErr || !tenant) {
      return res.status(404).json({ error: 'Tenant record not found.' });
    }

    const propertyObj = tenant.properties || {};
    const isLandlord = propertyObj.landlord_id === user.id || propertyObj.owner_id === user.id;
    const isAssignedTenant = tenant.user_id === user.id;

    if (!isLandlord && !isAssignedTenant) {
      return res.status(403).json({ error: 'Unauthorized: You do not have permission to record payments for this property.' });
    }

    const payDate = paymentDate || new Date().toISOString().split('T')[0];
    const refNum = referenceNumber || `REF-${Date.now()}`;
    const idempotencyKey = clientIdempotency || `PAY-${tenant.id}-${amount}-${payDate}-${refNum}`;

    // Payload hash to detect idempotency key reuse with mismatched arguments
    const payloadHash = crypto
      .createHash('sha256')
      .update(`${tenant.id}:${Number(amount)}:${paymentMethod || 'cash'}:${refNum}:${tenant.property_id}`)
      .digest('hex');

    // -----------------------------------------------------------------------
    // PATH A: TENANT SUBMITS PAYMENT CLAIM (Pending Landlord Verification)
    // -----------------------------------------------------------------------
    if (!isLandlord && isAssignedTenant) {
      // Check existing pending claim
      const { data: existingClaim } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingClaim) {
        if (existingClaim.payload_hash && existingClaim.payload_hash !== payloadHash) {
          return res.status(409).json({ error: 'Idempotency conflict: key already used with different payment details.' });
        }
        return res.json({
          success: true,
          status: 'pending_verification',
          payment: existingClaim,
          message: 'Payment claim previously submitted and is awaiting landlord verification.',
        });
      }

      // Insert unconfirmed payment claim: NEVER alters balance or creates official receipt
      const { data: paymentClaim, error: claimErr } = await supabaseAdmin
        .from('payments')
        .insert({
          tenant_id: tenant.id,
          property_id: tenant.property_id,
          unit_id: tenant.unit_id,
          amount: Number(amount),
          payment_date: payDate,
          payment_method: paymentMethod || 'mobile_money',
          reference_number: refNum,
          idempotency_key: idempotencyKey,
          payload_hash: payloadHash,
          notes: notes || 'Tenant-submitted payment claim',
          status: 'pending_verification',
          created_by: user.id,
        })
        .select()
        .single();

      if (claimErr) {
        return res.status(400).json({ error: claimErr.message });
      }

      // Notify landlord to verify payment claim
      const landlordUserId = propertyObj.landlord_id || propertyObj.owner_id;
      if (landlordUserId) {
        await supabaseAdmin.from('notifications').insert({
          user_id: landlordUserId,
          title: 'New Tenant Payment Claim',
          message: `Tenant ${tenant.full_name} submitted a payment claim of ${propertyObj.currency || 'UGX'} ${Number(amount).toLocaleString()} (${paymentMethod || 'mobile_money'}). Ref: ${refNum}. Please review and confirm.`,
          channel: 'in_app',
          read: false,
          notification_type: 'payment_claim',
        });
      }

      return res.json({
        success: true,
        status: 'pending_verification',
        message: 'Payment claim submitted successfully. The transaction is pending landlord verification before official receipt generation.',
        payment: paymentClaim,
      });
    }

    // -----------------------------------------------------------------------
    // PATH B: LANDLORD RECORDS CONFIRMED PAYMENT (Atomic Settlement)
    // -----------------------------------------------------------------------
    // Check existing confirmed payment with idempotency key
    const { data: existingPay } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingPay) {
      if (existingPay.payload_hash && existingPay.payload_hash !== payloadHash) {
        return res.status(409).json({ error: 'Idempotency conflict: key already used with different payment details.' });
      }
      const { data: existingReceipt } = await supabaseAdmin
        .from('receipts')
        .select('*')
        .eq('payment_id', existingPay.id)
        .maybeSingle();

      return res.json({
        success: true,
        idempotent: true,
        payment: existingPay,
        receipt: existingReceipt,
      });
    }

    const receiptNum = `RCP-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    // 1. Insert confirmed payment
    const { data: payment, error: payErr } = await supabaseAdmin
      .from('payments')
      .insert({
        tenant_id: tenant.id,
        property_id: tenant.property_id,
        unit_id: tenant.unit_id,
        amount: Number(amount),
        payment_date: payDate,
        payment_method: paymentMethod || 'cash',
        reference_number: refNum,
        idempotency_key: idempotencyKey,
        payload_hash: payloadHash,
        receipt_number: receiptNum,
        notes: notes || 'Rent payment recorded',
        status: 'confirmed',
        created_by: user.id,
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (payErr) {
      return res.status(400).json({ error: payErr.message });
    }

    // 2. Cascading allocation across outstanding rent records (oldest due_date first)
    let remainingPayment = roundMoney(Number(amount));
    const allocations = [];

    const { data: rentRecords } = await supabaseAdmin
      .from('rent_records')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('status', ['pending', 'partial', 'overdue'])
      .order('due_date', { ascending: true });

    if (rentRecords && rentRecords.length > 0) {
      for (const rr of rentRecords) {
        if (remainingPayment <= 0) break;
        const dueRemaining = roundMoney(Number(rr.balance || (Number(rr.amount_due) - Number(rr.amount_paid))));
        const alloc = roundMoney(Math.min(remainingPayment, dueRemaining));
        const updatedPaid = roundMoney(Number(rr.amount_paid || 0) + alloc);
        const updatedBal = roundMoney(Number(rr.amount_due) - updatedPaid);
        const newStatus = updatedBal <= 0 ? 'paid' : 'partial';

        await supabaseAdmin
          .from('rent_records')
          .update({
            amount_paid: updatedPaid,
            balance: Math.max(0, updatedBal),
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rr.id);

        allocations.push({
          rentRecordId: rr.id,
          billingPeriod: rr.billing_period,
          allocated: alloc,
          priorBalance: dueRemaining,
          newBalance: Math.max(0, updatedBal),
        });

        remainingPayment = roundMoney(remainingPayment - alloc);
      }
    }

    if (remainingPayment > 0) {
      allocations.push({ advanceCredit: remainingPayment });
    }

    // 3. Update tenant authoritative balance and advance credit
    const { data: remainingRecords } = await supabaseAdmin
      .from('rent_records')
      .select('balance')
      .eq('tenant_id', tenant.id);

    const authoritativeBalance = roundMoney((remainingRecords || []).reduce((sum, r) => sum + Number(r.balance || 0), 0));
    const currentAdvance = roundMoney(Number(tenant.advance_credit || 0));
    const newAdvance = remainingPayment > 0 ? roundMoney(currentAdvance + remainingPayment) : currentAdvance;

    await supabaseAdmin
      .from('tenants')
      .update({
        current_balance: authoritativeBalance,
        advance_credit: newAdvance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id);

    // 4. Issue official receipt snapshot
    const unitObj = tenant.units || {};
    const snapshot = {
      tenantName: tenant.full_name,
      tenantCode: tenant.tenant_code,
      propertyName: propertyObj.name || 'MavRent Property',
      unitNumber: unitObj.title || unitObj.unit_number || 'Unit',
      landlordName: user.user_metadata?.full_name || 'Property Manager',
      currency: propertyObj.currency || 'UGX',
      referenceNumber: refNum,
      allocations,
      advanceCredit: remainingPayment,
      balanceAfter: authoritativeBalance,
      confirmedBy: user.id,
      issueDate: new Date().toISOString(),
    };

    const { data: receipt, error: rcpErr } = await supabaseAdmin
      .from('receipts')
      .insert({
        payment_id: payment.id,
        receipt_number: receiptNum,
        tenant_id: tenant.id,
        property_id: tenant.property_id,
        unit_id: tenant.unit_id,
        amount: Number(amount),
        payment_method: paymentMethod || 'cash',
        balance_after: authoritativeBalance,
        data_snapshot: snapshot,
      })
      .select()
      .single();

    if (rcpErr) {
      console.error('Receipt generation warning:', rcpErr);
    }

    // 5. Notify tenant with confirmed receipt
    if (tenant.user_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: tenant.user_id,
        title: 'Payment Confirmed',
        message: `Your payment of ${propertyObj.currency || 'UGX'} ${Number(amount).toLocaleString()} has been confirmed. Receipt: ${receiptNum}.`,
        channel: 'in_app',
        read: false,
        notification_type: 'payment_received',
      });
    }

    res.json({ success: true, payment, receipt, allocations });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Payment processing failed.' });
  }
});

// Landlord Confirms Tenant Payment Claim
app.post('/api/data/payments/:id/confirm', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Database service not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { id } = req.params;

    // Fetch payment claim
    const { data: payment, error: pErr } = await supabaseAdmin
      .from('payments')
      .select('*, properties(*), tenants(*, units(*))')
      .eq('id', id)
      .single();

    if (pErr || !payment) {
      return res.status(404).json({ error: 'Payment record not found.' });
    }

    // Verify landlord owns property FIRST before returning ANY information
    const propertyObj = payment.properties || {};
    const isOwner = propertyObj.landlord_id === user.id || propertyObj.owner_id === user.id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Unauthorized: Only the property owner can confirm this payment claim.' });
    }

    if (payment.status === 'confirmed') {
      const { data: existingReceipt } = await supabaseAdmin
        .from('receipts')
        .select('*')
        .eq('payment_id', payment.id)
        .maybeSingle();
      return res.json({ success: true, message: 'Payment already confirmed.', payment, receipt: existingReceipt });
    }

    if (payment.status !== 'pending_verification') {
      return res.status(400).json({ error: `Cannot confirm payment in status ${payment.status}.` });
    }

    const tenant = payment.tenants;
    if (!tenant) return res.status(404).json({ error: 'Associated tenant not found.' });

    const receiptNum = `RCP-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;

    // 1. Cascading allocation across rent records
    let remainingPayment = roundMoney(Number(payment.amount));
    const allocations = [];

    const { data: rentRecords } = await supabaseAdmin
      .from('rent_records')
      .select('*')
      .eq('tenant_id', tenant.id)
      .in('status', ['pending', 'partial', 'overdue'])
      .order('due_date', { ascending: true });

    if (rentRecords && rentRecords.length > 0) {
      for (const rr of rentRecords) {
        if (remainingPayment <= 0) break;
        const dueRemaining = roundMoney(Number(rr.balance || (Number(rr.amount_due) - Number(rr.amount_paid))));
        const alloc = roundMoney(Math.min(remainingPayment, dueRemaining));
        const updatedPaid = roundMoney(Number(rr.amount_paid || 0) + alloc);
        const updatedBal = roundMoney(Number(rr.amount_due) - updatedPaid);
        const newStatus = updatedBal <= 0 ? 'paid' : 'partial';

        await supabaseAdmin
          .from('rent_records')
          .update({
            amount_paid: updatedPaid,
            balance: Math.max(0, updatedBal),
            status: newStatus,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rr.id);

        allocations.push({
          rentRecordId: rr.id,
          billingPeriod: rr.billing_period,
          allocated: alloc,
          priorBalance: dueRemaining,
          newBalance: Math.max(0, updatedBal),
        });

        remainingPayment = roundMoney(remainingPayment - alloc);
      }
    }

    if (remainingPayment > 0) {
      allocations.push({ advanceCredit: remainingPayment });
    }

    // 2. Update tenant authoritative balance and persist advance credit
    const { data: remainingRecords } = await supabaseAdmin
      .from('rent_records')
      .select('balance')
      .eq('tenant_id', tenant.id);

    const authoritativeBalance = roundMoney((remainingRecords || []).reduce((sum, r) => sum + Number(r.balance || 0), 0));
    const currentAdvance = roundMoney(Number(tenant.advance_credit || 0));
    const newAdvance = remainingPayment > 0 ? roundMoney(currentAdvance + remainingPayment) : currentAdvance;

    await supabaseAdmin
      .from('tenants')
      .update({
        current_balance: authoritativeBalance,
        advance_credit: newAdvance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id);

    // 3. Mark payment confirmed
    const { data: updatedPayment, error: uPayErr } = await supabaseAdmin
      .from('payments')
      .update({
        status: 'confirmed',
        receipt_number: receiptNum,
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq('id', payment.id)
      .select()
      .single();

    if (uPayErr) return res.status(400).json({ error: uPayErr.message });

    // 4. Issue official receipt
    const unitObj = tenant.units || {};
    const snapshot = {
      tenantName: tenant.full_name,
      tenantCode: tenant.tenant_code,
      propertyName: propertyObj.name || 'MavRent Property',
      unitNumber: unitObj.title || unitObj.unit_number || 'Unit',
      landlordName: user.user_metadata?.full_name || 'Property Manager',
      currency: propertyObj.currency || 'UGX',
      referenceNumber: payment.reference_number,
      allocations,
      advanceCredit: remainingPayment,
      balanceAfter: authoritativeBalance,
      confirmedBy: user.id,
      issueDate: new Date().toISOString(),
    };

    const { data: receipt } = await supabaseAdmin
      .from('receipts')
      .insert({
        payment_id: payment.id,
        receipt_number: receiptNum,
        tenant_id: tenant.id,
        property_id: tenant.property_id,
        unit_id: tenant.unit_id,
        amount: Number(payment.amount),
        payment_method: payment.payment_method,
        balance_after: authoritativeBalance,
        data_snapshot: snapshot,
      })
      .select()
      .single();

    // 5. Notify tenant
    if (tenant.user_id) {
      await supabaseAdmin.from('notifications').insert({
        user_id: tenant.user_id,
        title: 'Payment Claim Confirmed',
        message: `Your payment claim of ${propertyObj.currency || 'UGX'} ${Number(payment.amount).toLocaleString()} has been confirmed. Receipt: ${receiptNum}.`,
        channel: 'in_app',
        read: false,
        notification_type: 'payment_received',
      });
    }

    res.json({ success: true, payment: updatedPayment, receipt, allocations });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Payment confirmation failed.' });
  }
});

// Landlord Applies Advance Credit to Rent Records
app.post('/api/data/tenants/:id/apply-advance-credit', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Database service not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });

    const { id } = req.params;
    const { rentRecordId } = req.body;

    // Fetch tenant and property
    const { data: tenant, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('*, properties(*)')
      .eq('id', id)
      .single();

    if (tErr || !tenant) {
      return res.status(404).json({ error: 'Tenant record not found.' });
    }

    const prop = tenant.properties || {};
    const isOwner = prop.landlord_id === user.id || prop.owner_id === user.id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Unauthorized: Only the property owner can apply advance credits.' });
    }

    const advanceCredit = Number(tenant.advance_credit || 0);
    if (advanceCredit <= 0) {
      return res.status(400).json({ error: 'Tenant has no available advance credit to apply.' });
    }

    // Query outstanding rent records for this tenant
    let query = supabaseAdmin
      .from('rent_records')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('property_id', tenant.property_id)
      .in('status', ['pending', 'partial', 'overdue'])
      .order('due_date', { ascending: true });

    if (rentRecordId) {
      query = query.eq('id', rentRecordId);
    }

    const { data: records, error: rErr } = await query;
    if (rErr || !records || records.length === 0) {
      return res.status(400).json({ error: 'No outstanding rent records found to apply credit against.' });
    }

    let remainingCredit = roundMoney(advanceCredit);
    const allocations = [];

    for (const record of records) {
      if (remainingCredit <= 0) break;
      const curBal = roundMoney(Number(record.balance || (Number(record.amount_due) - Number(record.amount_paid))));
      if (curBal <= 0) continue;

      const alloc = roundMoney(Math.min(remainingCredit, curBal));
      const updatedPaid = roundMoney(Number(record.amount_paid || 0) + alloc);
      const updatedBal = roundMoney(Number(record.amount_due) - updatedPaid);
      const newStatus = updatedBal <= 0 ? 'paid' : 'partial';

      await supabaseAdmin
        .from('rent_records')
        .update({
          amount_paid: updatedPaid,
          balance: Math.max(0, updatedBal),
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('id', record.id);

      allocations.push({
        rentRecordId: record.id,
        billingPeriod: record.billing_period,
        applied: alloc,
        priorBalance: curBal,
        newBalance: Math.max(0, updatedBal),
      });

      remainingCredit = roundMoney(remainingCredit - alloc);
    }

    const totalApplied = roundMoney(advanceCredit - remainingCredit);
    const { data: remainingRecords } = await supabaseAdmin
      .from('rent_records')
      .select('balance')
      .eq('tenant_id', tenant.id);

    const authoritativeBalance = roundMoney((remainingRecords || []).reduce((sum, r) => sum + Number(r.balance || 0), 0));

    const { data: updatedTenant } = await supabaseAdmin
      .from('tenants')
      .update({
        advance_credit: remainingCredit,
        current_balance: authoritativeBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id)
      .select()
      .single();

    res.json({
      success: true,
      totalApplied,
      remainingAdvanceCredit: remainingCredit,
      currentBalance: authoritativeBalance,
      allocations,
      tenant: updatedTenant,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to apply advance credit.' });
  }
});

// Mobile Money Provider Webhook (MTN MoMo / Airtel Money)
app.post('/api/payments/webhook/mobile-money', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Database service not configured.' });

    const webhookSecret = process.env.MOMO_WEBHOOK_SECRET;
    const signature = req.headers['x-momo-signature'] as string;

    if (webhookSecret && signature) {
      const calculatedSig = crypto
        .createHmac('sha256', webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');
      if (calculatedSig !== signature) {
        return res.status(401).json({ error: 'Invalid webhook signature.' });
      }
    } else if (webhookSecret && !signature) {
      return res.status(401).json({ error: 'Missing webhook signature.' });
    }

    const { transactionId, status, tenantCode, amount, reference } = req.body;
    if (!transactionId || !status || !tenantCode) {
      return res.status(400).json({ error: 'Missing required webhook parameters: transactionId, status, tenantCode.' });
    }

    // Lookup tenant by tenantCode
    const { data: tenant } = await supabaseAdmin
      .from('tenants')
      .select('id, property_id, unit_id')
      .eq('tenant_code', tenantCode)
      .maybeSingle();

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant code not recognized.' });
    }

    // Always record provider callback in payments table
    const idempotencyKey = `MOMO-${transactionId}`;
    const { data: existingPay } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existingPay) {
      return res.json({ success: true, message: 'Transaction already processed.', paymentId: existingPay.id });
    }

    const paymentStatus = (status.toLowerCase() === 'successful' || status.toLowerCase() === 'completed')
      ? 'pending_verification' // Retain safe landlord verification step unless fully automated trusted gateway
      : 'rejected';

    const webhookPayloadHash = crypto
      .createHash('sha256')
      .update(`${tenant.id}:${Number(amount || 0)}:mobile_money:${reference || transactionId}:${tenant.property_id}`)
      .digest('hex');

    const { data: paymentRecord } = await supabaseAdmin
      .from('payments')
      .insert({
        tenant_id: tenant.id,
        property_id: tenant.property_id,
        unit_id: tenant.unit_id,
        amount: Number(amount || 0),
        payment_method: 'mobile_money',
        reference_number: reference || transactionId,
        idempotency_key: idempotencyKey,
        payload_hash: webhookPayloadHash,
        status: paymentStatus,
        notes: `Mobile money automated webhook receipt (${status})`,
      })
      .select()
      .single();

    res.json({
      success: true,
      message: 'Mobile money transaction logged successfully.',
      payment: paymentRecord,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Webhook processing failed.' });
  }
});

// Create Maintenance Request in live Supabase with tenant/property authorization.
app.post('/api/data/maintenance', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in to submit a maintenance report.' });

    const { propertyId, unitId, tenantId, title, description, category, priority, mediaUrls } = req.body;
    if (!propertyId || !unitId || !tenantId || !title || !description) {
      return res.status(400).json({ error: 'Property, unit, tenant, title, and description are required.' });
    }
    if (!Array.isArray(mediaUrls || [])) return res.status(400).json({ error: 'Attachments must be a list of uploaded media paths.' });
    if ((mediaUrls || []).length > 5) return res.status(400).json({ error: 'A report can include at most 5 attachments.' });
    if ((mediaUrls || []).some((item: unknown) => typeof item !== 'string' || !item.startsWith(`${propertyId}/${user.id}/`))) {
      return res.status(400).json({ error: 'One or more attachments do not belong to your account and property.' });
    }

    const [{ data: tenant, error: tenantError }, { data: property, error: propertyError }] = await Promise.all([
      supabaseAdmin.from('tenants').select('id,property_id,unit_id,user_id,status').eq('id', tenantId).maybeSingle(),
      supabaseAdmin.from('properties').select('id,owner_id,landlord_id').eq('id', propertyId).maybeSingle(),
    ]);
    if (tenantError || propertyError) return res.status(503).json({ error: 'The management database is not ready. Please contact the platform administrator.' });
    if (!tenant || !property || tenant.property_id !== propertyId || tenant.unit_id !== unitId) {
      return res.status(400).json({ error: 'The selected tenant, unit, and property do not match.' });
    }

    const isOwner = property.owner_id === user.id || property.landlord_id === user.id;
    const isLinkedTenant = tenant.user_id === user.id && tenant.status === 'active';
    if (!isOwner && !isLinkedTenant) {
      return res.status(403).json({ error: 'You are not authorized to report maintenance for this tenancy.' });
    }

    const { data, error } = await supabaseAdmin
      .from('maintenance_requests')
      .insert({
        property_id: propertyId,
        unit_id: unitId,
        tenant_id: tenantId,
        title: String(title).trim(),
        description: String(description).trim(),
        category: category || 'other',
        priority: priority || 'medium',
        status: 'pending',
        media_urls: mediaUrls || [],
      })
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, maintenanceRequest: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to submit maintenance request.' });
  }
});

// Update Maintenance Status. Only the property's owner/manager may change ticket status.
app.patch('/api/data/maintenance/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });

    const { id } = req.params;
    const { status, landlordNotes, assignedWorker } = req.body;
    const allowedStatuses = ['pending', 'acknowledged', 'in_progress', 'completed', 'rejected', 'cancelled'];
    if (status && !allowedStatuses.includes(status)) return res.status(400).json({ error: 'Invalid maintenance status.' });

    const { data: ticket, error: ticketError } = await supabaseAdmin
      .from('maintenance_requests').select('id,property_id').eq('id', id).maybeSingle();
    if (ticketError) return res.status(503).json({ error: 'Maintenance database is not ready.' });
    if (!ticket) return res.status(404).json({ error: 'Maintenance request not found.' });

    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties').select('owner_id,landlord_id').eq('id', ticket.property_id).maybeSingle();
    if (propertyError) return res.status(503).json({ error: 'Property database is not ready.' });
    if (!property || (property.owner_id !== user.id && property.landlord_id !== user.id)) {
      return res.status(403).json({ error: "Only the property's landlord or manager can update this request." });
    }

    const { data, error } = await supabaseAdmin
      .from('maintenance_requests')
      .update({
        ...(status ? { status } : {}),
        ...(landlordNotes !== undefined ? { landlord_notes: landlordNotes } : {}),
        ...(assignedWorker !== undefined ? { assigned_worker: assignedWorker } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, maintenanceRequest: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update maintenance request.' });
  }
});

// Create Expense in live Supabase
// Create Expense in live Supabase (landlord-only).
app.post('/api/data/expenses', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    const { propertyId, unitId, amount, category, expenseDate, description, receiptAttachment } = req.body;
    if (!propertyId || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || !description) {
      return res.status(400).json({ error: 'Property, positive amount, and description are required.' });
    }
    const { data: property } = await supabaseAdmin.from('properties').select('owner_id,landlord_id').eq('id', propertyId).maybeSingle();
    if (!property || (property.owner_id !== user.id && property.landlord_id !== user.id)) {
      return res.status(403).json({ error: "Only the property's landlord or manager can record expenses." });
    }
    const { data, error } = await supabaseAdmin.from('expenses').insert({
      property_id: propertyId, unit_id: unitId || null, amount: Number(amount),
      category: category || 'other', expense_date: expenseDate || new Date().toISOString().slice(0, 10),
      description: String(description).trim(), receipt_attachment: receiptAttachment || null, created_by: user.id,
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, expense: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to create expense.' });
  }
});

// Delete Expense (landlord-only).
app.delete('/api/data/expenses/:id', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    const { id } = req.params;
    const { data: expense } = await supabaseAdmin.from('expenses').select('id,property_id').eq('id', id).maybeSingle();
    if (!expense) return res.status(404).json({ error: 'Expense not found.' });
    const { data: property } = await supabaseAdmin.from('properties').select('owner_id,landlord_id').eq('id', expense.property_id).maybeSingle();
    if (!property || (property.owner_id !== user.id && property.landlord_id !== user.id)) {
      return res.status(403).json({ error: "Only the property's landlord or manager can delete expenses." });
    }
    const { error } = await supabaseAdmin.from('expenses').delete().eq('id', id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete expense.' });
  }
});

// Mark the signed-in user's own notification as read.
app.patch('/api/data/notifications/:id/read', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    const { id } = req.params;
    const { error } = await supabaseAdmin.from('notifications').update({ read: true }).eq('id', id).eq('user_id', user.id);
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update notification.' });
  }
});

// Send an in-app notification to the landlord's linked tenant only.
app.post('/api/data/notifications', async (req, res) => {
  try {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase is not configured.' });
    const user = await getAuthenticatedUser(req);
    if (!user) return res.status(401).json({ error: 'Please sign in.' });
    const { userId, title, message, channel, type } = req.body;
    if (!userId || !title || !message) return res.status(400).json({ error: 'Recipient, title, and message are required.' });

    if (userId !== user.id) {
      const { data: tenantRows, error: tenantError } = await supabaseAdmin.from('tenants').select('property_id').eq('user_id', userId).eq('status', 'active');
      if (tenantError) return res.status(503).json({ error: 'Tenant records are not available.' });
      const propertyIds = (tenantRows || []).map((t: any) => t.property_id);
      if (!propertyIds.length) return res.status(403).json({ error: 'You cannot send notifications to this account.' });
      const { data: ownedProperties } = await supabaseAdmin.from('properties').select('id').in('id', propertyIds).or(`owner_id.eq.${user.id},landlord_id.eq.${user.id}`);
      if (!ownedProperties?.length) return res.status(403).json({ error: 'You cannot send notifications to this account.' });
    }

    const { data, error } = await supabaseAdmin.from('notifications').insert({
      user_id: userId, title: String(title).trim(), message: String(message).trim(),
      channel: channel || 'in_app', read: false, notification_type: type || 'system',
    }).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json({ success: true, notification: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to send notification.' });
  }
});

// Mav AI Chat and Action Engine (Server-Side)
app.post('/api/gemini/chat', async (req, res) => {
  try {
    const { prompt, role, userContext, history } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!ai) {
      return res.status(503).json({
        error: 'Gemini API key is not configured. Please add GEMINI_API_KEY to your environment.',
      });
    }

    // Role-isolated system instructions
    let systemInstruction = '';
    if (role === 'tenant') {
      systemInstruction = `You are Mav AI (Tenant Mode) for MavRent Platform.
You assist ONLY the authenticated tenant with their own rental unit, rent payments, due dates, receipts, maintenance issues, and notifications.
STRICT SECURITY BOUNDARY:
- Never disclose landlord private revenue, property purchase records, or other tenants' names, rooms, contact info, or balances.
- If asked about other tenants or general landlord accounts, refuse politely and advise contacting the property manager directly.
- Tenant context: ${JSON.stringify(userContext || {})}.
- Keep tone professional, clear, empathetic, and concise.`;
    } else {
      // Landlord / Property Manager Mode
      systemInstruction = `You are Mav AI, the intelligent property management copilot for MavRent Platform.
You assist landlords and property managers with rental properties, tenant status, overdue rent analysis, financial insights, occupancy, maintenance triage, and payment recording.
Current Landlord Context & Portfolio Data:
${JSON.stringify(userContext || {})}

CRITICAL ACTION PROTOCOL:
When a user instructs an action that alters financial or database records (e.g. "John paid 300,000", "Record payment of 500k for unit B2", "Create maintenance ticket", "Delete tenant"):
DO NOT claim the payment has already been recorded!
Instead:
1. Identify the tenant and unit.
2. Determine the exact payment amount, method, and transaction reference (or ask if missing).
3. Check current balance.
4. Output a structured ACTION PROPOSAL enclosed in an JSON block with type "PROPOSED_ACTION", containing:
{
  "action": "RECORD_PAYMENT" | "CREATE_MAINTENANCE" | "UPDATE_RENT" | "DELETE_ENTITY",
  "riskLevel": "financial_write" | "low_risk_write" | "destructive",
  "payload": { ...all details... },
  "summary": "Clear human-readable summary of what will happen upon confirmation",
  "requiresConfirmation": true
}
Explain to the user the exact impact and ask for confirmation before finalizing.
For read-only inquiries (e.g., "Who is overdue?", "Total rent collected?", "Show vacant units"), answer directly, accurately, and with structured bullet points and currency amounts.`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
      },
    });

    const replyText = response.text || 'I could not generate a response at this time.';

    // Check if reply contains a proposed structured action
    let proposedAction = null;
    const actionMatch = replyText.match(/```json\s*(\{[\s\S]*?"action"[\s\S]*?\})\s*```/);
    if (actionMatch && actionMatch[1]) {
      try {
        proposedAction = JSON.parse(actionMatch[1]);
      } catch (e) {
        // Fallback
      }
    }

    res.json({
      text: replyText,
      proposedAction,
    });
  } catch (err: any) {
    console.error('Mav AI Error:', err);
    res.status(500).json({
      error: 'Failed to process AI request',
      details: err.message || 'Internal server error',
    });
  }
});

// Provider abstraction for SMS & WhatsApp notifications
app.post('/api/notifications/dispatch', async (req, res) => {
  const { channel, recipient, message } = req.body;
  console.log(`[Notification Dispatch] Channel: ${channel}, To: ${recipient}, Message: "${message}"`);
  res.json({
    success: true,
    messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    channel,
    status: 'queued',
    timestamp: new Date().toISOString(),
  });
});

// Catch-all for unmatched /api routes ensuring standard JSON 404 responses
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.path}`,
  });
});

// JSON error-handling middleware for API routes
app.use('/api', (err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled API exception:', err);
  if (res.headersSent) {
    return next(err);
  }
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

async function startServer() {
  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`MavRent Platform server running on http://0.0.0.0:${PORT}`);
  });
}

// Vercel and serverless handlers import this Express app. Only start
// the listening HTTP/Vite server when executed directly as entrypoint.
const isDirectEntry = Boolean(
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
);
if (isDirectEntry && process.env.VERCEL !== '1') {
  startServer();
}

export default app;
