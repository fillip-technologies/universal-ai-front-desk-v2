import React, { useEffect, useState } from 'react';
import {
  X,
  Play,
  Pause,
  MapPin,
  Clock,
  ShieldCheck,
  User,
  FileText,
  MessageSquare,
  ExternalLink,
  Printer,
  CheckCircle2,
  Sparkles,
  Send
} from 'lucide-react';
import { GrievanceComplaint, GrievanceStatus, BiharAdminTier, BiharDepartment, RelatedGrievance } from '../types';
import { getComplaintByTrackingId, updateComplaintStatus } from '../services/complaints';
import { NatureNotice } from './NatureBadge';

interface TicketDetailModalProps {
  ticket: GrievanceComplaint | null;
  onClose: () => void;
  onUpdate: (updated: GrievanceComplaint) => void;
}

export const TicketDetailModal: React.FC<TicketDetailModalProps> = ({
  ticket,
  onClose,
  onUpdate
}) => {
  if (!ticket) return null;

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioObj, setAudioObj] = useState<HTMLAudioElement | null>(null);

  const [newStatus, setNewStatus] = useState<GrievanceStatus>(ticket.status);
  const [officerNote, setOfficerNote] = useState('');

  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState('');

  // Sibling tickets filed from the same compound citizen report.
  const [relatedTickets, setRelatedTickets] = useState<RelatedGrievance[]>([]);
  useEffect(() => {
    if (!ticket?.grievance_group_id) {
      setRelatedTickets([]);
      return;
    }
    let cancelled = false;
    getComplaintByTrackingId(ticket.tracking_id).then((full) => {
      if (!cancelled) setRelatedTickets(full?.related ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [ticket?.grievance_group_id, ticket?.tracking_id]);

  const toggleAudio = () => {
    if (!ticket.raw_audio_url) return;
    if (!audioObj) {
      const audio = new Audio(ticket.raw_audio_url);
      audio.onended = () => setIsPlaying(false);
      setAudioObj(audio);
      audio.play();
      setIsPlaying(true);
    } else {
      if (isPlaying) {
        audioObj.pause();
        setIsPlaying(false);
      } else {
        audioObj.play();
        setIsPlaying(true);
      }
    }
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUpdating(true);
    setUpdateError('');
    try {
      const updated = await updateComplaintStatus(ticket.id, newStatus, officerNote);
      setOfficerNote('');
      onUpdate(updated);
    } catch (err: any) {
      setUpdateError(err?.message || 'Failed to save changes.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenGoogleMaps = () => {
    if (ticket.gps_coordinates) {
      window.open(`https://maps.google.com/?q=${ticket.gps_coordinates}`, '_blank');
    }
  };

  const handlePrintOrder = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="card-elevated max-w-4xl w-full rounded-2xl shadow-2xl overflow-hidden my-4 sm:my-8 max-h-[95vh] flex flex-col">
        {/* Modal Header */}
        <div className="brand-gradient text-white p-4 sm:p-6 flex flex-wrap items-center justify-between gap-3 border-b border-(--brand-950) shrink-0">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-900 bg-amber-400 px-2.5 py-0.5 rounded border border-amber-300">
                {ticket.tracking_id}
              </span>
              <span className="text-xs text-blue-200/80 mono">
                Registered: {new Date(ticket.created_at).toLocaleString('en-IN')}
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-bold tracking-tight text-white">Grievance Ticket Detail & Action Plan</h3>
          </div>

          <button
            onClick={onClose}
            className="p-2 min-w-11 min-h-11 flex items-center justify-center hover:bg-blue-800/60 rounded-lg text-slate-300 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>


        <div className="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 overflow-y-auto flex-1 min-h-0">
          {/* Top Status & Tier Badges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase">Assigned Hierarchy Tier</p>
              <p className="text-sm font-extrabold text-amber-800">{ticket.administrative_tier}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase">Department</p>
              <p className="text-sm font-bold text-slate-900">{ticket.assigned_department}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase">Current Workflow Status</p>
              <span
                className={`inline-block px-3 py-0.5 rounded-full text-xs font-bold ${
                  ticket.status === 'Resolved'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {ticket.status}
              </span>
            </div>
          </div>

          {/* Complainant — shown for personal grievances, withheld (by the
              server, not just hidden here) for societal ones. */}
          <NatureNotice complaint={ticket} audience="official" />

          {/* Citizen Audio Voice Note Player if present */}
          {ticket.raw_audio_url && (
            <div className="bg-slate-900 text-white p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={toggleAudio}
                  className="w-12 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center justify-center transition-colors shadow-lg shrink-0"
                >
                  {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                </button>
                <div>
                  <p className="text-xs font-bold text-white">Citizen Voice Note Recording</p>
                  <p className="text-[11px] text-slate-400">Dialect Detected: {ticket.detected_language}</p>
                </div>
              </div>

              <span className="text-xs font-mono text-emerald-400 bg-emerald-950 px-3 py-1 rounded-full border border-emerald-800 self-start sm:self-auto">
                Audio Recording Available
              </span>
            </div>
          )}

          {/* Original Dialect Text & Translated English Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase block">
                Original Citizen Text / Audio Transcript
              </span>
              {ticket.identity_withheld && !ticket.original_text ? (
                <p className="text-xs text-slate-500 leading-relaxed">
                  Withheld for a societal grievance — the citizen's own words can identify them. Work
                  from the anonymised AI summary.
                </p>
              ) : (
                <p className="text-sm text-slate-800 font-medium italic leading-relaxed">
                  "{ticket.original_text || 'Voice Audio Complaint'}"
                </p>
              )}
            </div>

            <div className="bg-slate-900 text-white p-5 rounded-2xl space-y-2">
              <span className="text-xs font-bold text-amber-400 uppercase flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>AI English Translation (Gemini Engine)</span>
              </span>
              <p className="text-sm text-slate-200 font-medium leading-relaxed">
                "{ticket.translated_summary}"
              </p>
            </div>
          </div>

          {/* Linked grievances from the same compound citizen report */}
          {ticket.grievance_group_id && (
            <div className="bg-indigo-50 border border-indigo-200 p-5 rounded-2xl space-y-2">
              <span className="text-xs font-bold text-indigo-700 uppercase block">
                Related grievances from the same report
                {ticket.grievance_part_index && ticket.grievance_part_count
                  ? ` — this is ${ticket.grievance_part_index} of ${ticket.grievance_part_count}`
                  : ''}
              </span>
              {relatedTickets.length === 0 ? (
                <p className="text-xs text-indigo-500">No sibling tickets found.</p>
              ) : (
                <ul className="divide-y divide-indigo-100">
                  {relatedTickets.map((rel) => (
                    <li key={rel.tracking_id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                      <span className="font-mono font-bold text-indigo-800">{rel.tracking_id}</span>
                      <span className="text-indigo-300">·</span>
                      <span className="font-semibold text-slate-700">{rel.assigned_department}</span>
                      <span className="text-indigo-300">·</span>
                      <span className="text-slate-500">{rel.status}</span>
                      <span className="text-indigo-300">·</span>
                      <span className="text-slate-500">Priority {rel.priority_score}/5</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-indigo-500">
                Each sibling is handled independently by its own department and escalation ladder.
              </p>
            </div>
          )}

          {/* AI Intelligence Rationale & Action Step */}
          <div className="bg-emerald-950 text-emerald-100 p-6 rounded-2xl space-y-4 border border-emerald-800">
            <div>
              <h4 className="text-xs font-bold uppercase text-amber-300">
                Priority Score {ticket.priority_score} / 5 • Urgency Rationale
              </h4>
              <p className="text-xs text-slate-300 mt-1">{ticket.urgency_rationale}</p>
            </div>

            <div className="pt-3 border-t border-emerald-800/80">
              <h4 className="text-xs font-bold uppercase text-emerald-300">
                Recommended Action Step (Statutory Guidelines)
              </h4>
              <p className="text-sm font-semibold text-white mt-1">{ticket.recommended_action_step}</p>
            </div>
          </div>

          {/* Location & GPS Map */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex items-center space-x-3">
              <MapPin className="w-5 h-5 text-emerald-600" />
              <div>
                <p className="text-xs font-bold text-slate-900">{ticket.landmark_or_location}</p>
                <p className="text-xs text-slate-500 font-mono">GPS: {ticket.gps_coordinates}</p>
              </div>
            </div>

            <button
              onClick={handleOpenGoogleMaps}
              className="w-full sm:w-auto px-4 py-2.5 min-h-11 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300 flex items-center justify-center space-x-1.5 shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
              <span>Open on Google Maps</span>
            </button>
          </div>

          {/* Update Workflow Status Form */}
          <form onSubmit={handleSaveChanges} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-6">
            <h4 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>Update Administrative Status & Action Remarks</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Update Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as GrievanceStatus)}
                  className="w-full rounded-xl border border-slate-300 p-2.5 text-xs font-bold focus:ring-2 focus:ring-amber-500 outline-none"
                >
                  <option value="Submitted">Submitted (दर्ज)</option>
                  <option value="Under Review">Under Review (समीक्षाधीन)</option>
                  <option value="Hearing Scheduled">Hearing Scheduled (सुनवाई)</option>
                  <option value="In Progress">In Progress (कार्रवाई जारी)</option>
                  <option value="Resolved">Resolved (निवारित)</option>
                  <option value="Rejected (with reasons)">Rejected with reasons (§5(5))</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Acting Officer</label>
                <input
                  type="text"
                  value={ticket.assigned_officer || 'Assigned on first action'}
                  disabled
                  className="w-full rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-xs text-slate-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">Official Remark / Inspection Note</label>
              <textarea
                value={officerNote}
                onChange={(e) => setOfficerNote(e.target.value)}
                rows={3}
                placeholder="e.g. Inspected site with Junior Engineer. Emergency repair crew dispatched..."
                className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:ring-2 focus:ring-amber-500 outline-none"
              ></textarea>
            </div>

            {updateError && <p className="text-xs text-rose-600 font-semibold">{updateError}</p>}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4">
              <button
                type="button"
                onClick={handlePrintOrder}
                className="px-4 py-2.5 min-h-11 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-300 flex items-center justify-center space-x-2"
              >
                <Printer className="w-4 h-4" />
                <span>Print Official Notice</span>
              </button>

              <button
                type="submit"
                disabled={isUpdating}
                className="px-6 py-2.5 min-h-11 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold shadow-md transition-colors flex items-center justify-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>Save Status & Log Remark</span>
              </button>
            </div>
          </form>

          {/* Auto-escalation audit trail — rows from the escalation_events
              table, written by the backend job. Absent when the grievance has
              never been escalated. */}
          {ticket.escalation_events && ticket.escalation_events.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Auto-Escalation Trail
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {[...ticket.escalation_events].reverse().map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs space-y-1"
                  >
                    <div className="flex flex-wrap items-center gap-1.5 font-bold text-rose-900">
                      <span className="text-[10px] bg-rose-200 px-1.5 py-0.5 rounded uppercase tracking-wide">
                        L{ev.from_index + 1} → L{ev.to_index + 1}
                      </span>
                      <span>{ev.from_officer}</span>
                      <span className="text-rose-400">→</span>
                      <span>{ev.to_officer}</span>
                    </div>
                    <p className="text-rose-800">{ev.reason}</p>
                    <p className="text-[10px] text-rose-500 mono">
                      {new Date(ev.created_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historical Official Action Log */}
          {ticket.official_notes && ticket.official_notes.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Official Action History
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {ticket.official_notes.map((note, idx) => (
                  <div key={idx} className="bg-slate-900 text-white p-3 rounded-xl text-xs font-mono">
                    {note}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
