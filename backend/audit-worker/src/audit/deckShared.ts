import { looksLikeStreet, resolveSearchArea } from '../lib/searchArea.js';

export type AuditDeckContext = {
  name: string;
  city: string;
  service: string;
};

export function auditContext(audit: any): AuditDeckContext {
  const name = String(audit?.business?.businessName || '').trim() || 'This business';
  let city =
    String(audit?.business?.searchAreaLabel || audit?.business?.city || '').trim() ||
    'the local area';
  // Never show a street / estate name (e.g. "Trafford Park"); use the town or city instead.
  if (looksLikeStreet(city)) {
    city = resolveSearchArea({ city: '', address: audit?.business?.address }).label;
  }
  const service =
    String(audit?.business?.serviceLabel || audit?.business?.service || '').trim() ||
    'local services';
  return { name, city, service };
}

export function toActions(rows: any[], defaultPri: string) {
  return rows.map((c, i) => {
    const priority = i === 0 ? 'Critical' : i === 1 ? 'High' : defaultPri;
    const evidence = c.evidence || 'Failed automated check';
    const impact =
      priority === 'Critical'
        ? 'Blocks local trust and ranking signals'
        : priority === 'High'
          ? 'Weakens Local Pack / answer visibility'
          : 'Limits competitive local presence';
    return {
      priority,
      title: c.label,
      detail: evidence,
      howTo: `Review and fix “${c.label}” on the live site / Google Business Profile, then re-check.`,
      issue: c.label,
      evidence,
      impact,
      recommendation: `Fix “${c.label}” using the measured evidence, then re-audit.`
    };
  });
}

export type MapsResultRow = {
  position: number;
  name: string;
  rating: unknown;
  reviewCount: unknown;
  isProspect: boolean;
};

export function mapsResultsFromAudit(audit: any): MapsResultRow[] {
  return (audit?.gbpLookup?.localRank?.topResults || [])
    .filter((r: any) => r?.name)
    .slice(0, 5)
    .map((r: any) => ({
      position: r.position,
      name: r.name,
      rating: r.rating,
      reviewCount: r.reviewCount,
      isProspect: Boolean(r.isProspect)
    }));
}

export function measuredQueryFromAudit(audit: any, service: string, city: string): string {
  return (
    String(audit?.gbpLookup?.localRank?.query || '').trim() || `${service} near ${city}`
  );
}

export function inPackFromAudit(audit: any): boolean {
  return typeof audit?.gbpLookup?.localRank?.position === 'number';
}

export function failedChecks(audit: any) {
  const checks = audit?.checklist?.checks || [];
  return checks.filter((c: any) => c.status === 'fail');
}
