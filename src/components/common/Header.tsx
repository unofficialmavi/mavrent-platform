import React, { useState } from 'react';
import {
  Building2,
  Bell,
  Sparkles,
  Database,
  User,
  LogOut,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Shield,
  Smartphone,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import { PWAInstallButton } from './PWAInstallButton';
import { UserRole } from '../../types';

interface HeaderProps {
  onOpenMavAi: () => void;
  onOpenSupabaseSetup: () => void;
  onOpenAuthModal: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenMavAi,
  onOpenSupabaseSetup,
  onOpenAuthModal,
  activeTab,
  setActiveTab,
}) => {
  const { currentUser, role, switchRole, logout } = useAuth();
  const {
    notifications,
    markNotificationRead,
    isSyncing,
    syncError,
    lastSyncedAt,
    refreshPortfolio,
  } = useProperty();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl transition-all">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand / Logo */}
        <div className="flex items-center gap-6">
          <div
            onClick={() => setActiveTab('dashboard')}
            className="flex cursor-pointer items-center gap-3 group"
          >
            <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 shadow-lg shadow-blue-500/25 ring-1 ring-white/20 transition-transform group-hover:scale-105">
              <span className="font-mono text-xl font-black text-white tracking-tighter">M</span>
              <div className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-400 ring-2 ring-slate-950">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-950 animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight text-white font-sans">
                  MavRent
                </span>
                <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-400 ring-1 ring-blue-500/30">
                  PRO
                </span>
              </div>
              <p className="text-[10px] text-slate-400 tracking-wide uppercase font-medium">
                Rental SaaS Platform
              </p>
            </div>
          </div>

          {/* Desktop Navigation Tabs for Landlord */}
          {role !== 'tenant' && (
            <nav className="hidden lg:flex items-center gap-1">
              {[
                { id: 'dashboard', label: 'Dashboard' },
                { id: 'properties', label: 'Properties' },
                { id: 'tenants', label: 'Tenants' },
                { id: 'payments', label: 'Payments' },
                { id: 'maintenance', label: 'Maintenance' },
                { id: 'expenses', label: 'Expenses' },
                { id: 'reports', label: 'Reports' },
                { id: 'care-mode', label: 'Care Mode' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    activeTab === item.id
                      ? 'bg-blue-600/15 text-blue-400 ring-1 ring-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}

          {/* Desktop Navigation Tabs for Tenant */}
          {role === 'tenant' && (
            <nav className="hidden lg:flex items-center gap-1">
              {[
                { id: 'dashboard', label: 'My Rental' },
                { id: 'payments', label: 'Payments & Receipts' },
                { id: 'maintenance', label: 'Maintenance Requests' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    activeTab === item.id
                      ? 'bg-blue-600/15 text-blue-400 ring-1 ring-blue-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick Perspective Switcher (Multi-Tenant Demonstrator) */}
          <div className="hidden sm:flex items-center bg-slate-900/90 rounded-lg p-0.5 border border-slate-800 text-xs">
            <button
              onClick={() => switchRole('landlord')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                role === 'landlord'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Landlord View
            </button>
            <button
              onClick={() => switchRole('tenant')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                role === 'tenant'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tenant View
            </button>
          </div>

          {/* Supabase Status Pill */}
          <button
            onClick={onOpenSupabaseSetup}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              isSupabaseConfigured
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
            }`}
            title="Configure Supabase PostgreSQL & Auth"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {isSupabaseConfigured ? 'Supabase Live' : 'Supabase Config'}
            </span>
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                isSupabaseConfigured ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
              }`}
            />
          </button>

          {/* Real-Time Sync Indicator & Manual Trigger */}
          <button
            onClick={() => refreshPortfolio()}
            disabled={isSyncing}
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition ${
              syncError
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                : isSyncing
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                : 'border-slate-800 bg-slate-900/80 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
            title={syncError ? `Sync error: ${syncError}` : lastSyncedAt ? `Last synced: ${lastSyncedAt}` : 'Sync with Supabase'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
            <span className="hidden xl:inline">
              {isSyncing ? 'Syncing...' : syncError ? 'Sync Error' : 'Live Sync'}
            </span>
          </button>

          {/* PWA Install Button */}
          <PWAInstallButton />

          {/* Mav AI Trigger Button */}
          <button
            onClick={onOpenMavAi}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 via-indigo-600 to-sky-500 px-3 py-1.5 text-xs font-bold text-white shadow-md shadow-blue-600/20 ring-1 ring-white/20 hover:from-blue-500 hover:to-indigo-500 active:scale-95 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>Mav AI</span>
          </button>

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative rounded-lg p-2 text-slate-400 hover:bg-slate-900 hover:text-white transition"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-slate-950">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notification Dropdown */}
            {showNotifications && (
              <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-xl p-4 z-50 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Notifications
                  </h4>
                  <span className="text-[11px] text-blue-400 font-medium">
                    {unreadCount} unread
                  </span>
                </div>
                <div className="mt-2 max-h-72 space-y-2 overflow-y-auto divide-y divide-slate-800/50">
                  {notifications.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-500">
                      No notifications yet
                    </p>
                  ) : (
                    notifications.map((n, idx) => (
                      <div
                        key={`${n.id || 'notif'}-${idx}`}
                        onClick={() => markNotificationRead(n.id)}
                        className={`pt-2.5 pb-1 cursor-pointer transition ${
                          !n.read ? 'opacity-100' : 'opacity-60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-semibold text-slate-200">{n.title}</p>
                          <span className="text-[10px] text-slate-500">
                            {new Date(n.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-400 leading-relaxed">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile / Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-1.5 hover:bg-slate-800/80 transition"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-tr from-slate-700 to-slate-800 text-xs font-bold text-white border border-slate-700">
                {currentUser?.fullName ? currentUser.fullName.charAt(0) : 'U'}
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-slate-900/95 border border-slate-800 shadow-2xl backdrop-blur-xl p-2 z-50">
                <div className="px-3 py-2 border-b border-slate-800/80">
                  <p className="text-xs font-bold text-white truncate">
                    {currentUser?.fullName || 'User'}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{currentUser?.email}</p>
                  <span className="mt-1.5 inline-block rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/20 uppercase">
                    Role: {role}
                  </span>
                </div>

                <div className="p-1 space-y-1">
                  <button
                    onClick={() => {
                      switchRole(role === 'landlord' ? 'tenant' : 'landlord');
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-300 hover:bg-slate-800 transition"
                  >
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span>Switch to {role === 'landlord' ? 'Tenant' : 'Landlord'} View</span>
                  </button>
                  <button
                    onClick={() => {
                      onOpenSupabaseSetup();
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-300 hover:bg-slate-800 transition"
                  >
                    <Database className="w-4 h-4 text-emerald-400" />
                    <span>Database & Auth Setup</span>
                  </button>
                  <button
                    onClick={() => {
                      logout();
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-rose-400 hover:bg-rose-500/10 transition"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
