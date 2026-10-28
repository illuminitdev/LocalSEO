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

/**
 * The client only ever reads findings about their business. When a data source fails, the row keeps its
 * status and gets the plain finding below; the technical reason stays in the admin data warnings.
 */

const TECHNICAL =
  /\b(fetch|fetched|timed?\s*out|timeout|https?\s+\d{3}|api|task|place_?id|missing (place|business keyword)|failed|failure|not measured|unavailable|on this run|could not|couldn['’]t|returned|\d+\s*ms|dataforseo|gemini|lighthouse|google places|probes?|status_|abort|not confirmed|inconclusive|not (fully )?(assessed|confirmed))\b/i;

const NO_FINDING: Record<string, string> = {
  // Google Business Profile
  core_gbp_name: 'No Google Business Profile under this business name',
  core_gbp_address: 'No address or service area shown on the Google profile',
  core_gbp_phone: 'No phone number shown on the Google profile',
  core_gbp_website: 'No website link on the Google profile',
  core_gbp_primary_cat: 'No primary category set on the Google profile',
  core_gbp_secondary_cat: 'No secondary categories on the Google profile',
  core_gbp_description: 'No business description on the Google profile',
  core_gbp_hours: 'No opening hours on the Google profile',
  core_hours_match: 'Website opening hours do not match the Google profile',
  core_gbp_services: 'No services listed on the Google profile',
  core_gbp_products: 'No products listed on the Google profile',
  core_gbp_photos: 'No recent photos on the Google profile',
  core_gbp_posts: 'No Google Posts in the last 30 days',
  core_gbp_qa: 'No questions and answers on the Google profile',
  core_gbp_rating: 'Google rating is below 4.5 stars',
  core_gbp_review_count: 'Fewer Google reviews than the top local competitors',
  core_gbp_review_recency: 'No new Google reviews in the last 30 days',
  core_gbp_review_response: 'Most Google reviews have no reply from the owner',
  // Website
  core_web_service_pages: 'No dedicated page for each main service',
  core_web_title_meta: 'Page titles and descriptions do not name the service and town',
  core_web_nap: 'Name, address and phone on the website do not match the Google profile',
  core_web_schema: 'No local business schema on the website',
  core_web_mobile: 'The website is not fully mobile-friendly',
  core_web_cwv: 'Core Web Vitals do not pass on mobile',
  core_web_faqs: 'No FAQ section answering customer questions',
  core_web_index: 'Not all key pages are indexed by Google',
  core_web_internal: 'Service pages are not linked to each other',
  core_web_landing: 'No landing pages for the areas served',
  core_web_loc_service: 'No pages that combine each service with the town',
  // Authority
  core_auth_citations: 'Business details differ across online directories',
  core_auth_duplicates: 'Possible duplicate or outdated Google listings',
  core_auth_directories: 'Missing from key local directories',
  core_auth_industry: 'No listings on industry or trade directories',
  core_auth_backlinks: 'Few or no local websites link to the business',
  core_auth_mentions: 'Few or no local brand mentions',
  // Visibility
  core_vis_maps: 'Not in the top 10 on Google Maps for the main service search',
  core_vis_pack: 'Not in Google’s local 3-pack for the main service search',
  core_vis_competitors: 'Local competitors rank above the business',
  core_vis_service: 'Not visible in searches for individual services',
  core_vis_organic: 'Not on page one of Google for the main service search',
  core_vis_geogrid: 'Weak Google Maps visibility across the town',
  // AEO
  aeo_vis_ai: 'Not shown in Google’s answers for local customer questions',
  aeo_vis_snippet: 'Not shown in Google’s featured answer for local questions',
  aeo_vis_paa: 'Not shown in Google’s “People also ask” for local questions',
  aeo_vis_local_q: 'Not shown for local customer questions',
  aeo_vis_competitor: 'Competitors are shown ahead of the business in Google’s answers',
  // GEO
  geo_ai_1: 'Not mentioned by ChatGPT, Gemini or Claude',
  geo_ai_2: 'Not recommended by AI assistants for local searches',
  geo_ai_3: 'Not named by AI assistants for the service in the town',
  geo_ai_4: 'Not named by AI assistants for “best” searches',
  geo_ai_5: 'Not named by AI assistants for “near me” searches',
  geo_ai_7: 'AI assistants recommend competitors instead'
};

function noFinding(id: string, label: string): string {
  if (NO_FINDING[id]) return NO_FINDING[id];
  const name = String(label || '').trim();
  return name ? `${name}: not in place yet` : 'Not in place yet';
}

export function isTechnicalText(text: unknown): boolean {
  return TECHNICAL.test(String(text || ''));
}

/** A row's evidence, or its plain finding when the evidence talks about our tools. */
export function clientEvidence(id: string, label: string, evidence: unknown): string {
  const text = String(evidence || '').trim();
  return text && !isTechnicalText(text) ? text : noFinding(id, label);
}

const TEXT_FIELDS = ['evidence', 'why', 'reason', 'recencyEvidence'];

/** Walks report data and rewrites every technical evidence line on rows that have an id or label. */
export function cleanClientText<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => cleanClientText(v)) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  const row = value as Record<string, unknown>;
  const id = String(row.id || row.checkId || '');
  const label = String(row.label || row.title || '');
  for (const [key, item] of Object.entries(row)) {
    if (TEXT_FIELDS.includes(key) && typeof item === 'string' && (id || label) && isTechnicalText(item)) {
      out[key] = noFinding(id, label);
    } else {
      out[key] = cleanClientText(item);
    }
  }
  return out as T;
}
