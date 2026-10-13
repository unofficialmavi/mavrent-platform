import React, { useState } from 'react';
import {
  Shield,
  Zap,
  Bell,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Play,
  Settings,
  MessageSquare,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import { useProperty } from '../../context/PropertyContext';

export const CareModeView: React.FC = () => {
  const { tenants, runCareModeAutomation } = useProperty();

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ remindersSent: number; overdueAlerts: number } | null>(
    null
  );

  // Automation Toggles
  const [enableRentReminders, setEnableRentReminders] = useState(true);
  const [enableOverdueAlerts, setEnableOverdueAlerts] = useState(true);
  const [requireLandlordPaymentConfirmation, setRequireLandlordPaymentConfirmation] =
    useState(true);
  const [enableSmsChannel, setEnableSmsChannel] = useState(true);
  const [enableWhatsAppChannel, setEnableWhatsAppChannel] = useState(true);

  const handleRunAutomation = async () => {
    setRunning(true);
    const res = await runCareModeAutomation();
    setResult(res);
    setRunning(false);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Zap className="w-3.5 h-3.5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Care Mode Automation Engine
            </h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Automated tenant rent reminders, overdue escalations, and strict financial safeguards.
          </p>
        </div>

        <button
          onClick={handleRunAutomation}
          disabled={running}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-blue-600/25 hover:from-blue-500 hover:to-indigo-500 active:scale-95 transition disabled:opacity-50"
        >
          {running ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4 fill-white" />
          )}
          <span>Run Care Mode Batch Check</span>
        </button>
      </div>

      {/* Result Banner if run */}
      {result && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 backdrop-blur-md animate-in fade-in">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-bold text-emerald-200">
                Care Mode Automation Cycle Executed Successfully
              </h3>
              <p className="text-xs text-emerald-300/80 mt-1">
                Dispatched <strong>{result.remindersSent} upcoming rent reminders</strong> and{' '}
                <strong>{result.overdueAlerts} overdue warnings</strong> into tenant notification channels.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Financial Safeguards Notice */}
      <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-5 backdrop-blur-md">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-blue-200">
              Strict Non-Autonomous Financial Safeguards Active
            </h3>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              MavRent Care Mode never autonomously credits or marks a financial payment as confirmed without human verification or certified bank webhook proofs. Financial ledger mutations require explicit operator confirmation.
            </p>
          </div>
        </div>
      </div>

      {/* Automation Rules Configuration */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl space-y-5">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider">
          Scheduled Workflow Policies
        </h3>

        <div className="space-y-4 divide-y divide-slate-800/80">
          {/* Rule 1: Rent due reminder */}
          <div className="pt-4 first:pt-0 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-white">
                Upcoming Rent Notice (3-Day Lead Time)
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Automatically notifies tenants 3 days before their agreed monthly due date.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enableRentReminders}
                onChange={(e) => setEnableRentReminders(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Rule 2: Overdue alert */}
          <div className="pt-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-white">Overdue Rent Escalation</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Flags accounts with outstanding balances and dispatches gentle payment reminders.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enableOverdueAlerts}
                onChange={(e) => setEnableOverdueAlerts(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Rule 3: Payment confirmation lock */}
          <div className="pt-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-white">
                Require Landlord Receipt Authorization
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Prevents unconfirmed tenant payment submissions from clearing current ledger balance without landlord review.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={requireLandlordPaymentConfirmation}
                onChange={(e) => setRequireLandlordPaymentConfirmation(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </div>

      {/* Multi-Channel Provider Connectors */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-xl">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-2">
          Communication Gateways
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Abstracted provider interfaces ready for Uganda telecom SMS gateways and WhatsApp Business API.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white">SMS Gateway</span>
              <span className="ml-auto rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                Ready
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Dispatches SMS reminders: "Dear Grace, your rent of UGX 850,000 is due on 5 Oct."
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span className="font-bold text-white">WhatsApp Business API</span>
              <span className="ml-auto rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                Configured
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Sends verified electronic receipts and payment confirmations directly to tenant WhatsApp numbers.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
