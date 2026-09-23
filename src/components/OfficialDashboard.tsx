import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  Clock,
  CheckCircle2,
  FileText,
  User,
  MapPin,
  SlidersHorizontal,
  Layers,
  Activity,
  AlertCircle,
  RefreshCw
} from 'lucide-react';
import {
  GrievanceComplaint,
  GrievanceFilterState,
  OfficialUser,
  BIHAR_DEPARTMENTS,
  needsAttention,
  workingDaysRemaining,
  currentLadderIndex,
  currentLadderStep,
  getEscalationLadder
} from '../types';
import { listComplaints } from '../services/complaints';
import { NatureBadge } from './NatureBadge';

interface OfficialDashboardProps {
  currentUser: OfficialUser | null;
  onSelectTicket: (ticket: GrievanceComplaint) => void;
  onOpenAuthModal: () => void;
  refreshKey?: number;
}

export const OfficialDashboard: React.FC<OfficialDashboardProps> = ({
  currentUser,
  onSelectTicket,
  onOpenAuthModal,
  refreshKey
}) => {
  const [complaints, setComplaints] = useState<GrievanceComplaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [filters, setFilters] = useState<GrievanceFilterState>({
    searchQuery: '',
    tier: 'All',
    department: 'All',
    status: 'All',
    priority: 'All',
    district: 'All'
  });

  const reload = async () => {
    if (!currentUser) return;
    setLoading(true);
    setLoadError('');
    try {
      const data = await listComplaints();
      setComplaints(data);
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load the live grievance feed.');
    } finally {
      setLoading(false);
    }
  };

  // Fetch on mount, on login, and whenever the parent bumps refreshKey
  // (e.g. after an official updates a ticket's status elsewhere).
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, refreshKey]);

  // Filter complaints
  const filteredComplaints = complaints.filter((c) => {
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase();
      const matchTracking = c.tracking_id.toLowerCase().includes(q);
      const matchSummary = c.translated_summary.toLowerCase().includes(q);
      const matchLocation = c.landmark_or_location.toLowerCase().includes(q);
      const matchName = (c.citizen_name || '').toLowerCase().includes(q);
      if (!matchTracking && !matchSummary && !matchLocation && !matchName) return false;
    }

    if (filters.tier !== 'All' && c.administrative_tier !== filters.tier) return false;
    if (filters.department !== 'All' && c.assigned_department !== filters.department) return false;
    if (filters.status !== 'All' && c.status !== filters.status) return false;
    if (filters.priority !== 'All' && c.priority_score.toString() !== filters.priority) return false;
    if (filters.district !== 'All' && c.district !== filters.district) return false;

    return true;
  });

  // KPI Calculations
  const totalCount = complaints.length;
  const criticalCount = complaints.filter((c) => c.priority_score >= 4).length;
  const pendingCount = complaints.filter((c) => c.status !== 'Resolved').length;
  const resolvedCount = complaints.filter((c) => c.status === 'Resolved').length;
  // Internal early-warning (NOT statutory): >48h with no officer action
  const attention48hCount = complaints.filter(needsAttention).length;
  // Matters escalated beyond PGRO via citizen appeal (§7)
  const escalatedCount = complaints.filter(
    (c) => c.escalation_level && c.escalation_level !== 'PGRO'
  ).length;

  if (!currentUser) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl brand-gradient text-amber-400 flex items-center justify-center shadow-md">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-900">Official Login Required</h2>
          <p className="text-sm text-slate-500">
            This dashboard shows live citizen grievance data and is restricted to authenticated
            state government officials. Sign in or register with your official credentials to continue.
          </p>
        </div>
        <button
          onClick={onOpenAuthModal}
          className="px-6 py-3 min-h-12 rounded-xl bg-(--brand-900) hover:bg-(--brand-800) text-white text-sm font-bold shadow-md transition-colors"
        >
          Officer Login / Sign Up
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {currentUser.verified === false && (
        <div className="bg-rose-50 border border-rose-300 rounded-xl p-4 flex items-start space-x-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-800">
            <p className="font-black uppercase tracking-wide">Self-Registered — Pending HQ Verification</p>
            <p className="mt-0.5">
              This account was created without an official .gov.in / @nic.in email address.
              Grievances you act on here are recorded normally, but a role at this tier carries
              statutory authority only once HQ approves the account from the Admin Dashboard.
            </p>
          </div>
        </div>
      )}

      {/* Officer Welcome & Context Banner */}
      <div className="brand-gradient rounded-2xl p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded uppercase tracking-wider mono">
              OFFICIAL DASHBOARD
            </span>
            <span className="text-xs text-blue-200/90 mono">
              State Right to Public Grievance Redressal Engine
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white wrap-break-word">
            {currentUser.name}
          </h2>
          <p className="text-xs text-blue-100/80">
            Designation: <span className="text-amber-300 font-semibold">{currentUser.designation}</span> • Jurisdiction: <span className="text-emerald-300 font-semibold">{currentUser.district || 'All Districts'}</span>
          </p>
        </div>
      </div>

      {/* KPI Metric Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Complaints */}
        <div className="card-elevated p-4 sm:p-5 space-y-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Received</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-800 mono">{totalCount}</p>
          <p className="text-[11px] text-slate-400">Registered across the state</p>
        </div>

        {/* 48h Internal Early-Warning */}
        <div className="card-elevated p-4 sm:p-5 space-y-1 border-l-4 border-l-rose-600">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">⚡ 48h Flag (Internal)</p>
          <p className="text-2xl sm:text-3xl font-bold text-rose-600 mono">{attention48hCount}</p>
          <p className="text-[11px] text-rose-600/80 font-medium">No officer action in 48h — early warning</p>
        </div>

        {/* Critical Urgency */}
        <div className="card-elevated p-4 sm:p-5 space-y-1 border-l-4 border-l-red-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Critical (Score 4-5)</p>
          <p className="text-2xl sm:text-3xl font-bold text-red-600 mono">{criticalCount}</p>
          <p className="text-[11px] text-red-600/80 font-medium">Life/safety or major service failure</p>
        </div>

        {/* Escalated via Appeal */}
        <div className="card-elevated p-4 sm:p-5 space-y-1 border-l-4 border-l-amber-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">In Appeal (§7)</p>
          <p className="text-2xl sm:text-3xl font-bold text-amber-600 mono">{escalatedCount}</p>
          <p className="text-[11px] text-amber-700/80 font-medium">Before First/Second Appellate Authority</p>
        </div>

        {/* Resolved */}
        <div className="card-elevated p-4 sm:p-5 space-y-1 border-b-4 border-b-emerald-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Resolved (§5(5))</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-800 mono">{resolvedCount}</p>
          <p className="text-[11px] text-emerald-700 font-medium">
            {totalCount > 0 ? `${Math.round((resolvedCount / totalCount) * 100)}% within 60-working-day limit` : '—'}
          </p>
        </div>
      </div>

      {/* Filter Toolbar & Search */}
      <div className="card-elevated p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <SlidersHorizontal className="w-4 h-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-slate-800">Live Administrative Feed Controls</h3>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={filters.searchQuery}
              onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
              placeholder="Filter by Tracking ID, citizen, location..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none mono"
            />
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Tier Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Administrative Tier</label>
            <select
              value={filters.tier}
              onChange={(e) => setFilters({ ...filters, tier: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="All">All Tiers (सभी स्तर)</option>
              <option value="Gram Panchayat">Gram Panchayat (पंचायत)</option>
              <option value="Block Level (BDO)">Block Level (BDO)</option>
              <option value="Sub-Division (SDO)">Sub-Division (SDO)</option>
              <option value="District Level (DM)">District Level (DM)</option>
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Department</label>
            <select
              value={filters.department}
              onChange={(e) => setFilters({ ...filters, department: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="All">All Departments ({BIHAR_DEPARTMENTS.length})</option>
              {BIHAR_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="All">All Statuses</option>
              <option value="Submitted">Submitted (दर्ज)</option>
              <option value="Under Review">Under Review (समीक्षाधीन)</option>
              <option value="Hearing Scheduled">Hearing Scheduled (सुनवाई)</option>
              <option value="In Progress">In Progress (प्रगति पर)</option>
              <option value="Resolved">Resolved (निवारित)</option>
              <option value="Rejected (with reasons)">Rejected with reasons (§5(5))</option>
            </select>
          </div>

          {/* Priority Score Filter */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Priority Level</label>
            <select
              value={filters.priority}
              onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs font-medium focus:ring-1 focus:ring-blue-500 outline-none"
            >
              <option value="All">All Priorities</option>
              <option value="5">Score 5 (Critical Emergency)</option>
              <option value="4">Score 4 (High Urgency)</option>
              <option value="3">Score 3 (Medium Delay)</option>
              <option value="2">Score 2 (Low Priority)</option>
              <option value="1">Score 1 (Minor)</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div className="flex items-end">
            <button
              onClick={() =>
                setFilters({
                  searchQuery: '',
                  tier: 'All',
                  department: 'All',
                  status: 'All',
                  priority: 'All',
                  district: 'All'
                })
              }
              className="w-full py-2 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors border border-slate-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Live Administrative Feed Table / Card Container */}
      <div className="card-elevated flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-semibold text-slate-800 text-sm">Live Administrative Feed ({filteredComplaints.length})</h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mono">
              Sorted by Statutory Urgency
            </span>
            <button
              onClick={reload}
              title="Refresh"
              className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loadError && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 text-xs font-semibold text-rose-800">
            {loadError}
          </div>
        )}

        {loading && complaints.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading live grievance feed…</div>
        ) : filteredComplaints.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <FileText className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-800">No grievances match the current filter criteria.</p>
            <p className="text-xs text-slate-400">Try clearing your search query or dropdown selections.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-y border-slate-100">
                <tr className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  <th className="px-4 py-3">Ticket ID</th>
                  <th className="px-4 py-3">AI Short Summary</th>
                  <th className="px-4 py-3">Escalation Level</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-center">Statutory Clock</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Priority</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-100">
                {filteredComplaints.map((ticket) => {
                  const isCrit = ticket.priority_score >= 4;
                  const flagged = needsAttention(ticket);
                  const daysLeft = workingDaysRemaining(ticket);
                  const escalated = ticket.escalation_level && ticket.escalation_level !== 'PGRO';
                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => onSelectTicket(ticket)}
                      className={`hover:bg-blue-50/50 cursor-pointer transition-colors ${
                        flagged ? 'bg-rose-50/40' : isCrit ? 'bg-red-50/20' : ''
                      }`}
                    >
                      {/* Ticket ID */}
                      <td className="px-4 py-3.5 font-bold text-slate-900 mono whitespace-nowrap">
                        {ticket.tracking_id}
                        <div className="text-[10px] text-slate-400 font-sans font-normal mt-0.5">
                          Language: {ticket.detected_language}
                        </div>
                        <div className="mt-1 font-sans">
                          <NatureBadge nature={ticket.complaint_nature} />
                        </div>
                        {ticket.jurisdiction_check === 'RTPS_EXCLUDED' && (
                          <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase">
                            RTPS §2(a)
                          </span>
                        )}
                        {ticket.grievance_part_count && ticket.grievance_part_count > 1 && (
                          <span
                            className="inline-block mt-1 px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-black uppercase"
                            title="Filed together with sibling tickets from one compound report"
                          >
                            🔗 linked {ticket.grievance_part_index}/{ticket.grievance_part_count}
                          </span>
                        )}
                      </td>

                      {/* Subject & Summary */}
                      <td className="px-4 py-3.5 max-w-md">
                        <p className="font-semibold text-slate-800 line-clamp-1">
                          "{ticket.translated_summary}"
                        </p>
                        <p className="text-[10px] text-slate-400 flex items-center space-x-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{ticket.landmark_or_location}</span>
                        </p>
                      </td>

                      {/* Current holder on the department escalation ladder */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {(() => {
                          const ladderIdx = currentLadderIndex(ticket);
                          const ladderLen = (
                            ticket.escalation_ladder ||
                            getEscalationLadder(ticket.assigned_department)
                          ).length;
                          // Anything above the foot of the ladder got there via
                          // the backend escalation job, which also logged an
                          // escalation_events row and a note.
                          const autoEscalated = ladderIdx > 0;
                          return (
                            <>
                              <span
                                className={`px-2 py-1 rounded text-[11px] font-bold ${
                                  ladderIdx >= ladderLen - 2
                                    ? 'bg-rose-100 text-rose-800'
                                    : ladderIdx > 0
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                L{ladderIdx + 1}: {currentLadderStep(ticket)}
                              </span>
                              <div className="text-[10px] text-slate-400 italic mt-0.5">
                                {autoEscalated && (
                                  <span className="text-rose-600 font-bold not-italic">⚡ auto-escalated · </span>
                                )}
                                {escalated ? `${ticket.escalation_level} (§7 appeal)` : ticket.administrative_tier}
                              </div>
                            </>
                          );
                        })()}
                      </td>

                      {/* Department */}
                      <td className="px-4 py-3.5 whitespace-nowrap font-medium text-slate-700">
                        {ticket.assigned_department}
                      </td>

                      {/* Statutory 60-working-day clock + 48h internal flag */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {ticket.status === 'Resolved' ? (
                          <span className="text-[10px] font-bold text-emerald-700">Closed in time</span>
                        ) : (
                          <div>
                            <span
                              className={`text-[11px] font-black mono ${
                                daysLeft <= 10 ? 'text-rose-600' : 'text-slate-700'
                              }`}
                            >
                              {daysLeft}/60 wd left
                            </span>
                            {flagged && (
                              <div className="mt-0.5">
                                <span className="inline-block px-1.5 py-0.5 rounded bg-rose-600 text-white text-[9px] font-black uppercase animate-pulse">
                                  ⚡ 48h+ no action
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                            ticket.status === 'Resolved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ticket.status === 'In Progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {ticket.status}
                        </span>
                      </td>

                      {/* Priority Badge */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <span
                          className={`priority-badge ${
                            ticket.priority_score >= 4
                              ? 'priority-5'
                              : ticket.priority_score >= 3
                              ? 'priority-3'
                              : 'priority-1'
                          }`}
                        >
                          {ticket.priority_score >= 4
                            ? `${ticket.priority_score} - CRIT`
                            : ticket.priority_score >= 3
                            ? `${ticket.priority_score} - MOD`
                            : `${ticket.priority_score} - LOW`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

