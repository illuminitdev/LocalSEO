import { brandTokens } from '../lib/brandMatch.js';
import { mapsMatchSignals, type DataForSeoMapsItem } from '../lib/dataForSeo.js';

export type MatchTarget = {
  businessName?: string;
  phone?: string;
  website?: string;
  placeId?: string;
  cid?: string;
  city?: string;
  idOnly?: boolean;
};
export type SimilarListing = { name: string; phone?: string; website?: string; phoneConflict: boolean; websiteConflict: boolean };

const PROFILE_FIELDS = [
  'gbpName', 'address', 'phone', 'websiteOnGbp', 'mapsUrl', 'rating', 'reviewCount', 'placeId', 'cid',
  'primaryTypeDisplayName', 'primaryCategory', 'secondaryTypes', 'additionalCategories', 'hasHours', 'hoursText',
  'description', 'hasDescription', 'photosPresent', 'photoNames', 'photoUrls', 'photoSource', 'outsideImageUrl',
  'mapImageUrl', 'mapsScreenshot', 'localPackScreenshot'
];

/** No Google listing belongs to this business: clear every profile field so no section can show one. */
export function markNoProfile(audit: any, similar: SimilarListing | null) {
  const business = audit.business || {};
  const prev = audit.gbpLookup || {};
  const next: Record<string, unknown> = { ...prev };
  for (const key of PROFILE_FIELDS) next[key] = null;
  audit.gbpLookup = {
    ...next,
    photoUrls: [],
    photoNames: [],
    secondaryTypes: [],
    listedOnMaps: false,
    confidence: 'none',
    source: 'dataforseo-maps',
    similarListing: similar,
    evidence: `No Google Business Profile found for “${business.businessName || 'the business'}”${
      business.city ? ` in ${business.city}` : ''
    }`
  };
}

/** A Maps listing that shares the brand words but was rejected (different phone or website). */
export function similarListing(items: DataForSeoMapsItem[], target: MatchTarget): SimilarListing | null {
  const tokens = brandTokens(target.businessName || '');
  if (!tokens.length) return null;
  for (const item of items) {
    const words = brandTokens(item.name);
    if (!tokens.every((t) => words.includes(t))) continue;
    const { signals } = mapsMatchSignals(item, target);
    return {
      name: item.name,
      phone: item.phone || undefined,
      website: item.website || undefined,
      phoneConflict: signals.phone === 'conflict',
      websiteConflict: signals.website === 'conflict'
    };
  }
  return null;
}

/** The stored listing (from the quick audit or the Maps match) still passes the same match rules. */
export function profileStillMatches(g: any, target: MatchTarget): boolean {
  // The business gave its own Maps link: the stored listing must be that one.
  if (target.idOnly) {
    const placeId = String(g.placeId || '');
    const cid = String(g.cid || '');
    return Boolean(
      (target.placeId && placeId && (placeId.includes(target.placeId) || target.placeId.includes(placeId))) ||
        (target.cid && (cid === target.cid || placeId === target.cid))
    );
  }
  const item = {
    position: 0,
    placeId: String(g.placeId || ''),
    name: String(g.gbpName || ''),
    address: String(g.address || ''),
    rating: null,
    reviewsCount: 0,
    lat: null,
    lng: null,
    mapsUrl: '',
    website: String(g.websiteOnGbp || ''),
    phone: String(g.phone || ''),
    mainImage: '',
    totalPhotos: 0,
    isThisBusiness: false
  } as DataForSeoMapsItem;
  return mapsMatchSignals(item, { ...target, placeId: undefined }).accepted;
}

/** The Maps ranking marks the same listing as the profile, or none when there is no profile. */
export function alignRankWithProfile(audit: any) {
  const g = audit.gbpLookup || {};
  const rank = g.localRank;
  if (!rank || !Array.isArray(rank.topResults)) return;
  const depth = Number(rank.totalChecked) || rank.topResults.length || 10;
  if (g.listedOnMaps !== true) {
    rank.topResults.forEach((r: any) => (r.isProspect = false));
    rank.position = null;
    rank.evidence = `Not in the top ${depth} on Google Maps for “${rank.query}”`;
    if (Array.isArray(rank.queryRanks)) rank.queryRanks.forEach((q: any) => ((q.position = null), (q.found = false)));
    return;
  }
  const placeId = String(g.placeId || '');
  if (!placeId) return;
  const own = rank.topResults.find((r: any) => r.placeId === placeId);
  const marked = rank.topResults.find((r: any) => r.isProspect);
  if (marked && marked.placeId !== placeId) {
    rank.topResults.forEach((r: any) => (r.isProspect = r.placeId === placeId));
    rank.position = own ? own.position : null;
  } else if (!marked && own && rank.position == null) {
    own.isProspect = true;
    rank.position = own.position;
  }
  rank.evidence =
    rank.position != null
      ? `Appears at #${rank.position} on Google Maps for “${rank.query}”`
      : `Not in the top ${depth} on Google Maps for “${rank.query}”`;
}
