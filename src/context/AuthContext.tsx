import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../types';
import { supabase, isSupabaseConfigured, syncServerSupabaseConfig } from '../lib/supabase';

interface AuthContextType {
  currentUser: UserProfile | null;
  role: UserRole;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: { email: string; fullName: string; role: UserRole; phone: string; password?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  switchRole: (role: UserRole) => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEFAULT_LANDLORD: UserProfile = {
  id: 'usr-landlord-001',
  role: 'landlord',
  fullName: 'Eng. Patrick Kato',
  phone: '+256 772 123 456',
  email: 'landlord@mavrent.com',
  createdAt: '2026-01-15T08:00:00Z',
};

const DEFAULT_TENANT: UserProfile = {
  id: 'usr-tenant-001',
  role: 'tenant',
  fullName: 'Grace Nakato',
  phone: '+256 701 987 654',
  email: 'grace@example.com',
  tenantCode: 'MVR-88219K',
  createdAt: '2026-02-01T10:00:00Z',
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('mavrent_current_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return DEFAULT_LANDLORD;
      }
    }
    return DEFAULT_LANDLORD;
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Sync with live Supabase session on mount
  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      try {
        await syncServerSupabaseConfig();

        if (isSupabaseConfigured && supabase) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user && isMounted) {
            const user = session.user;
            // Fetch profile record from Supabase
            let mappedRole: UserRole = user.user_metadata?.role === 'tenant' ? 'tenant' : 'landlord';
            let fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
            let phone = user.phone || '';
            let tenantCode = user.user_metadata?.tenant_code;

            try {
              const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
              if (prof) {
                if (prof.role === 'renter' || prof.role === 'tenant') mappedRole = 'tenant';
                if (prof.full_name) fullName = prof.full_name;
                if (prof.phone) phone = prof.phone;
                if (prof.tenant_code) tenantCode = prof.tenant_code;
              }

              if (mappedRole === 'tenant' && !tenantCode) {
                const { data: ten } = await supabase.from('tenants').select('tenant_code').or(`user_id.eq.${user.id},email.eq.${user.email}`).limit(1).maybeSingle();
                if (ten?.tenant_code) tenantCode = ten.tenant_code;
              }
            } catch (pErr) {
              console.warn('Profile enrichment warning:', pErr);
            }

            const profile: UserProfile = {
              id: user.id,
              role: mappedRole,
              fullName,
              phone,
              email: user.email || '',
              tenantCode,
              createdAt: user.created_at,
            };
            setCurrentUser(profile);
            localStorage.setItem('mavrent_current_user', JSON.stringify(profile));
          }
        }
      } catch (err) {
        console.warn('Session check warning:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    checkSession();

    if (isSupabaseConfigured && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        if (session?.user && isMounted) {
          const user = session.user;
          let mappedRole: UserRole = user.user_metadata?.role === 'tenant' ? 'tenant' : 'landlord';
          let fullName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User';
          let phone = user.phone || '';
          let tenantCode = user.user_metadata?.tenant_code;

          if (supabase) {
            try {
              const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
              if (prof) {
                if (prof.role === 'renter' || prof.role === 'tenant') mappedRole = 'tenant';
                if (prof.full_name) fullName = prof.full_name;
                if (prof.phone) phone = prof.phone;
                if (prof.tenant_code) tenantCode = prof.tenant_code;
              }
            } catch {}
          }

          const profile: UserProfile = {
            id: user.id,
            role: mappedRole,
            fullName,
            phone,
            email: user.email || '',
            tenantCode,
            createdAt: user.created_at,
          };
          setCurrentUser(profile);
          localStorage.setItem('mavrent_current_user', JSON.stringify(profile));
        }
      });

      return () => {
        isMounted = false;
        subscription.unsubscribe();
      };
    }
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

        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Invalid email or password');
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

      // Quick local test login fallback
      let user: UserProfile = DEFAULT_LANDLORD;
      if (email.toLowerCase().includes('tenant') || email.toLowerCase().includes('grace')) {
        user = DEFAULT_TENANT;
      } else {
        user = {
          ...DEFAULT_LANDLORD,
          email,
          fullName: email.split('@')[0].toUpperCase(),
        };
      }
      setCurrentUser(user);
      localStorage.setItem('mavrent_current_user', JSON.stringify(user));
      setIsLoading(false);
      return { success: true };
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

        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to create account');
        }

        if (json.session && isSupabaseConfigured && supabase) {
          await supabase.auth.setSession(json.session);
        }

        const profile: UserProfile = {
          id: json.user.id,
          role: data.role,
          fullName: data.fullName,
          phone: data.phone,
          email: data.email,
          createdAt: new Date().toISOString(),
        };

        setCurrentUser(profile);
        localStorage.setItem('mavrent_current_user', JSON.stringify(profile));
        setIsLoading(false);
        return { success: true };
      }

      // Fallback
      const newUser: UserProfile = {
        id: `usr-${Date.now()}`,
        role: data.role,
        fullName: data.fullName,
        phone: data.phone,
        email: data.email,
        createdAt: new Date().toISOString(),
      };
      setCurrentUser(newUser);
      localStorage.setItem('mavrent_current_user', JSON.stringify(newUser));
      setIsLoading(false);
      return { success: true };
    } catch (err: any) {
      setIsLoading(false);
      return { success: false, error: err.message || 'Registration failed' };
    }
  };

  const logout = async () => {
    if (isSupabaseConfigured && supabase) {
      await supabase.auth.signOut();
    }
    setCurrentUser(null);
    localStorage.removeItem('mavrent_current_user');
  };

  const switchRole = (newRole: UserRole) => {
    if (newRole === 'tenant') {
      setCurrentUser(DEFAULT_TENANT);
      localStorage.setItem('mavrent_current_user', JSON.stringify(DEFAULT_TENANT));
    } else {
      setCurrentUser({
        ...DEFAULT_LANDLORD,
        role: newRole,
      });
      localStorage.setItem('mavrent_current_user', JSON.stringify({ ...DEFAULT_LANDLORD, role: newRole }));
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
        switchRole,
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
