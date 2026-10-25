import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Retrieve credentials from environment or runtime config
const envUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim();
const envAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Runtime override allows users to configure keys in the UI without editing code
const storedUrl = typeof window !== 'undefined' ? (localStorage.getItem('mavrent_supabase_url') || '').trim() : '';
const storedAnonKey = typeof window !== 'undefined' ? (localStorage.getItem('mavrent_supabase_anon_key') || '').trim() : '';

export function normalizeSupabaseUrl(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (!trimmed.includes('.') && trimmed.length >= 15) {
    return `https://${trimmed}.supabase.co`;
  }
  return trimmed;
}

export let SUPABASE_URL = normalizeSupabaseUrl(storedUrl || envUrl);
export let SUPABASE_ANON_KEY = storedAnonKey || envAnonKey;

export function isValidHttpUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') return false;
  try {
    const url = new URL(urlString.trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && !urlString.includes('your-project');
  } catch {
    return false;
  }
}

export let isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  isValidHttpUrl(SUPABASE_URL) &&
  !SUPABASE_ANON_KEY.includes('your-anon-key') &&
  SUPABASE_ANON_KEY.length > 20
);

export let supabase: SupabaseClient | null = null;

export function initSupabaseClient(url: string, key: string): SupabaseClient | null {
  const normUrl = normalizeSupabaseUrl(url);
  if (!normUrl || !key || !isValidHttpUrl(normUrl) || key.length < 20 || key.includes('your-anon-key')) {
    return null;
  }
  try {
    const client = createClient(normUrl, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    supabase = client;
    SUPABASE_URL = normUrl;
    SUPABASE_ANON_KEY = key;
    isSupabaseConfigured = true;
    return client;
  } catch (err) {
    console.warn('Could not initialize Supabase client:', err);
    return null;
  }
}

// Initial client creation if valid
if (isSupabaseConfigured) {
  initSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

let initPromise: Promise<SupabaseClient | null> | null = null;

// Synchronize and return guaranteed SupabaseClient instance
export async function getOrInitSupabase(): Promise<SupabaseClient | null> {
  if (isSupabaseConfigured && supabase) return supabase;
  if (!initPromise) {
    initPromise = (async () => {
      if (isSupabaseConfigured && supabase) return supabase;
      const initialClient = initSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      if (initialClient) return initialClient;

      try {
        const res = await fetch('/api/config/supabase');
        if (res.ok) {
          const data = await res.json();
          if (data.configured && data.url && data.anonKey) {
            return initSupabaseClient(data.url, data.anonKey);
          }
        }
      } catch (err) {
        console.warn('Could not auto-sync Supabase config from /api/config/supabase:', err);
      }
      return null;
    })().finally(() => {
      initPromise = null;
    });
  }
  return initPromise;
}

// Auto-discover config from server endpoint if client environment lacks it
export async function syncServerSupabaseConfig(): Promise<boolean> {
  const client = await getOrInitSupabase();
  return Boolean(client);
}

export function saveSupabaseConfig(url: string, key: string) {
  if (typeof window !== 'undefined') {
    const cleanUrl = normalizeSupabaseUrl(url.trim());
    const cleanKey = key.trim();
    if (!isValidHttpUrl(cleanUrl)) {
      alert('Invalid Supabase Project URL. Must start with https://');
      return;
    }
    localStorage.setItem('mavrent_supabase_url', cleanUrl);
    localStorage.setItem('mavrent_supabase_anon_key', cleanKey);
    initSupabaseClient(cleanUrl, cleanKey);
    window.location.reload();
  }
}

export function clearSupabaseConfig() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('mavrent_supabase_url');
    localStorage.removeItem('mavrent_supabase_anon_key');
    window.location.reload();
  }
}

export async function testSupabaseConnection(): Promise<{ success: boolean; message: string }> {
  if (!supabase || !isSupabaseConfigured) {
    return { success: false, message: 'Supabase client is not configured with a valid HTTP/HTTPS URL and Anon Key.' };
  }
  try {
    const { error } = await supabase.from('properties').select('count', { count: 'exact', head: true });
    if (error && error.code !== 'PGRST116') {
      return { success: false, message: `Connected to Supabase, but query returned: ${error.message}` };
    }
    return { success: true, message: 'Successfully connected to MavRent Supabase PostgreSQL database!' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection test failed.' };
  }
}
