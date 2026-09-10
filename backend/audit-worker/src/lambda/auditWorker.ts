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
  findMatchingMapsItem,
  requireDataForSeoConfigured,
  type DataForSeoMapsItem
} from '../lib/dataForSeo.js';
import {
  fetchPlaceDetailsById,
  gbpFieldsFromPlaceDetails,
  photoUrlsFromPlace
} from '../lib/placesGbp.js';

interface RunWebsiteMessage {
  auditId: string;
  jobId: string;
  skipLighthouse?: boolean;
  generateAi?: boolean;
  autoPublish?: boolean;
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  const u = String(url || '').trim();
  if (!u) return null;
  if (u.startsWith('data:image/')) return u;
  try {
    const res = await fetch(u, {
      headers: { Accept: 'image/*,*/*' },
      signal: AbortSignal.timeout(15000)
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    if (!buf.length || !/^image\//i.test(ct)) return null;
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

async function mergeGbpFromMapsHit(audit: any, hit: DataForSeoMapsItem) {
  const prev = audit.gbpLookup || {};
  const place = hit.placeId ? await fetchPlaceDetailsById(hit.placeId) : null;
  const fromPlace = place ? gbpFieldsFromPlaceDetails(place) : null;
  let photoUrls: string[] = Array.isArray(prev.photoUrls)
    ? prev.photoUrls.filter(
        (u: string) => String(u || '').startsWith('data:image/') || /^https?:\/\//i.test(String(u || ''))
      )
    : [];

  if (place) {
    const resolved = await photoUrlsFromPlace(place, 2);
    if (resolved.length) photoUrls = resolved;
  }
  if (!photoUrls.length && hit.mainImage) {
    const asData = await imageUrlToDataUrl(hit.mainImage);
    photoUrls = asData ? [asData] : [hit.mainImage];
  }
  // Report UI prefers data:image URLs
  photoUrls = (
    await Promise.all(photoUrls.map(async (u) => (await imageUrlToDataUrl(u)) || u))
  ).filter((u) => String(u || '').startsWith('data:image/'));


  const gbpName = fromPlace?.gbpName || hit.name || prev.gbpName || '';
  const address = fromPlace?.address || hit.address || prev.address || '';
  const phone = fromPlace?.phone || hit.phone || prev.phone || '';
  const websiteOnGbp = fromPlace?.websiteOnGbp || hit.website || prev.websiteOnGbp || '';
  const mapsUrl = fromPlace?.mapsUrl || hit.mapsUrl || prev.mapsUrl || '';
  const latitude = fromPlace?.latitude ?? hit.lat ?? prev.latitude ?? null;
  const longitude = fromPlace?.longitude ?? hit.lng ?? prev.longitude ?? null;

  audit.gbpLookup = {
    ...prev,
    source: place ? 'dataforseo-maps+places' : 'dataforseo-maps',
    listedOnMaps: true,
    confidence: 'high',
    gbpName,
    address,
    phone,
    websiteOnGbp,
    mapsUrl,
    rating: fromPlace?.rating ?? hit.rating ?? prev.rating ?? null,
    reviewCount: fromPlace?.reviewCount ?? hit.reviewsCount ?? prev.reviewCount ?? null,
    placeId: fromPlace?.placeId || hit.placeId || prev.placeId || '',
    latitude,
    longitude,
    primaryTypeDisplayName: fromPlace?.primaryTypeDisplayName || prev.primaryTypeDisplayName || null,
    photosPresent: photoUrls.length > 0 || Boolean(fromPlace?.photosPresent) || hit.totalPhotos > 0,
    photoNames: fromPlace?.photoNames || prev.photoNames || [],
    photoUrls,
    outsideImageUrl: photoUrls[1] || prev.outsideImageUrl || photoUrls[0] || null,
    evidence: `Matched Google Maps listing via DataForSEO: ${gbpName || hit.placeId}`,
    serviceQuery: prev.serviceQuery || null
  };
}

/**
 * DataForSEO Maps: local pack rank + (when missed by Places search) real GBP NAP/photos.
 */
async function enrichFromDataForSeo(audit: any) {
  if (!requireDataForSeoConfigured()) return;

  const business = audit.business || {};
  const service =
    String(business.service || business.serviceLabel || business.primaryService || '').trim() ||
    'local business';
  const city = String(business.city || '').trim() || String(business.address || '').trim();
  const businessName = String(business.businessName || '').trim();

  const packQuery = city ? `${service} near ${city}`.replace(/\s+/g, ' ').trim() : '';
  const brandQuery = [businessName, city || business.address].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const lat = audit.gbpLookup?.latitude ?? audit.gbpLookup?.lat ?? null;
  const lng = audit.gbpLookup?.longitude ?? audit.gbpLookup?.lng ?? null;

  let packItems: DataForSeoMapsItem[] = [];
  if (packQuery) {
    packItems = await fetchMapsLocalPack({
      keyword: packQuery,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      locationName: city || undefined,
      depth: 10,
      timeoutMs: 20000
    });
  }

  // Dedicated brand search so we can fill GBP when Places text search missed the listing
  let brandItems: DataForSeoMapsItem[] = [];
  if (brandQuery) {
    brandItems = await fetchMapsLocalPack({
      keyword: brandQuery,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      locationName: city || undefined,
      depth: 10,
      timeoutMs: 20000
    });
  }

  const rankItems = packItems.length ? packItems : brandItems;
  if (rankItems.length) {
    const localRank = buildDeepLocalRank({
      query: packQuery || brandQuery,
      items: rankItems,
      businessName,
      placeId: audit.gbpLookup?.placeId || '',
      phone: business.phone,
      website: business.website
    });
    audit.gbpLookup = {
      ...(audit.gbpLookup || {}),
      localRank
    };
  } else {
    console.warn('[auditWorker] DataForSEO returned no Maps results for', packQuery || brandQuery);
  }

  const needsGbp =
    !audit.gbpLookup?.listedOnMaps ||
    !audit.gbpLookup?.gbpName ||
    !audit.gbpLookup?.phone ||
    !(Array.isArray(audit.gbpLookup?.photoUrls) && audit.gbpLookup.photoUrls.length) ||
    !audit.gbpLookup?.placeId;

  if (!needsGbp) return;

  const hit =
    findMatchingMapsItem(brandItems, business) ||
    findMatchingMapsItem(packItems, business) ||
    findMatchingMapsItem(brandItems, {
      businessName,
      phone: business.phone,
      website: business.website,
      placeId: audit.gbpLookup?.placeId
    });

  if (!hit) {
    console.warn('[auditWorker] DataForSEO Maps: no GBP match for', businessName);
    return;
  }

  await mergeGbpFromMapsHit(audit, hit);
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

      // Full Audit: DataForSEO Maps rank + GBP NAP/photos (Places Get by place_id when available)
      try {
        await enrichFromDataForSeo(audit);
      } catch (rankErr) {
        const err = rankErr as Error;
        console.warn('[auditWorker] DataForSEO/GBP enrich failed:', err.message);
      }

      applyWebsiteChecks(audit.checklist.checks, crawl, lhMetrics, {
        city: audit.business.city,
        phone: audit.business.phone,
        address: audit.business.address,
        gbpLookup: audit.gbpLookup
      });


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
