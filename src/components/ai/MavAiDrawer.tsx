import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Send,
  ShieldAlert,
  CheckCircle,
  AlertTriangle,
  History,
  Bot,
  User,
  ArrowRight,
  CreditCard,
  Building,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProperty } from '../../context/PropertyContext';
import { supabase } from '../../lib/supabase';
import { ProposedAiAction } from '../../types';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  proposedAction?: ProposedAiAction | null;
  actionExecuted?: boolean;
}

interface MavAiDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MavAiDrawer: React.FC<MavAiDrawerProps> = ({ isOpen, onClose }) => {
  const { currentUser, role } = useAuth();
  const {
    properties,
    tenants,
    payments,
    maintenanceRequests,
    expenses,
    getPortfolioMetrics,
    executeAiAction,
    aiAuditLogs,
  } = useProperty();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 'init-1',
      sender: 'assistant',
      text:
        role === 'tenant'
          ? `Hello ${currentUser?.fullName || 'there'}! I am Mav AI, your rental copilot. I can help you check your current rent balance, review past payments, get official receipts, or report maintenance issues with your unit.`
          : `Hello ${currentUser?.fullName || 'Landlord'}! I am Mav AI, your property copilot. Ask me about overdue tenants, occupancy rates, vacant rooms, this month's rent collections, or say "John has paid 300,000 today" to prepare a verified payment record.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [actionProcessing, setActionProcessing] = useState(false);
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isOpen) return null;

  // Build context payload based on user role (Strict Data Separation!)
  const getUserContext = () => {
    if (role === 'tenant') {
      const myTenant = tenants.find((t) => t.userId === currentUser?.id || t.email === currentUser?.email) || tenants[0];
      const myProperty = properties.find((p) => p.id === myTenant?.propertyId);
      const myUnit = myProperty?.units?.find((u) => u.id === myTenant?.unitId);
      const myPayments = payments.filter((p) => p.tenantId === myTenant?.id);
      const myMaintenance = maintenanceRequests.filter((m) => m.tenantId === myTenant?.id);

      return {
        tenantName: myTenant?.fullName,
        tenantCode: myTenant?.tenantCode,
        propertyName: myProperty?.name,
        unitNumber: myUnit?.unitNumber,
        monthlyRent: myTenant?.rentAmount,
        currency: myProperty?.currency || 'UGX',
        currentBalance: myTenant?.currentBalance,
        dueDay: myTenant?.dueDay,
        recentPaymentsCount: myPayments.length,
        maintenanceTicketsCount: myMaintenance.length,
      };
    } else {
      // Landlord context
      const metrics = getPortfolioMetrics();
      const overdueList = tenants
        .filter((t) => t.currentBalance > 0)
        .map((t) => ({
          name: t.fullName,
          code: t.tenantCode,
          balance: t.currentBalance,
          dueDay: t.dueDay,
        }));
      const vacantUnits = properties.flatMap((p) =>
        (p.units || [])
          .filter((u) => u.status === 'available')
          .map((u) => ({
            property: p.name,
            unit: u.unitNumber,
            rent: u.monthlyRent,
          }))
      );

      return {
        metrics,
        overdueTenants: overdueList,
        vacantUnits,
        totalTenantsCount: tenants.length,
        pendingMaintenance: maintenanceRequests.filter((m) => m.status === 'pending').length,
        currency: 'UGX',
      };
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userPrompt = input.trim();
    setInput('');

    const newMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'user',
      text: userPrompt,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, newMsg]);
    setLoading(true);

    try {
      const session = (await supabase?.auth.getSession())?.data.session;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch('/api/gemini/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt: userPrompt,
          role,
          userContext: getUserContext(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Server returned an error');
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'assistant',
          text: data.text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          proposedAction: data.proposedAction,
        },
      ]);
    } catch (err: any) {
      console.error('Mav AI failed:', err);
      // Clean fallback response
      let fallbackText = `I ran into an issue communicating with the AI service: ${err.message}.`;
      if (err.message.includes('GEMINI_API_KEY')) {
        fallbackText = `The server requires GEMINI_API_KEY. Please ensure it is present in the environment or secrets panel. In the meantime, you can perform all rent, tenant, and maintenance actions directly from the dashboards!`;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'assistant',
          text: fallbackText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // User confirms a proposed action (e.g. RECORD_PAYMENT)
  const handleConfirmAction = async (msgId: string, action: ProposedAiAction, promptContext: string) => {
    setActionProcessing(true);
    const result = await executeAiAction(action, promptContext);
    setActionProcessing(false);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
              ...m,
              actionExecuted: true,
              text: `${m.text}\n\n**Action Execution Result:**\n${result.message}`,
            }
          : m
      )
    );
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-slate-950 border-l border-slate-800/80 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-4 bg-slate-900/60">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <Sparkles className="w-5 h-5 text-yellow-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white font-sans">Mav AI</h3>
              <span className="rounded bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-blue-400 border border-blue-500/20 uppercase">
                {role === 'tenant' ? 'Tenant Mode' : 'Landlord Copilot'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Powered by Google Gemini 3.8 Flash</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {role !== 'tenant' && (
            <button
              onClick={() => setShowAuditLogs(!showAuditLogs)}
              className={`p-1.5 rounded-lg text-slate-400 hover:text-white transition ${
                showAuditLogs ? 'bg-slate-800 text-blue-400' : 'hover:bg-slate-800'
              }`}
              title="View AI Action Audit Log"
            >
              <History className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Drawer Body */}
      {showAuditLogs ? (
        /* Audit Log Panel */
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              AI Action Audit Log
            </h4>
            <span className="text-[11px] text-slate-500">{aiAuditLogs.length} events logged</span>
          </div>
          {aiAuditLogs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No financial AI actions executed yet.
            </div>
          ) : (
            aiAuditLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white">{log.actionType}</span>
                  <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400 border border-amber-500/20 uppercase">
                    {log.riskLevel}
                  </span>
                </div>
                <p className="mt-1 text-slate-400 text-[11px]">Prompt: "{log.prompt}"</p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-800 pt-1.5">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" /> Confirmed & Executed
                  </span>
                  <span>{new Date(log.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* Chat Messages */
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-blue-600 text-white rounded-br-none shadow-md shadow-blue-600/20'
                    : 'bg-slate-900 text-slate-200 border border-slate-800 rounded-bl-none shadow-md'
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.text}</div>

                {/* Structured Action Proposal Card */}
                {msg.proposedAction && !msg.actionExecuted && (
                  <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3 text-amber-200">
                    <div className="flex items-center gap-2 font-bold text-amber-300">
                      <ShieldAlert className="w-4 h-4 text-amber-400" />
                      <span>Action Confirmation Required</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-300">
                      {msg.proposedAction.summary}
                    </p>

                    <div className="mt-2 rounded-lg bg-slate-950/70 p-2 text-[10px] font-mono text-slate-300">
                      Risk Level: <strong className="text-amber-400 uppercase">{msg.proposedAction.riskLevel}</strong>
                      <br />
                      Action: {msg.proposedAction.action}
                    </div>

                    <button
                      onClick={() => handleConfirmAction(msg.id, msg.proposedAction!, msg.text)}
                      disabled={actionProcessing}
                      className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400 transition active:scale-95 shadow-md"
                    >
                      {actionProcessing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="w-3.5 h-3.5" />
                      )}
                      <span>Confirm & Apply to Database</span>
                    </button>
                  </div>
                )}
              </div>
              <span className="mt-1 text-[10px] text-slate-500 px-1">{msg.timestamp}</span>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 border border-slate-800">
                <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              </div>
              <span>Mav AI is analyzing portfolio...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Suggested Quick Prompts */}
      {!showAuditLogs && messages.length <= 2 && (
        <div className="px-4 py-2 border-t border-slate-800/50 bg-slate-950">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Suggested Queries
          </p>
          <div className="flex flex-wrap gap-1.5">
            {role === 'tenant'
              ? [
                  'What is my outstanding balance?',
                  'When is my next rent due?',
                  'Show my recent payments',
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(prompt);
                    }}
                    className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  >
                    {prompt}
                  </button>
                ))
              : [
                  'Who is overdue?',
                  'Total rent collected this month?',
                  'Which units are vacant?',
                  'Grace Nakato paid 850,000 today',
                ].map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setInput(prompt);
                    }}
                    className="rounded-lg bg-slate-900 border border-slate-800 px-2.5 py-1 text-[11px] text-slate-300 hover:text-white hover:bg-slate-800 transition"
                  >
                    {prompt}
                  </button>
                ))}
          </div>
        </div>
      )}

      {/* Input Field */}
      <form onSubmit={handleSend} className="border-t border-slate-800/80 p-3 bg-slate-900/50">
        <div className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              role === 'tenant'
                ? 'Ask about your rent, unit or maintenance...'
                : 'Ask about rent, overdue tenants, or record payments...'
            }
            className="w-full rounded-xl bg-slate-950 border border-slate-800 py-2.5 pl-3.5 pr-11 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-1.5 rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 transition"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
};
