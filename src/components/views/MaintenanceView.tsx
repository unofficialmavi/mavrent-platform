import React, { useEffect, useState } from 'react';
import {
  Wrench,
  Plus,
  Clock,
  CheckCircle2,
  AlertTriangle,
  User,
  Phone,
  Image,
  MessageSquare,
  Filter,
} from 'lucide-react';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  MaintenanceRequest,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
} from '../../types';

export const MaintenanceView: React.FC = () => {
  const { role, currentUser } = useAuth();
  const {
    properties,
    tenants,
    maintenanceRequests,
    createMaintenanceRequest,
    updateMaintenanceStatus,
  } = useProperty();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<MaintenanceRequest | null>(null);
  const [ticketError, setTicketError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // New Ticket Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MaintenanceCategory>('plumbing');
  const [priority, setPriority] = useState<MaintenancePriority>('medium');
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [resolvedMedia, setResolvedMedia] = useState<Record<string, string>>({});

  // Landlord action state
  const [workerName, setWorkerName] = useState('');
  const [landlordNotes, setLandlordNotes] = useState('');

  const isTenant = role === 'tenant';
  const myTenant = tenants.find((t) => t.userId === currentUser?.id);
  const landlordSelectedTenant = tenants.find((t) => t.id === selectedTenantId);
  const targetTenantForView = isTenant ? myTenant : landlordSelectedTenant;

  useEffect(() => {
    if (!selectedTenantId && tenants.length > 0 && !isTenant) setSelectedTenantId(tenants[0].id);
  }, [tenants, selectedTenantId, isTenant]);

  useEffect(() => {
    let cancelled = false;
    async function resolveAttachments() {
      if (!supabase) return;
      const entries = maintenanceRequests.flatMap((ticket) => ticket.mediaUrls || []);
      const unique = [...new Set(entries)];
      const resolved: Record<string, string> = {};
      for (const path of unique) {
        if (/^https?:\/\//i.test(path)) {
          resolved[path] = path;
          continue;
        }
        const { data, error } = await supabase.storage.from('maintenance-media').createSignedUrl(path, 60 * 60);
        if (!error && data?.signedUrl) resolved[path] = data.signedUrl;
      }
      if (!cancelled) setResolvedMedia((previous) => ({ ...previous, ...resolved }));
    }
    void resolveAttachments();
    return () => { cancelled = true; };
  }, [maintenanceRequests]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTicketError('');
    if (!title || !description) {
      setTicketError('Please provide both ticket title and description.');
      return;
    }

    const targetTenant = isTenant ? myTenant : landlordSelectedTenant;
    if (!targetTenant) {
      setTicketError(isTenant
        ? 'Your tenant account is not linked to an active lease yet. Please contact your property manager.'
        : 'Choose the tenant and unit this maintenance report belongs to.');
      return;
    }
    if (mediaFiles.length > 5) {
      setTicketError('You can attach up to 5 photos or videos per report.');
      return;
    }
    const oversized = mediaFiles.find((file) => file.size > 50 * 1024 * 1024);
    if (oversized) {
      setTicketError('Each attachment must be 50 MB or smaller.');
      return;
    }

    setSubmitting(true);
    try {
      if (!supabase || !currentUser) throw new Error('Please sign in again before uploading attachments.');
      const uploadedPaths: string[] = [];
      for (const file of mediaFiles) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          throw new Error('Only image and video attachments are supported.');
        }
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const objectPath = `${targetTenant.propertyId}/${currentUser.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from('maintenance-media')
          .upload(objectPath, file, { contentType: file.type, upsert: false });
        if (uploadError) throw new Error(`Attachment upload failed: ${uploadError.message}`);
        uploadedPaths.push(objectPath);
      }

      await createMaintenanceRequest({
        propertyId: targetTenant.propertyId,
        unitId: targetTenant.unitId,
        tenantId: targetTenant.id,
        title,
        description,
        category,
        priority,
        mediaUrls: uploadedPaths,
      });

      setShowSubmitModal(false);
      setTitle('');
      setDescription('');
      setMediaFiles([]);
    } catch (err: any) {
      setTicketError(err?.message || 'Unable to submit maintenance ticket. Please check connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (status: MaintenanceStatus) => {
    if (!selectedTicket) return;
    setSubmitting(true);
    try {
      await updateMaintenanceStatus(
        selectedTicket.id,
        status,
        landlordNotes || undefined,
        workerName || undefined
      );
      setSelectedTicket(null);
      setWorkerName('');
      setLandlordNotes('');
    } catch (err: any) {
      setTicketError(err?.message || 'Failed to update ticket status.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredTickets = maintenanceRequests.filter((ticket) => {
    if (isTenant && ticket.tenantId !== myTenant?.id) return false;
    if (statusFilter !== 'all' && ticket.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Maintenance & Repairs
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {isTenant
              ? 'Report maintenance issues with your room and track repair worker dispatch.'
              : 'Triage repair tickets, assign technical contractors, and track resolution.'}
          </p>
        </div>

        <button
          onClick={() => setShowSubmitModal(true)}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-md shadow-blue-600/20 hover:bg-blue-500 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Repair Ticket</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs font-medium overflow-x-auto">
        {['all', 'pending', 'acknowledged', 'in_progress', 'completed'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-1 rounded-md capitalize whitespace-nowrap transition ${
              statusFilter === status ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Tickets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTickets.map((ticket) => {
          const prop = properties.find((p) => p.id === ticket.propertyId);
          const unit = prop?.units?.find((u) => u.id === ticket.unitId);
          const tenant = tenants.find((t) => t.id === ticket.tenantId);

          return (
            <div
              key={ticket.id}
              onClick={() => {
                if (!isTenant) {
                  setSelectedTicket(ticket);
                  setWorkerName(ticket.assignedWorker || '');
                  setLandlordNotes(ticket.landlordNotes || '');
                }
              }}
              className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-xl transition ${
                !isTenant ? 'cursor-pointer hover:border-slate-700' : ''
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-white leading-snug">{ticket.title}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {unit?.unitNumber} • {prop?.name}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                    ticket.status === 'pending'
                      ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      : ticket.status === 'in_progress'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                      : ticket.status === 'completed'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                  }`}
                >
                  {ticket.status.replace('_', ' ')}
                </span>
              </div>

              <p className="mt-3 text-xs text-slate-300 leading-relaxed">{ticket.description}</p>

              {/* Private maintenance attachments are served with short-lived signed URLs. */}
              {ticket.mediaUrls.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {ticket.mediaUrls.slice(0, 4).map((path) => {
                    const src = resolvedMedia[path];
                    const isVideo = /\.(mp4|mov|webm|m4v)(?:$|\?)/i.test(path);
                    return (
                      <div key={path} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
                        {src ? (isVideo
                          ? <video src={src} controls preload="metadata" className="h-28 w-full object-cover" />
                          : <a href={src} target="_blank" rel="noreferrer"><img src={src} alt="Maintenance issue attachment" loading="lazy" className="h-28 w-full object-cover" /></a>)
                          : <div className="flex h-28 items-center justify-center px-2 text-center text-[10px] text-slate-500">Private attachment loading…</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Badges */}
              <div className="mt-4 flex flex-wrap items-center gap-1.5 text-[10px]">
                <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300 uppercase">
                  {ticket.category}
                </span>
                <span
                  className={`rounded px-2 py-0.5 font-bold uppercase ${
                    ticket.priority === 'urgent' || ticket.priority === 'high'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  Priority: {ticket.priority}
                </span>
              </div>

              {/* Assigned worker note */}
              {ticket.assignedWorker && (
                <div className="mt-3 rounded-lg bg-slate-950 p-2 text-[11px] text-slate-300 flex items-center gap-2 border border-slate-800/80">
                  <Wrench className="w-3.5 h-3.5 text-blue-400" />
                  <span>Technician: {ticket.assignedWorker}</span>
                </div>
              )}

              {/* Landlord triage prompt */}
              {!isTenant && (
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-blue-400 font-semibold">
                  <span>Click to update status & technician</span>
                  <span>→</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* New Maintenance Ticket Modal */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 overflow-y-auto">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100 my-8">
            <h3 className="text-base font-bold text-white">Report Maintenance Issue</h3>
            <p className="text-xs text-slate-400 mt-1">Submit technical issue for repair</p>

            {ticketError && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-950/20 px-3 py-2 text-xs text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{ticketError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Issue Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Leaking bathroom pipe"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white capitalize"
                  >
                    <option value="plumbing">Plumbing</option>
                    <option value="electrical">Electrical</option>
                    <option value="structural">Structural</option>
                    <option value="appliance">Appliance</option>
                    <option value="painting">Painting</option>
                    <option value="cleaning">Cleaning</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as MaintenancePriority)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white capitalize"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Detailed Description</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Describe when it started and exact symptoms..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              {!isTenant && (
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Tenant / Unit</label>
                  <select value={selectedTenantId} onChange={(e) => setSelectedTenantId(e.target.value)} required className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white">
                    <option value="">Choose tenant</option>
                    {tenants.filter((t) => t.status === 'active').map((t) => (
                      <option key={t.id} value={t.id}>{t.fullName} · {t.tenantCode}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Photos or videos (Optional)</label>
                <div className="grid grid-cols-3 gap-2">
                  <label className="cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-2 py-2.5 text-center text-[10px] font-bold text-slate-200 hover:border-blue-500">
                    Take photo
                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); setMediaFiles((prev) => [...prev, ...files].slice(0, 5)); e.currentTarget.value = ''; }} />
                  </label>
                  <label className="cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-2 py-2.5 text-center text-[10px] font-bold text-slate-200 hover:border-blue-500">
                    Record video
                    <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); setMediaFiles((prev) => [...prev, ...files].slice(0, 5)); e.currentTarget.value = ''; }} />
                  </label>
                  <label className="cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-2 py-2.5 text-center text-[10px] font-bold text-slate-200 hover:border-blue-500">
                    Choose files
                    <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { const files = Array.from(e.target.files || []); setMediaFiles((prev) => [...prev, ...files].slice(0, 5)); e.currentTarget.value = ''; }} />
                  </label>
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-slate-500">Attach up to 5 photos or videos, 50 MB each. Attachments are stored privately and shared only with authorized users for this property.</p>
                {mediaFiles.length > 0 && <ul className="mt-2 space-y-1 text-[10px] text-slate-300">{mediaFiles.map((file, index) => <li key={file.name + file.size + index} className="flex items-center justify-between gap-2"><span className="truncate">• {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB</span><button type="button" onClick={() => setMediaFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))} className="shrink-0 text-rose-300 hover:text-rose-200">Remove</button></li>)}</ul>}
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-500 disabled:opacity-50 transition flex items-center gap-1.5"
                >
                  {submitting ? 'Submitting to Supabase...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Landlord Triage & Contractor Assignment Modal */}
      {selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-100">
            <h3 className="text-base font-bold text-white">Manage Maintenance Ticket</h3>
            <p className="text-xs text-slate-400 mt-1">{selectedTicket.title}</p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Assign Contractor / Worker
                </label>
                <input
                  type="text"
                  placeholder="e.g. John K. Electrician (+256 701 223 344)"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Landlord Internal Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Replaced breaker switch on 07 Oct."
                  value={landlordNotes}
                  onChange={(e) => setLandlordNotes(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-white"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-2">
                <p className="text-slate-400 text-[11px] font-semibold">Update Ticket Status:</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleUpdateStatus('acknowledged')}
                    className="rounded-lg bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    Acknowledge
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('in_progress')}
                    className="rounded-lg bg-amber-600/30 border border-amber-500/40 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-600/40"
                  >
                    Mark In Progress
                  </button>
                  <button
                    onClick={() => handleUpdateStatus('completed')}
                    className="rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500 col-span-2 shadow-md shadow-emerald-600/20"
                  >
                    Mark Completed & Close
                  </button>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Close without changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
