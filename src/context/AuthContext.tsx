import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types';
import { supabase, isSupabaseConfigured, getOrInitSupabase } from '../lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

interface AuthContextType {
  currentUser: UserProfile | null;
  role: UserRole;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: { email: string; fullName: string; role: UserRole; phone: string; password?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('mavrent_current_user');
        return cached ? JSON.parse(cached) : null;
      } catch {
        return null;
      }
    }
    return null;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Helper to extract authoritative user profile without dropping legitimate sessions
  const resolveUserProfile = async (client: SupabaseClient, user: any): Promise<UserProfile> => {
    let mappedRole: UserRole = 'landlord';
    let fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
    let phone = user.phone || '';
    let tenantCode: string | undefined;

    try {
      const { data: prof } = await client.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (prof) {
        if (prof.role === 'renter' || prof.role === 'tenant') mappedRole = 'tenant';
        else if (prof.role === 'agent') mappedRole = 'property_manager';
        else if (prof.role === 'admin') mappedRole = 'admin';
        else if (prof.role === 'landlord') mappedRole = 'landlord';
        if (prof.full_name) fullName = prof.full_name;
        if (prof.phone) phone = prof.phone;
        if (prof.tenant_code) tenantCode = prof.tenant_code;
      } else {
        const metaRole = user.user_metadata?.role;
        mappedRole = metaRole === 'tenant' ? 'tenant' : 'landlord';
      }

      if (mappedRole === 'tenant' && !tenantCode) {
        const { data: ten } = await client
          .from('tenants')
          .select('tenant_code')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        if (ten?.tenant_code) tenantCode = ten.tenant_code;
      }
    } catch (err) {
      console.warn('Profile read fallback to session metadata:', err);
      const metaRole = user.user_metadata?.role;
      mappedRole = metaRole === 'tenant' ? 'tenant' : 'landlord';
    }

    return {
      id: user.id,
      role: mappedRole,
      fullName,
      phone,
      email: user.email || '',
      tenantCode,
      createdAt: user.created_at || new Date().toISOString(),
    };
  };

  // Sync with live Supabase session on mount
  useEffect(() => {
    let isMounted = true;
    let authSubscription: { unsubscribe: () => void } | null = null;

    async function initAuth() {
      try {
        const client = await getOrInitSupabase();
        if (!client || !isMounted) {
          setIsLoading(false);
          return;
        }

        // 1. Check existing session
        const { data: { session } } = await client.auth.getSession();
        if (session?.user && isMounted) {
          const profile = await resolveUserProfile(client, session.user);
          if (isMounted) {
            setCurrentUser(profile);
            localStorage.setItem('mavrent_current_user', JSON.stringify(profile));
          }
        } else if (!session && isMounted) {
          setCurrentUser(null);
          localStorage.removeItem('mavrent_current_user');
        }

        // 2. Set up reactive auth state change listener
        const { data: { subscription } } = client.auth.onAuthStateChange(async (_event, newSession) => {
          if (!isMounted) return;
          if (newSession?.user) {
            const profile = await resolveUserProfile(client, newSession.user);
            if (isMounted) {
              setCurrentUser(profile);
              localStorage.setItem('mavrent_current_user', JSON.stringify(profile));
            }
          } else {
            setCurrentUser(null);
            localStorage.removeItem('mavrent_current_user');
          }
        });
        authSubscription = subscription;
      } catch (err) {
        console.warn('Auth initialization warning:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initAuth();

    return () => {
      isMounted = false;
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  const login = async (email: string, password?: string) => {
    setIsLoading(true);
    try {
      if (password) {
        const res = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        let json: any = null;
        try {
          json = await res.json();
        } catch {
          throw new Error(`Authentication server returned HTTP ${res.status}. Expected JSON response.`);
        }

        if (!res.ok || !json.success) {
          throw new Error(json?.error || 'Invalid email or password');
        }
        if (!json.profile) {
          throw new Error('Your account profile is not set up yet. Please contact platform support.');
        }

        // Store session in Supabase client if returned
        if (json.session && isSupabaseConfigured && supabase) {
          await supabase.auth.setSession(json.session);
        }

        let role: UserRole = 'landlord';
        if (json.profile?.role === 'renter' || json.profile?.role === 'tenant') {
          role = 'tenant';
        } else if (json.profile?.role === 'property_manager' || json.profile?.role === 'admin') {
          role = json.profile.role as UserRole;
        } else if (json.profile?.role === 'agent') {
          role = 'property_manager';
        } else {
          role = 'landlord';
        }
        const profile: UserProfile = {
          id: json.user.id,
          role,
          fullName: json.profile?.full_name || json.user.user_metadata?.full_name || email.split('@')[0],
          phone: json.profile?.phone || '',
          email: json.user.email || email,
          createdAt: json.user.created_at || new Date().toISOString(),
        };

        setCurrentUser(profile);
        localStorage.setItem('mavrent_current_user', JSON.stringify(profile));
        setIsLoading(false);
        return { success: true };
      }

      return { success: false, error: 'Enter your password to sign in with your registered MavRent account.' };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: err.message || 'Login failed' };
    }
  };

  const register = async (data: { email: string; fullName: string; role: UserRole; phone: string; password?: string }) => {
    setIsLoading(true);
    try {
      if (data.password) {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        let json: any = null;
        try {
          json = await res.json();
        } catch {
          const rawText = await res.text().catch(() => '');
          throw new Error(rawText || `Registration server returned HTTP ${res.status}. Expected JSON response.`);
        }

        if (!res.ok || !json.success) {
          throw new Error(json?.error || 'Failed to create account');
        }

        if (json.session && isSupabaseConfigured && supabase) {
          await supabase.auth.setSession(json.session);
        } else if (!json.session && data.password) {
          // If server did not return a session, sign in directly with credentials
          return await login(data.email, data.password);
        }

        const profile: UserProfile = {
          id: json.user?.id || json.profile?.id,
          role: json.profile?.role === 'renter' || json.profile?.role === 'tenant' ? 'tenant' : (json.profile?.role || data.role),
          fullName: json.profile?.fullName || json.profile?.full_name || data.fullName,
          phone: json.profile?.phone || data.phone,
          email: json.profile?.email || data.email,
          tenantCode: json.profile?.tenantCode || json.profile?.tenant_code,
          createdAt: new Date().toISOString(),
        };

        setCurrentUser(profile);
        localStorage.setItem('mavrent_current_user', JSON.stringify(profile));
        setIsLoading(false);
        return { success: true };
      }

      return { success: false, error: 'A password is required to create a secure account.' };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: err.message || 'Registration failed' };
    }
  };

  const logout = async () => {
    try {
      if (isSupabaseConfigured && supabase) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          fetch('/api/auth/signout', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }).catch(() => {});
        }
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.warn('Signout notice:', err);
    } finally {
      setCurrentUser(null);
      localStorage.removeItem('mavrent_current_user');
    }
  };


  const updateProfile = (updates: Partial<UserProfile>) => {
    if (!currentUser) return;
    const updated = { ...currentUser, ...updates };
    setCurrentUser(updated);
    localStorage.setItem('mavrent_current_user', JSON.stringify(updated));
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser?.role || 'landlord',
        isLoading,
        login,
        register,
        logout,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
