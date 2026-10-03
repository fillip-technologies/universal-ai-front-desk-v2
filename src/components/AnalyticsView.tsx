import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  PieChart,
  Layers,
  ShieldCheck,
  CheckCircle2,
  Award,
  Clock,
  AlertTriangle,
  Landmark,
  Scale,
  Gavel,
  ShieldAlert,
  Hourglass
} from 'lucide-react';
import { listCmoComplaints } from '../services/complaints';
import { needsAttention, ESCALATION_CHAIN, GrievanceComplaint, CmoUser } from '../types';
import { PhotoBanner, PhotoGate } from './jansunwayi-ui';
import { STORY_IMAGES } from '../data/storyImages';

interface AnalyticsViewProps {
  /** The CMO Monitor has its own login, separate from officials. */
  currentUser: CmoUser | null;
  onOpenAuthModal: () => void;
}

/**
 * CMO Command Centre — master monitoring dashboard for the Chief Minister's
 * Office. Watches the whole state: registrations, resolutions, statutory
 * compliance (60-working-day statutory limit), internal 48h early-warnings, and
 * escalations through the §3 appellate chain.
 *
 * Restricted to approved CMO Monitor accounts — a separate login from the
 * Official Dashboard. The data comes from /api/cmo/complaints, which refuses
 * official, citizen and unapproved CMO tokens.
 */
export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ currentUser, onOpenAuthModal }) => {
  const [complaints, setComplaints] = useState<GrievanceComplaint[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!currentUser?.approved) return;
    setLoading(true);
    setLoadError('');
    listCmoComplaints()
      .then(setComplaints)
      .catch((e) => setLoadError(e?.message || 'Failed to load statewide data.'))
      .finally(() => setLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <PhotoGate
        image={STORY_IMAGES.handsRaised}
        captionHindi="पूरे राज्य की आवाज़, एक नज़र में।"
        caption="The voice of the whole state, in one view."
      >
        <div className="w-16 h-16 mx-auto md:mx-0 rounded-2xl brand-gradient text-amber-400 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-900">CMO Monitor Login Required</h2>
          <p className="text-sm text-slate-500">
            The CMO Command Centre aggregates grievance data statewide. It has its own login, separate
            from the Official Dashboard, and new accounts are approved by the system administrator.
          </p>
        </div>
        <button
          onClick={onOpenAuthModal}
          className="self-center md:self-start px-6 py-3 min-h-12 rounded-xl bg-(--brand-900) hover:bg-(--brand-800) text-white text-sm font-bold shadow-md"
        >
          CMO Login / Request Access
        </button>
      </PhotoGate>
    );
  }

  if (!currentUser.approved) {
    return (
      <PhotoGate
        image={STORY_IMAGES.handsRaised}
        captionHindi="पूरे राज्य की आवाज़, एक नज़र में।"
        caption="The voice of the whole state, in one view."
      >
        <div className="w-16 h-16 mx-auto md:mx-0 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Hourglass className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-slate-900">Awaiting Approval</h2>
          <p className="text-sm text-slate-500">
            Your CMO Monitor account ({currentUser.email}) has been created. The system administrator
            must approve it before statewide data is shown. Reload this page once you have been approved.
          </p>
        </div>
      </PhotoGate>
    );
  }

  if (loadError) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-rose-600 text-sm font-semibold">{loadError}</div>;
  }

  if (loading && complaints.length === 0) {
    return <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-400 text-sm">Loading statewide data…</div>;
  }

  const total = complaints.length || 1;
  const totalCount = complaints.length;
  const resolved = complaints.filter((c) => c.status === 'Resolved').length;
  const pending = totalCount - resolved;
  const flagged48h = complaints.filter(needsAttention).length;
  const inAppeal = complaints.filter(
    (c) => c.escalation_level && c.escalation_level !== 'PGRO'
  ).length;
  const rtpsRedirected = complaints.filter((c) => c.jurisdiction_check === 'RTPS_EXCLUDED').length;
  const personalCount = complaints.filter((c) => c.complaint_nature === 'PERSONAL').length;
  const societalCount = complaints.filter((c) => c.complaint_nature === 'SOCIETAL').length;
  const resolutionRate = Math.round((resolved / total) * 100);

  // Aggregations
  const byDistrict: Record<string, { total: number; resolved: number; flagged: number }> = {};
  const byDept: Record<string, number> = {};
  const byLang: Record<string, number> = {};
  const byEscalation: Record<string, number> = {};

  complaints.forEach((c) => {
    byDistrict[c.district] = byDistrict[c.district] || { total: 0, resolved: 0, flagged: 0 };
    byDistrict[c.district].total += 1;
    if (c.status === 'Resolved') byDistrict[c.district].resolved += 1;
    if (needsAttention(c)) byDistrict[c.district].flagged += 1;

    byDept[c.assigned_department] = (byDept[c.assigned_department] || 0) + 1;
    byLang[c.detected_language] = (byLang[c.detected_language] || 0) + 1;
    const lvl = c.escalation_level || 'PGRO';
    byEscalation[lvl] = (byEscalation[lvl] || 0) + 1;
  });

  const sortedDepts = Object.entries(byDept).sort((a, b) => b[1] - a[1]);
  const sortedDistricts = Object.entries(byDistrict).sort((a, b) => b[1].total - a[1].total);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Banner */}
      <PhotoBanner image={STORY_IMAGES.handsRaised}>
        <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bg-amber-400 text-slate-950 text-[10px] font-black px-2.5 py-0.5 rounded uppercase tracking-wider mono">
            CMO COMMAND CENTRE
          </span>
          <span className="text-xs text-blue-200/90 mono">
            Chief Minister's Office • Statewide Grievance Monitor
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          JanSunwayi AI — Master Monitoring Dashboard
        </h2>
        <p className="text-xs text-blue-100/80">
          Live statewide view: 9 Divisions • 38 Districts • 101 Subdivisions • 534 Blocks • 8,406 Gram
          Panchayats. Statutory compliance under the state's Right to Public Grievance Redressal framework.
        </p>
        </div>
      </PhotoBanner>

      {/* CMO Headline KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="card-elevated p-4 space-y-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Registered</p>
          <p className="text-2xl sm:text-3xl font-bold text-slate-800 mono">{totalCount}</p>
          <p className="text-[10px] text-slate-400">
            {personalCount} personal · {societalCount} societal
          </p>
        </div>
        <div className="card-elevated p-4 space-y-1 border-b-4 border-b-emerald-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Resolved</p>
          <p className="text-2xl sm:text-3xl font-bold text-emerald-700 mono">{resolved}</p>
          <p className="text-[10px] text-emerald-700 font-semibold">{resolutionRate}% resolution rate</p>
        </div>
        <div className="card-elevated p-4 space-y-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pending</p>
          <p className="text-2xl sm:text-3xl font-bold text-amber-600 mono">{pending}</p>
          <p className="text-[10px] text-slate-400">within 60-working-day limit</p>
        </div>
        <div className="card-elevated p-4 space-y-1 border-l-4 border-l-rose-600">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">⚡ 48h Flags</p>
          <p className="text-2xl sm:text-3xl font-bold text-rose-600 mono">{flagged48h}</p>
          <p className="text-[10px] text-rose-600 font-semibold">internal early-warning</p>
        </div>
        <div className="card-elevated p-4 space-y-1 border-l-4 border-l-amber-500">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">In Appeal</p>
          <p className="text-2xl sm:text-3xl font-bold text-amber-700 mono">{inAppeal}</p>
          <p className="text-[10px] text-slate-400">appellate chain active</p>
        </div>
        <div className="card-elevated p-4 space-y-1">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">RTPS Redirects</p>
          <p className="text-2xl sm:text-3xl font-bold text-(--brand-800) mono">{rtpsRedirected}</p>
          <p className="text-[10px] text-slate-400">jurisdiction routing</p>
        </div>
      </div>

      {/* District league table — the CMO accountability view */}
      <div className="card-elevated overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center space-x-2">
          <Landmark className="w-4 h-4 text-(--brand-800)" />
          <h3 className="font-semibold text-slate-800 text-sm">District Performance League</h3>
          <span className="text-[10px] text-slate-400 mono uppercase ml-auto">sorted by volume</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-y border-slate-100">
              <tr className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                <th className="px-4 py-2.5">District</th>
                <th className="px-4 py-2.5 text-center">Registered</th>
                <th className="px-4 py-2.5 text-center">Resolved</th>
                <th className="px-4 py-2.5 text-center">⚡ 48h Flags</th>
                <th className="px-4 py-2.5">Resolution</th>
              </tr>
            </thead>
            <tbody className="text-xs divide-y divide-slate-100">
              {sortedDistricts.map(([district, d]) => {
                const rate = Math.round((d.resolved / (d.total || 1)) * 100);
                return (
                  <tr key={district} className={d.flagged > 0 ? 'bg-rose-50/30' : ''}>
                    <td className="px-4 py-3 font-bold text-slate-800">{district}</td>
                    <td className="px-4 py-3 text-center mono">{d.total}</td>
                    <td className="px-4 py-3 text-center mono text-emerald-700 font-bold">{d.resolved}</td>
                    <td className="px-4 py-3 text-center">
                      {d.flagged > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">
                          {d.flagged}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 w-48">
                      <div className="flex items-center space-x-2">
                        <div className="flex-1 bg-slate-100 h-2 rounded overflow-hidden">
                          <div
                            className={`h-full rounded ${rate >= 50 ? 'bg-emerald-600' : 'bg-amber-500'}`}
                            style={{ width: `${rate}%` }}
                          ></div>
                        </div>
                        <span className="mono text-[10px] font-bold text-slate-600 w-8">{rate}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Department Distribution */}
        <div className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-(--brand-700)" />
            <span>By Department</span>
          </h3>
          <div className="space-y-3">
            {sortedDepts.map(([dept, count]) => {
              const pct = Math.round((count / total) * 100);
              return (
                <div key={dept} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span className="truncate pr-2">{dept}</span>
                    <span className="mono shrink-0">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-(--brand-800) h-full rounded-full" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Escalation chain distribution */}
        <div className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
            <Gavel className="w-4 h-4 text-amber-600" />
            <span>Statutory Escalation Chain</span>
          </h3>
          <div className="space-y-3">
            {ESCALATION_CHAIN.map((level, idx) => {
              const count = byEscalation[level] || 0;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={level} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>
                      {idx + 1}. {level}
                    </span>
                    <span className="mono">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded overflow-hidden">
                    <div
                      className={`h-full rounded ${idx === 0 ? 'bg-emerald-600' : 'bg-amber-600'}`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-slate-100">
            Escalation happens by citizen appeal (§7), not automatically. Healthy state = most matters
            resolved at PGRO level. Officers defaulting without cause face §8 penalty (₹500–₹5,000).
          </p>
        </div>

        {/* Language Breakdown */}
        <div className="card-elevated p-5 space-y-4">
          <h3 className="text-sm font-bold text-slate-800 flex items-center space-x-2">
            <PieChart className="w-4 h-4 text-emerald-600" />
            <span>By Language of Filing</span>
          </h3>
          <div className="space-y-3">
            {Object.entries(byLang).map(([lang, count]) => {
              const pct = Math.round((count / total) * 100);
              return (
                <div key={lang} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-700">
                    <span>{lang}</span>
                    <span className="mono">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded overflow-hidden">
                    <div className="bg-emerald-600 h-full rounded" style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-400 leading-relaxed pt-1 border-t border-slate-100">
            Voice-first intake in Bhojpuri, Magahi, Maithili, Hindi & Urdu (2nd official language) via
            Bhashini (GoI) ASR-ready pipeline. Officials receive AI short summaries — never full voice notes.
          </p>
        </div>
      </div>

      {/* Statutory compliance strip */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex items-start space-x-3">
          <Scale className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Statutory Basis</p>
            <p className="text-xs text-slate-300 mt-1">
              The state's Right to Public Grievance Redressal framework. 60
              working days for hearing & redressal.
            </p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <Clock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">AI Early-Warning</p>
            <p className="text-xs text-slate-300 mt-1">
              Internal 48-hour first-action flag ensures no grievance ever approaches the statutory
              limit unattended — CMO sees flags in real time.
            </p>
          </div>
        </div>
        <div className="flex items-start space-x-3">
          <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-blue-400 uppercase tracking-wider">Jurisdiction Engine</p>
            <p className="text-xs text-slate-300 mt-1">
              §2(a) exclusion screening auto-redirects RTPS / RTI / court matters to their correct
              statutory channels — every filing lands where the law says it must.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
