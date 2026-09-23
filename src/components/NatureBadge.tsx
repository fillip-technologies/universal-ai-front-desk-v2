import React from 'react';
import { EyeOff, ShieldCheck, UserRound, Users } from 'lucide-react';
import { ComplaintNature, GrievanceComplaint } from '../types';

// Personal vs societal presentation. The disclosure itself is enforced by the
// backend (Complaint.to_public); these components only explain it.

export const NatureBadge: React.FC<{ nature?: ComplaintNature }> = ({ nature }) => {
  if (!nature) return null;
  const personal = nature === 'PERSONAL';
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
        personal ? 'bg-sky-100 text-sky-800' : 'bg-violet-100 text-violet-800'
      }`}
      title={
        personal
          ? 'Personal grievance — complainant identity visible to the handling authority'
          : 'Societal grievance — complainant identity withheld'
      }
    >
      {personal ? <UserRound className="w-3 h-3" /> : <Users className="w-3 h-3" />}
      {personal ? 'Personal' : 'Societal'}
    </span>
  );
};

interface NatureNoticeProps {
  complaint: GrievanceComplaint;
  /** 'citizen' explains what the officer will see; 'official' shows it. */
  audience: 'citizen' | 'official';
}

export const NatureNotice: React.FC<NatureNoticeProps> = ({ complaint, audience }) => {
  if (!complaint.complaint_nature) return null;
  const personal = complaint.complaint_nature === 'PERSONAL';

  const heading = personal ? 'Personal grievance' : 'Societal grievance';
  let body: React.ReactNode;
  if (audience === 'citizen') {
    body = personal
      ? 'This affects you or your household directly, so your name and contact details are shared with the handling officer so they can reach you.'
      : 'This is a public issue you are reporting, so your identity is withheld from the handling officer — they see only the issue and its location. Your Aadhaar verification is still on record.';
  } else if (personal && !complaint.identity_withheld) {
    body = (
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-1">
        <div>
          <dt className="text-[10px] font-bold uppercase text-sky-700">Complainant</dt>
          <dd className="text-sm font-bold text-slate-900">{complaint.citizen_name || 'Name not given'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase text-sky-700">Contact</dt>
          <dd className="text-sm font-mono text-slate-900">{complaint.citizen_mobile || '—'}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-bold uppercase text-sky-700">Aadhaar e-KYC</dt>
          <dd className="text-sm font-mono text-slate-900">{complaint.aadhaar_number || '—'}</dd>
        </div>
      </dl>
    );
  } else {
    body =
      'Complainant identity withheld — this is a public issue reported on behalf of the community. The complainant is Aadhaar-verified; act on the summary and location below.';
  }

  return (
    <div
      className={`rounded-2xl border p-4 space-y-1.5 ${
        personal ? 'bg-sky-50 border-sky-200' : 'bg-violet-50 border-violet-200'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        {personal ? (
          <UserRound className="w-4 h-4 text-sky-700" />
        ) : (
          <EyeOff className="w-4 h-4 text-violet-700" />
        )}
        <span className={`text-xs font-black uppercase tracking-wide ${personal ? 'text-sky-900' : 'text-violet-900'}`}>
          {heading}
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700">
          <ShieldCheck className="w-3.5 h-3.5" /> Verified complainant
        </span>
      </div>
      <div className={`text-xs leading-relaxed ${personal ? 'text-sky-900' : 'text-violet-900'}`}>{body}</div>
      {complaint.nature_rationale && (
        <p className="text-[11px] text-slate-500 italic">Why: {complaint.nature_rationale}</p>
      )}
    </div>
  );
};
