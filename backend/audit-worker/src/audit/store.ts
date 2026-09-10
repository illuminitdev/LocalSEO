import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';
import { buildChecklist } from './checklistSchema.js';
import { computeScore } from './score.js';
import { isDatabaseEnabled, query } from '../lib/db.js';
import type { AuditCreateInput, AuditRecord, ChecklistCheck } from '../types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../../data/audits');

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function newId() {
  return randomBytes(6).toString('hex');
}

function filePath(id: string) {
  return path.join(DATA_DIR, `${id}.json`);
}

async function writeAuditFile(audit: AuditRecord) {
  await ensureDir();
  await fs.writeFile(filePath(audit.id), JSON.stringify(audit, null, 2), 'utf8');
}

async function saveAuditToDb(audit: AuditRecord) {
  await query(
    `INSERT INTO audits (id, status, published, data, updated_at, published_at)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       status = EXCLUDED.status,
       published = EXCLUDED.published,
       data = EXCLUDED.data,
       updated_at = EXCLUDED.updated_at,
       published_at = EXCLUDED.published_at`,
    [
      audit.id,
      audit.status,
      audit.published,
      JSON.stringify(audit),
      audit.updatedAt,
      audit.publishedAt
    ]
  );
}

async function getAuditFromDb(id: string): Promise<AuditRecord | null> {
  const result = await query<{ data: AuditRecord }>(`SELECT data FROM audits WHERE id = $1`, [id]);
  return result.rows[0]?.data ?? null;
}

export async function createAudit(input: AuditCreateInput = {}) {
  const id = newId();
  const now = new Date().toISOString();
  const tradeId = input.tradeId || 'general';
  const city = input.city || 'Manchester';
  const checklist = buildChecklist({
    tradeId,
    city,
    locations: input.locations
  });

  const audit: AuditRecord = {
    id,
    status: 'draft',
    published: false,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    auditKind: input.auditKind === 'deep' ? 'deep' : 'ops',
    business: {
      businessName: input.businessName || '',
      website: input.website || '',
      phone: input.phone || '',
      email: input.email || '',
      address: input.address || '',
      service: input.service || input.primaryService || '',
      serviceId: input.serviceId || '',
      serviceLabel: input.serviceLabel || '',
      tradeId,
      city,
      contactName: input.contactName || ''
    },
    operatorNotes: input.operatorNotes || '',
    checklist,
    crawlMeta: null,
    lighthouseMeta: null,
    score: computeScore(checklist.checks) as AuditRecord['score'],
    topFixes: []
  };

  if (isDatabaseEnabled()) {
    await query(
      `INSERT INTO audits (id, status, published, data, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $5)`,
      [audit.id, audit.status, audit.published, JSON.stringify(audit), now]
    );
  } else {
    await writeAuditFile(audit);
  }
  return audit;
}

export async function getAudit(id: string): Promise<AuditRecord | null> {
  if (isDatabaseEnabled()) {
    return getAuditFromDb(id);
  }
  try {
    const raw = await fs.readFile(filePath(id), 'utf8');
    return JSON.parse(raw) as AuditRecord;
  } catch {
    return null;
  }
}

export async function saveAudit(audit: AuditRecord) {
  audit.updatedAt = new Date().toISOString();
  if (audit.score?.mode === 'local-presence' && audit.presence) {
    audit.score = {
      ...audit.presence,
      pillars: audit.presence.pillars
    } as AuditRecord['score'];
  } else {
    audit.score = computeScore(audit.checklist?.checks || [], {
      localRank: (audit.gbpLookup as { localRank?: unknown } | null)?.localRank || null
    }) as AuditRecord['score'];
  }
  audit.topFixes = deriveTopFixes(audit);

  if (isDatabaseEnabled()) {
    await saveAuditToDb(audit);
  } else {
    await writeAuditFile(audit);
  }
  return audit;
}

export async function deleteAudit(id: string): Promise<boolean> {
  const existing = await getAudit(id);
  if (!existing) return false;

  if (isDatabaseEnabled()) {
    await query(`DELETE FROM audits WHERE id = $1`, [id]);
  } else {
    try {
      await fs.unlink(filePath(id));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
      return false;
    }
  }
  return true;
}

function auditListItem(a: AuditRecord) {
  const score = a.score as { total?: number; mode?: string } | undefined;
  const crawlMeta = a.crawlMeta as { mode?: string } | null;
  return {
    id: a.id,
    businessName: a.business?.businessName || '',
    website: a.business?.website || '',
    city: a.business?.city || '',
    tradeId: a.business?.tradeId || '',
    email: a.business?.email || '',
    phone: a.business?.phone || '',
    published: !!a.published,
    status: a.status,
    totalScore: score?.total ?? null,
    auditKind: a.auditKind || null,
    scoreMode: score?.mode || null,
    crawlMode: crawlMeta?.mode || null,
    updatedAt: a.updatedAt,
    createdAt: a.createdAt
  };
}

/** Deep / full-crawl audits only (excludes public Growth / presence audits). */
export function isDeepCrawlAudit(a: AuditRecord | ReturnType<typeof auditListItem>) {
  if (!a) return false;
  if ((a as AuditRecord).auditKind === 'deep') return true;
  const scoreMode =
    (a as { scoreMode?: string }).scoreMode ||
    ((a as AuditRecord).score as { mode?: string } | undefined)?.mode;
  if (scoreMode === 'deep-local-aeo-geo') return true;
  const crawlMode =
    (a as { crawlMode?: string }).crawlMode ||
    ((a as AuditRecord).crawlMeta as { mode?: string } | null)?.mode;
  if (crawlMode === 'deep-crawl') return true;
  return false;
}

export async function listAudits(options: { deepOnly?: boolean } = {}) {
  if (isDatabaseEnabled()) {
    const result = await query<{ data: AuditRecord }>(
      `SELECT data FROM audits ORDER BY updated_at DESC`
    );
    let items = result.rows.map((row) => auditListItem(row.data));
    if (options.deepOnly) {
      items = items.filter((a) => isDeepCrawlAudit(a));
    }
    return items;
  }

  await ensureDir();
  const files = await fs.readdir(DATA_DIR);
  let audits = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(DATA_DIR, f), 'utf8');
      const a = JSON.parse(raw) as AuditRecord;
      audits.push(auditListItem(a));
    } catch {
      // skip corrupt
    }
  }
  audits.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  if (options.deepOnly) {
    audits = audits.filter((a) => isDeepCrawlAudit(a));
  }
  return audits;
}

export function deriveTopFixes(audit: AuditRecord) {
  const checks = audit.checklist?.checks || [];
  const prioritySections = [
    'gbp',
    'conversion',
    'website_basic',
    'website_homepage',
    'onpage_seo',
    'service_pages',
    'local_seo'
  ];
  const failed = checks.filter((c) => c.status === 'fail');
  failed.sort((a, b) => {
    const ai = prioritySections.indexOf(a.section);
    const bi = prioritySections.indexOf(b.section);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  return failed.slice(0, 3).map((c) => ({
    id: c.id,
    label: c.label,
    section: c.sectionTitle || c.section,
    evidence: c.evidence || '',
    notes: c.notes || ''
  }));
}

export function publicReportView(audit: AuditRecord | null) {
  if (!audit || !audit.published) return null;
  return {
    id: audit.id,
    auditKind: audit.auditKind || null,
    publishedAt: audit.publishedAt,
    business: {
      businessName: audit.business.businessName,
      website: audit.business.website,
      city: audit.business.city,
      tradeId: audit.business.tradeId,
      service: audit.business.service || null,
      serviceId: audit.business.serviceId || null,
      serviceLabel: audit.business.serviceLabel || null,
      phone: audit.business.phone || null,
      address: audit.business.address || null
    },
    checklist: {
      tradeLabel: audit.checklist.tradeLabel,
      city: audit.checklist.city,
      checks: (audit.presence?.checks || audit.checklist.checks || []).map((c: ChecklistCheck) => ({
        id: c.id,
        section: c.pillar || c.section,
        sectionTitle: c.pillar || c.sectionTitle || c.section,
        label: c.label,
        source: c.source || 'presence',
        status: c.status,
        evidence: c.evidence || '',
        notes: c.notes || ''
      }))
    },
    score: audit.score,
    topFixes: audit.topFixes || [],
    aiReport: audit.aiReport || null,
    websiteCheck: audit.websiteCheck || null,
    gbpLookup: audit.gbpLookup
      ? {
          source: (audit.gbpLookup as Record<string, unknown>).source,
          listedOnMaps: (audit.gbpLookup as Record<string, unknown>).listedOnMaps,
          confidence: (audit.gbpLookup as Record<string, unknown>).confidence,
          gbpName: (audit.gbpLookup as Record<string, unknown>).gbpName,
          address: (audit.gbpLookup as Record<string, unknown>).address,
          phone: (audit.gbpLookup as Record<string, unknown>).phone,
          websiteOnGbp: (audit.gbpLookup as Record<string, unknown>).websiteOnGbp,
          rating: (audit.gbpLookup as Record<string, unknown>).rating,
          reviewCount: (audit.gbpLookup as Record<string, unknown>).reviewCount,
          mapsUrl: (audit.gbpLookup as Record<string, unknown>).mapsUrl,
          placeId: (audit.gbpLookup as Record<string, unknown>).placeId || null,
          photosPresent: (audit.gbpLookup as Record<string, unknown>).photosPresent ?? null,
          photoNames: (audit.gbpLookup as Record<string, unknown>).photoNames || [],
          photoUrls: (() => {
            const urls = (audit.gbpLookup as Record<string, unknown>).photoUrls;
            if (!Array.isArray(urls)) return [];
            return urls.filter((u) => String(u || '').startsWith('data:image/'));
          })(),
          outsideImageUrl: (() => {
            const u = String((audit.gbpLookup as Record<string, unknown>).outsideImageUrl || '');
            return u.startsWith('data:image/') ? u : null;
          })(),
          latitude: (audit.gbpLookup as Record<string, unknown>).latitude ?? null,
          longitude: (audit.gbpLookup as Record<string, unknown>).longitude ?? null,
          primaryTypeDisplayName:
            (audit.gbpLookup as Record<string, unknown>).primaryTypeDisplayName || null,
          evidence: (audit.gbpLookup as Record<string, unknown>).evidence,
          ownerRepliesLikely: (audit.gbpLookup as Record<string, unknown>).ownerRepliesLikely,
          ownerRepliesEvidence:
            (audit.gbpLookup as Record<string, unknown>).ownerRepliesEvidence || null,
          reviewSamples: (audit.gbpLookup as Record<string, unknown>).reviewSamples || [],
          localRank: (audit.gbpLookup as Record<string, unknown>).localRank || null,
          serviceQuery: (audit.gbpLookup as Record<string, unknown>).serviceQuery || null
        }
      : null,
    crawlMeta: audit.crawlMeta
      ? {
          fetchedAt: (audit.crawlMeta as Record<string, unknown>).fetchedAt,
          finalUrl: (audit.crawlMeta as Record<string, unknown>).finalUrl,
          pageCount: (audit.crawlMeta as Record<string, unknown>).pageCount,
          mode: (audit.crawlMeta as Record<string, unknown>).mode || null,
          llmsTxtFound: (audit.crawlMeta as Record<string, unknown>).llmsTxtFound || null,
          schemaTypes: (audit.crawlMeta as Record<string, unknown>).schemaTypes || null,
          spaHeuristic: (audit.crawlMeta as Record<string, unknown>).spaHeuristic || null,
          sitePhones: (audit.crawlMeta as Record<string, unknown>).sitePhones || [],
          homepageHasTel: (audit.crawlMeta as Record<string, unknown>).homepageHasTel ?? null,
          homepageScreenshot: (() => {
            const shot = (audit.crawlMeta as Record<string, unknown>).homepageScreenshot as
              | { dataUrl?: string; skipped?: boolean; reason?: string; url?: string; capturedAt?: string }
              | null
              | undefined;
            if (!shot) return null;
            if (shot.dataUrl) {
              return {
                dataUrl: shot.dataUrl,
                url: shot.url || null,
                capturedAt: shot.capturedAt || null
              };
            }
            return {
              skipped: true,
              reason: shot.reason || 'Unavailable',
              url: shot.url || null,
              capturedAt: shot.capturedAt || null
            };
          })()
        }
      : null
  };
}
