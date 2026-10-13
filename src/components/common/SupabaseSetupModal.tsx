import React, { useState } from 'react';
import {
  X,
  Database,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Shield,
  RefreshCw,
  Key,
} from 'lucide-react';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  isSupabaseConfigured,
  saveSupabaseConfig,
  clearSupabaseConfig,
  testSupabaseConnection,
} from '../../lib/supabase';

interface SupabaseSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseSetupModal: React.FC<SupabaseSetupModalProps> = ({ isOpen, onClose }) => {
  const [urlInput, setUrlInput] = useState(SUPABASE_URL || '');
  const [keyInput, setKeyInput] = useState(SUPABASE_ANON_KEY || '');
  const [testResult, setTestResult] = useState<{ testing: boolean; message: string; success?: boolean } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [activeTab, setActiveTab] = useState<'credentials' | 'schema'>('credentials');

  if (!isOpen) return null;

  const handleTest = async () => {
    setTestResult({ testing: true, message: 'Testing database connection...' });
    const res = await testSupabaseConnection();
    setTestResult({ testing: false, message: res.message, success: res.success });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || !keyInput.trim()) {
      alert('Please provide both Project URL and Anon Key');
      return;
    }
    saveSupabaseConfig(urlInput, keyInput);
  };

  const copyMigrationPath = () => {
    navigator.clipboard.writeText('supabase/migrations/20261008000000_mavrent_core_schema.sql');
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Supabase PostgreSQL & Auth</h3>
              <p className="text-xs text-slate-400">Multi-tenant database connection & RLS security</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab toggle */}
        <div className="flex border-b border-slate-800 px-6 pt-3 bg-slate-950/30 gap-4 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('credentials')}
            className={`pb-3 transition border-b-2 ${
              activeTab === 'credentials'
                ? 'border-blue-500 text-blue-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Connection & Credentials
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`pb-3 transition border-b-2 ${
              activeTab === 'schema'
                ? 'border-blue-500 text-blue-400 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Database Schema & RLS Policies
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Status banner */}
          <div
            className={`flex items-start gap-3 rounded-xl p-4 border text-xs mb-6 ${
              isSupabaseConfigured
                ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                : 'bg-blue-950/30 border-blue-500/30 text-blue-300'
            }`}
          >
            {isSupabaseConfigured ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <Shield className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            )}
            <div>
              <p className="font-bold text-sm">
                {isSupabaseConfigured
                  ? 'Connected to Live Supabase Project'
                  : 'Active in High-Fidelity Local Engine Mode'}
              </p>
              <p className="mt-1 text-slate-300 leading-relaxed">
                {isSupabaseConfigured
                  ? 'All authentication, properties, leases, payments, and receipts sync directly with your PostgreSQL database with Row Level Security.'
                  : 'MavRent Platform is currently running with the local persistent state engine. You can use all landlord & tenant workflows right now, or enter your Supabase credentials below to connect your remote database.'}
              </p>
            </div>
          </div>

          {activeTab === 'credentials' ? (
            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Supabase Project URL (VITE_SUPABASE_URL)
                </label>
                <input
                  type="text"
                  placeholder="https://xyzcompany.supabase.co"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Found in your Supabase Dashboard under <strong>Project Settings &gt; API</strong>.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Supabase Anon Key (VITE_SUPABASE_ANON_KEY)
                </label>
                <input
                  type="text"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  The client-safe public anonymous key. Row Level Security protects your database from unauthorized queries.
                </p>
              </div>

              {testResult && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    testResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                  }`}
                >
                  <p className="font-semibold">{testResult.message}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={testResult?.testing}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${testResult?.testing ? 'animate-spin' : ''}`} />
                  <span>Test Connection</span>
                </button>

                <div className="flex items-center gap-2">
                  {isSupabaseConfigured && (
                    <button
                      type="button"
                      onClick={clearSupabaseConfig}
                      className="rounded-xl border border-rose-900/50 bg-rose-950/30 px-3 py-2 text-xs text-rose-400 hover:bg-rose-900/40 transition"
                    >
                      Reset to Local
                    </button>
                  )}
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white hover:bg-blue-500 transition shadow-lg shadow-blue-600/20"
                  >
                    Save & Apply
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="rounded-xl bg-slate-950 border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-slate-200">
                    PostgreSQL Migration Script (Tables & RLS)
                  </span>
                  <button
                    onClick={copyMigrationPath}
                    className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[11px] text-slate-300 hover:text-white"
                  >
                    {copiedSql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedSql ? 'Path Copied!' : 'Copy File Path'}</span>
                  </button>
                </div>
                <p className="text-slate-400 text-[11px] mb-3">
                  The complete production schema is prepared at: <br />
                  <code className="text-blue-400 font-mono">
                    supabase/migrations/20261008000000_mavrent_core_schema.sql
                  </code>
                </p>
                <div className="space-y-2 text-[11px] text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                    <span><strong>12 Core Tables</strong>: profiles, properties, buildings, units, tenants, rent_records, payments, receipts, maintenance_requests, expenses, notifications, ai_audit_logs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    <span><strong>Strict RLS Security</strong>: Landlords manage only their properties; Tenants access only their own lease, units, and receipts.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                    <span><strong>Idempotency & Auditing</strong>: Prevents duplicate payments and logs AI actions.</span>
                  </div>
                </div>
              </div>

              <div className="text-slate-400 text-[11px] space-y-1">
                <p className="font-semibold text-slate-200">How to apply this in your Supabase project:</p>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 pl-1">
                  <li>Open your project at <strong>app.supabase.com</strong></li>
                  <li>Click on <strong>SQL Editor</strong> in the left sidebar</li>
                  <li>Paste the contents of <code className="text-blue-400">20261008000000_mavrent_core_schema.sql</code></li>
                  <li>Click <strong>Run</strong></li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
