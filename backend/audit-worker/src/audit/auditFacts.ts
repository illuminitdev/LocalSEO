import { auditContext } from './deckShared.js';
import { buildLocalSeoInconsistencies } from './localSeoDeck.js';
import { readIntake } from '../lib/mapsLink.js';


export type NapField = { status: 'match' | 'mismatch' | 'missing'; google: string; website: string };

export type AiEngineFact = {
  engine: string;
  label: string;
  measuredPrompts: number;
  mentionedPrompts: number;
  answers: number;
  mentions: number;
  bestPosition: number | null;
};

export type AuditFacts = {
  name: string;
  city: string;
  service: string;
  website: string;
  serviceAreaBusiness: boolean;
  otherAreas: string[];
  teamSize: 'solo' | 'small' | 'large' | null;
  profile: {
    found: boolean;
    name: string;
    address: string;
    phone: string;
    website: string;
    mapsUrl: string;
    category: string;
    rating: number | null;
    reviewCount: number | null;
  };
  nap: { name: NapField; phone: NapField; address: NapField; website: NapField };
  maps: {
    measured: boolean;
    query: string;
    position: number | null;
    depth: number;
    competitors: Array<{ position: number; name: string; rating: number | null; reviewCount: number | null }>;
  };
  reviews: { replyRate: number | null; recent: boolean | null };
  gbpDetails: {
    hasDescription: boolean | null;
    hasHours: boolean | null;
    hasServices: boolean | null;
    hasSecondaryCategories: boolean | null;
    postsTotal: number | null;
    hasRecentPosts: boolean | null;
    photosPresent: boolean | null;
  };
  ai: {
    measured: boolean;
    prompts: string[];
    engines: AiEngineFact[];
    answers: number;
    mentions: number;
  };
  aeo: {
    questions: string[];
    measuredQuestions: number;
    answerBoxWins: number;
    paaWins: number;
    faqSchema: boolean;
    faqContent: boolean;
  };
  site: {
    reachable: boolean;
    https: boolean;
    pageCount: number;
    sitePhones: string[];
    robotsBlocksGoogle: boolean;
    aiCrawlersBlocked: string[];
    noindexPages: string[];
    sitemapOk: boolean;
    localSchema: boolean;
    llmsTxt: boolean;
    performance: number | null;
    lcpMs: number | null;
    cls: number | null;
  };
};

function num(v: unknown): number | null {
  const n = Number(v);
  return v == null || v === '' || !Number.isFinite(n) ? null : n;
}

export function buildAuditFacts(audit: any): AuditFacts {
  const { name, city, service } = auditContext(audit);
  const intake = readIntake(audit);
  const g = audit?.gbpLookup || {};
  const crawl = audit?.crawlMeta || {};
  const tech = crawl.technical || {};
  const lh = audit?.lighthouseMeta || {};
  const rank = g.localRank || {};
  const found = g.listedOnMaps === true && Boolean(String(g.gbpName || '').trim());

  const cards = found ? buildLocalSeoInconsistencies(audit) : [];
  const napFrom = (field: string): NapField => {
    const card = cards.find((c: any) => c.field === field);
    const google = String(card?.gbpShows || '');
    const website = String(card?.websiteShows || '');
    const status: NapField['status'] =
      card?.status === 'match' ? 'match' : card?.status === 'mismatch' ? 'mismatch' : 'missing';
    return { status, google, website };
  };

  const engines: AiEngineFact[] = [];
  const rows = Array.isArray(g.aiEngineChecks) ? g.aiEngineChecks : [];
  for (const row of rows) {
    const label = String(row?.label || row?.engine || 'AI');
    let e = engines.find((x) => x.label === label);
    if (!e) {
      e = { engine: String(row?.engine || ''), label, measuredPrompts: 0, mentionedPrompts: 0, answers: 0, mentions: 0, bestPosition: null };
      engines.push(e);
    }
    if (row?.skipped || (row?.mentioned !== true && row?.mentioned !== false)) continue;
    e.measuredPrompts += 1;
    if (row.mentioned === true) e.mentionedPrompts += 1;
    const answered = num(row.answeredCount) ?? 1;
    e.answers += answered;
    e.mentions += num(row.mentionCount) ?? (row.mentioned ? answered : 0);
    const pos = num(row.bestPosition);
    if (pos != null) e.bestPosition = e.bestPosition == null ? pos : Math.min(e.bestPosition, pos);
  }
  const prompts = [...new Set(rows.map((r: any) => String(r?.prompt || '').trim()).filter(Boolean))] as string[];

  const shots = (Array.isArray(audit?.aeoSerpScreenshots) ? audit.aeoSerpScreenshots : []).filter(
    (s: any) => s?.serpMeasured === true
  );
  const specs = Array.isArray(audit?.aeoQuerySpecs) ? audit.aeoQuerySpecs : [];
  const checks = audit?.checklist?.checks || [];
  const checkPass = (id: string) => checks.find((c: any) => c.id === id)?.status === 'pass';

  return {
    name,
    city,
    service,
    website: String(audit?.business?.website || ''),
    serviceAreaBusiness: intake.serviceArea === 'travel',
    otherAreas: intake.otherAreas || [],
    teamSize: intake.teamSize || null,
    profile: {
      found,
      name: found ? String(g.gbpName || '') : '',
      address: found ? String(g.address || '') : '',
      phone: found ? String(g.phone || '') : '',
      website: found ? String(g.websiteOnGbp || '') : '',
      mapsUrl: found ? String(g.mapsUrl || '') : '',
      category: found ? String(g.primaryTypeDisplayName || g.primaryCategory || '') : '',
      rating: found ? num(g.rating) : null,
      reviewCount: found ? num(g.reviewCount) : null
    },
    nap: { name: napFrom('brand'), phone: napFrom('phone'), address: napFrom('address'), website: napFrom('website') },
    maps: {
      measured: Boolean(rank.query),
      query: String(rank.query || ''),
      position: found && typeof rank.position === 'number' ? rank.position : null,
      depth: num(rank.totalChecked) || (Array.isArray(rank.topResults) ? rank.topResults.length : 0) || 10,
      competitors: (Array.isArray(rank.topResults) ? rank.topResults : [])
        .filter((r: any) => r?.name && !r.isProspect)
        .slice(0, 5)
        .map((r: any) => ({
          position: Number(r.position),
          name: String(r.name),
          rating: num(r.rating),
          reviewCount: num(r.reviewCount)
        }))
    },
    reviews: {
      replyRate: found && g.reviewsOk === true ? num(g.reviewReplyRate) : null,
      recent: found && g.reviewsOk === true && typeof g.reviewsLookRecent === 'boolean' ? g.reviewsLookRecent : null
    },
    gbpDetails: {
      hasDescription: found ? (g.hasDescription ?? (g.description ? true : null)) : null,
      hasHours: found ? (g.hasHours ?? null) : null,
      hasServices: found ? (g.hasServices ?? null) : null,
      hasSecondaryCategories: found ? (g.hasSecondaryCategories ?? null) : null,
      postsTotal: found && g.postsOk === true ? num(g.postsTotal) : null,
      hasRecentPosts: found && typeof g.hasRecentPosts === 'boolean' ? g.hasRecentPosts : null,
      photosPresent: found ? (g.photosPresent ?? null) : null
    },
    ai: {
      measured: engines.some((e) => e.measuredPrompts > 0),
      prompts,
      engines,
      answers: engines.reduce((n, e) => n + e.answers, 0),
      mentions: engines.reduce((n, e) => n + e.mentions, 0)
    },
    aeo: {
      questions: specs.map((s: any) => String(s?.query || '').trim()).filter(Boolean),
      measuredQuestions: shots.length,
      answerBoxWins: shots.filter((s: any) => s.businessInAnswerBox === true).length,
      paaWins: shots.filter((s: any) => s.businessInPaa === true).length,
      faqSchema: Boolean(crawl.hasFaqSchema),
      faqContent: checkPass('aeo_2') || checkPass('onpage_10')
    },
    site: {
      reachable: Number(crawl.pageCount) > 0,
      https: /^https:/i.test(String(crawl.finalUrl || '')),
      pageCount: Number(crawl.pageCount) || 0,
      sitePhones: Array.isArray(crawl.sitePhones) ? crawl.sitePhones : [],
      robotsBlocksGoogle: Boolean(tech.robots?.blocksAll || tech.robots?.blocksGooglebot),
      aiCrawlersBlocked: Array.isArray(tech.robots?.aiCrawlersBlocked) ? tech.robots.aiCrawlersBlocked : [],
      noindexPages: Array.isArray(tech.noindexPages) ? tech.noindexPages : [],
      sitemapOk: checkPass('tech_6'),
      localSchema: checkPass('tech_14'),
      llmsTxt: Boolean(crawl.llmsTxtFound),
      performance: lh.skipped ? null : num(lh.performance),
      lcpMs: lh.skipped ? null : num(lh.lcp),
      cls: lh.skipped ? null : num(lh.cls)
    }
  };
}

/** "2 of 9" style counts, written the same way everywhere. */
export function aiMentionSummary(facts: AuditFacts): string {
  const measured = facts.ai.engines.filter((e) => e.answers > 0);
  if (!measured.length) return '';
  return measured.map((e) => `${e.label} ${e.mentions} of ${e.answers}`).join(', ');
}
