import type { SQSEvent, SQSHandler } from 'aws-lambda';
import { getAudit, saveAudit } from '../audit/store.js';
import { crawlWebsite } from '../audit/crawler.js';
import { applyWebsiteChecks } from '../audit/checksWebsite.js';
import { runLighthouse } from '../audit/lighthouseRunner.js';
import { captureHomepageScreenshot } from '../audit/homepageScreenshot.js';
import { fallbackPillarDecks } from '../audit/pillarFixDecks.js';
import { computeScore } from '../audit/score.js';
import { generateAiReport, generateDeepAiReport } from '../audit/geminiReport.js';
import { deriveTopFixes } from '../audit/store.js';
import { updateAuditJob } from '../lib/auditJobs.js';
import {
  buildDeepLocalRank,
  fetchMapsLocalPack,
  requireDataForSeoConfigured
} from '../lib/dataForSeo.js';

interface RunWebsiteMessage {
  auditId: string;
  jobId: string;
  skipLighthouse?: boolean;
  generateAi?: boolean;
  autoPublish?: boolean;
}

async function enrichLocalRankFromDataForSeo(audit: any) {
  if (!requireDataForSeoConfigured()) return;

  const business = audit.business || {};
  const service =
    String(business.service || business.serviceLabel || business.primaryService || '').trim() ||
    'local business';
  const city = String(business.city || '').trim() || String(business.address || '').trim();
  if (!city) return;

  const query = `${service} near ${city}`.replace(/\s+/g, ' ').trim();
  const lat = audit.gbpLookup?.latitude ?? audit.gbpLookup?.lat ?? null;
  const lng = audit.gbpLookup?.longitude ?? audit.gbpLookup?.lng ?? null;

  const items = await fetchMapsLocalPack({
    keyword: query,
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
    locationName: city,
    depth: 10,
    timeoutMs: 20000
  });
  if (!items.length) {
    console.warn('[auditWorker] DataForSEO returned no Maps results for', query);
    return;
  }

  const localRank = buildDeepLocalRank({
    query,
    items,
    businessName: business.businessName,
    placeId: audit.gbpLookup?.placeId || ''
  });

  audit.gbpLookup = {
    ...(audit.gbpLookup || {}),
    localRank
  };
}

export const main: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const msg = JSON.parse(record.body) as RunWebsiteMessage;
    const { auditId, jobId, skipLighthouse, generateAi, autoPublish } = msg;

    try {
      await updateAuditJob(jobId, 'running');

      const audit = await getAudit(auditId);
      if (!audit) throw new Error('Audit not found');

      const website = audit.business?.website;
      if (!website) throw new Error('Business website URL is required');

      const crawl = await crawlWebsite(website, { maxPages: 12 });
      let lighthouse = null;
      if (!skipLighthouse) {
        lighthouse = await runLighthouse(crawl.finalUrl || website);
      } else {
        lighthouse = { skipped: true, reason: 'Skipped by operator' };
      }

      const screenshot = await captureHomepageScreenshot(crawl.finalUrl || website);

      const lhMetrics = lighthouse && !(lighthouse as { skipped?: boolean }).skipped ? lighthouse : null;

      applyWebsiteChecks(audit.checklist.checks, crawl, lhMetrics, {
        city: audit.business.city,
        phone: audit.business.phone,
        address: audit.business.address,
        gbpLookup: audit.gbpLookup
      });

      // Full Audit local pack — DataForSEO Maps SERP (admin report quality)
      try {
        await enrichLocalRankFromDataForSeo(audit);
      } catch (rankErr) {
        const err = rankErr as Error;
        console.warn('[auditWorker] DataForSEO localRank enrich failed:', err.message);
      }

      audit.auditKind = 'deep';
      audit.crawlMeta = {
        fetchedAt: crawl.fetchedAt,
        requestedUrl: crawl.requestedUrl,
        finalUrl: crawl.finalUrl,
        pageCount: crawl.pageCount,
        https: crawl.https,
        sitemapFound: crawl.sitemapFound,
        brokenLinks: crawl.brokenLinks,
        errors: crawl.errors,
        schemaTypes: crawl.schemaTypes || [],
        hasFaqSchema: !!crawl.hasFaqSchema,
        llmsTxtFound: !!crawl.llmsTxtFound,
        spaHeuristic: crawl.spaHeuristic || null,
        sitePhones: crawl.sitePhones || [],
        homepageHasTel: Boolean(
          (crawl.pages?.[0]?.telLinks || []).length ||
            (crawl.pages?.[0]?.phonesInText || []).length
        ),
        mode: 'deep-crawl',
        homepageScreenshot: screenshot
      };
      audit.lighthouseMeta = lighthouse;
      audit.status = autoPublish ? 'published' : 'reviewed';
      if (autoPublish) {
        audit.published = true;
        audit.publishedAt = new Date().toISOString();
      }
      audit.score = computeScore(audit.checklist.checks, {
        localRank: audit.gbpLookup?.localRank || null
      });
      audit.topFixes = deriveTopFixes(audit);

      if (generateAi !== false) {
        try {
          audit.aiReport = await generateDeepAiReport(audit);
        } catch (aiErr) {
          try {
            audit.aiReport = await generateAiReport(audit);
          } catch (fallbackErr) {
            const err = fallbackErr as Error;
            audit.aiReport = {
              ...(audit.aiReport || {}),
              fallbackError: err.message,
              generatedAt: new Date().toISOString()
            };
          }
        }
        try {
          const decks = fallbackPillarDecks(audit);
          audit.aiReport = {
            ...(audit.aiReport || {}),
            localSeoFixes: audit.aiReport?.localSeoFixes || decks.localSeoFixes,
            aeoFixes: audit.aiReport?.aeoFixes || decks.aeoFixes,
            geoFixes: audit.aiReport?.geoFixes || decks.geoFixes
          };
        } catch {
          // ignore
        }
      }

      await saveAudit(audit);
      await updateAuditJob(jobId, 'complete');
    } catch (err) {
      const error = err as Error;
      await updateAuditJob(jobId, 'failed', error.message);
      throw err;
    }
  }
};
