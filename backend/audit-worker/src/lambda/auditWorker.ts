import type { SQSEvent, SQSHandler } from 'aws-lambda';
import { getAudit, saveAudit } from '../audit/store.js';
import { crawlWebsite } from '../audit/crawler.js';
import { applyWebsiteChecks } from '../audit/checksWebsite.js';
import { runLighthouse } from '../audit/lighthouseRunner.js';
import { captureHomepageScreenshot } from '../audit/homepageScreenshot.js';
import { fallbackPillarDecks } from '../audit/pillarFixDecks.js';
import { buildGeoChecklist, applyGeoChecklistToChecks } from '../audit/geoChecklist.js';
import { computeScore } from '../audit/score.js';
import { generateAiReport, generateDeepAiReport } from '../audit/geminiReport.js';
import { deriveTopFixes } from '../audit/store.js';
import { updateAuditJob } from '../lib/auditJobs.js';
import {
  buildDeepLocalRank,
  buildGeoAiPrompts,
  captureMapsScreenshotFromTask,
  captureOrganicLocalPackScreenshot,
  checkAiEngineMentionsMulti,
  fetchMapsLocalPack,
  fetchOrganicBrandImages,
  findMatchingMapsItem,
  requireDataForSeoConfigured,
  type DataForSeoMapsItem
} from '../lib/dataForSeo.js';
import {
  fetchPlaceDetailsById,
  gbpFieldsFromPlaceDetails,
  photoUrlsFromPlace
} from '../lib/placesGbp.js';
import { resolveSearchArea } from '../lib/searchArea.js';

async function staticMapDataUrl(lat: number, lng: number): Promise<string | null> {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const params = new URLSearchParams({
      center: `${lat},${lng}`,
      zoom: '16',
      size: '600x400',
      maptype: 'roadmap',
      markers: `color:red|${lat},${lng}`,
      key
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/staticmap?${params}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || 'image/png').split(';')[0];
    if (!buf.length || !/^image\//i.test(ct)) return null;
    return `data:${ct};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

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

async function mergeGbpFromMapsHit(
  audit: any,
  hit: DataForSeoMapsItem,
  opts?: { searchPhotoUrls?: string[]; googleSearchUrl?: string }
) {
  const prev = audit.gbpLookup || {};
  const place = hit.placeId ? await fetchPlaceDetailsById(hit.placeId) : null;
  const fromPlace = place ? gbpFieldsFromPlaceDetails(place) : null;

  // Prefer Google Search brand images; fall back to one Places photo if Search returned none
  let photoUrls: string[] = (opts?.searchPhotoUrls || []).filter((u) =>
    String(u || '').startsWith('data:image/')
  );
  let photoSource: string | null = photoUrls.length ? 'google-search' : null;

  if (!photoUrls.length && Array.isArray(prev.photoUrls) && prev.photoSource === 'google-search') {
    photoUrls = prev.photoUrls.filter((u: string) => String(u || '').startsWith('data:image/'));
    if (photoUrls.length) photoSource = 'google-search';
  }

  if (!photoUrls.length && place) {
    const resolved = await photoUrlsFromPlace(place, 2);
    for (const u of resolved) {
      if (!photoUrls.includes(u)) photoUrls.push(u);
    }
    if (photoUrls.length) photoSource = 'places-or-maps';
  }
  if (!photoUrls.length && hit.mainImage) {
    const asData = await imageUrlToDataUrl(hit.mainImage);
    if (asData) {
      photoUrls = [asData];
      photoSource = 'places-or-maps';
    }
  }

  photoUrls = (
    await Promise.all(photoUrls.map(async (u) => (await imageUrlToDataUrl(u)) || u))
  ).filter((u) => String(u || '').startsWith('data:image/'));

  // Keep distinct photos only (avoid same image in main + "See outside")
  const seen = new Set<string>();
  photoUrls = photoUrls.filter((u) => {
    const key = String(u).slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const outsideDistinct =
    photoUrls.find((u, i) => i > 0 && u !== photoUrls[0]) || null;

  const gbpName = fromPlace?.gbpName || hit.name || prev.gbpName || '';
  const address = fromPlace?.address || hit.address || prev.address || '';
  const phone = fromPlace?.phone || hit.phone || prev.phone || '';
  const websiteOnGbp = fromPlace?.websiteOnGbp || hit.website || prev.websiteOnGbp || '';
  const mapsUrl = fromPlace?.mapsUrl || hit.mapsUrl || prev.mapsUrl || '';
  const latitude = fromPlace?.latitude ?? hit.lat ?? prev.latitude ?? null;
  const longitude = fromPlace?.longitude ?? hit.lng ?? prev.longitude ?? null;
  const googleSearchUrl =
    opts?.googleSearchUrl ||
    prev.googleSearchUrl ||
    (gbpName
      ? `https://www.google.com/search?q=${encodeURIComponent(gbpName)}`
      : '');

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
    googleSearchUrl,
    rating: fromPlace?.rating ?? hit.rating ?? prev.rating ?? null,
    reviewCount: fromPlace?.reviewCount ?? hit.reviewsCount ?? prev.reviewCount ?? null,
    placeId: fromPlace?.placeId || hit.placeId || prev.placeId || '',
    latitude,
    longitude,
    primaryTypeDisplayName: fromPlace?.primaryTypeDisplayName || prev.primaryTypeDisplayName || null,
    photosPresent: photoUrls.length > 0 || Boolean(fromPlace?.photosPresent) || hit.totalPhotos > 0,
    photoNames: fromPlace?.photoNames || prev.photoNames || [],
    photoUrls,
    photoSource: photoSource || prev.photoSource || null,
    outsideImageUrl:
      outsideDistinct ||
      (prev.outsideImageUrl && prev.outsideImageUrl !== photoUrls[0] ? prev.outsideImageUrl : null),
    evidence: `Matched Google Maps listing via DataForSEO: ${gbpName || hit.placeId}`,
    serviceQuery: prev.serviceQuery || null
  };
}




async function enrichFromDataForSeo(audit: any) {
  if (!requireDataForSeoConfigured()) return;

  const business = audit.business || {};
  const service =
    String(business.service || business.serviceLabel || business.primaryService || '').trim() ||
    'local business';
  const area = resolveSearchArea({
    city: business.searchAreaLabel || business.city,
    address: business.address
  });
  const searchArea = String(business.searchAreaLabel || area.label || '').trim();
  if (searchArea && searchArea !== 'the local area') {
    business.searchAreaLabel = searchArea;
    business.city = searchArea;
    if (area.postcode) business.postcode = area.postcode;
    audit.business = business;
  }
  const locationLabel = searchArea || String(business.city || '').trim() || String(business.address || '').trim();
  const businessName = String(business.businessName || '').trim();

  const packQuery = locationLabel
    ? `${service} near ${locationLabel}`.replace(/\s+/g, ' ').trim()
    : '';
  const brandQuery = [businessName, locationLabel || business.address]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  let lat = audit.gbpLookup?.latitude ?? audit.gbpLookup?.lat ?? null;
  let lng = audit.gbpLookup?.longitude ?? audit.gbpLookup?.lng ?? null;

  let packItems: DataForSeoMapsItem[] = [];
  let packTaskId: string | null = null;
  if (packQuery) {
    const pack = await fetchMapsLocalPack({
      keyword: packQuery,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      locationName: locationLabel || undefined,
      depth: 10,
      timeoutMs: 20000
    });
    packItems = pack.items;
    packTaskId = pack.taskId;
  }

  let brandItems: DataForSeoMapsItem[] = [];
  if (brandQuery) {
    const brand = await fetchMapsLocalPack({
      keyword: brandQuery,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      locationName: locationLabel || undefined,
      depth: 10,
      timeoutMs: 20000
    });
    brandItems = brand.items;
  }

  // Google Search (business name) images for KP collage — not Maps/Places photos
  let searchPhotoUrls: string[] = [];
  const googleSearchUrl = brandQuery
    ? `https://www.google.com/search?q=${encodeURIComponent(brandQuery)}`
    : businessName
      ? `https://www.google.com/search?q=${encodeURIComponent(businessName)}`
      : '';
  if (brandQuery) {
    try {
      searchPhotoUrls = await fetchOrganicBrandImages({
        keyword: brandQuery,
        lat: typeof lat === 'number' ? lat : null,
        lng: typeof lng === 'number' ? lng : null,
        locationName: locationLabel || undefined,
        limit: 3,
        timeoutMs: 25000
      });
      // Retry with bare business name if location-qualified query returned nothing
      if (!searchPhotoUrls.length && businessName && businessName !== brandQuery) {
        searchPhotoUrls = await fetchOrganicBrandImages({
          keyword: businessName,
          lat: typeof lat === 'number' ? lat : null,
          lng: typeof lng === 'number' ? lng : null,
          locationName: locationLabel || undefined,
          limit: 3,
          timeoutMs: 25000
        });
      }
    } catch (imgErr) {
      console.warn('[auditWorker] organic brand images failed:', (imgErr as Error).message);
    }
  }

  const attachLocalRank = (items: DataForSeoMapsItem[], query: string) => {
    if (!items.length) return;
    const localRank = buildDeepLocalRank({
      query,
      items,
      businessName,
      placeId: audit.gbpLookup?.placeId || '',
      phone: business.phone,
      website: business.website
    });
    audit.gbpLookup = {
      ...(audit.gbpLookup || {}),
      localRank,
      serviceQuery: query
    };
  };

  const rankItems = packItems.length ? packItems : brandItems;
  if (rankItems.length) {
    attachLocalRank(rankItems, packQuery || brandQuery);
  } else {
    console.warn('[auditWorker] DataForSEO returned no Maps results for', packQuery || brandQuery);
  }

  const needsGbp =
    !audit.gbpLookup?.listedOnMaps ||
    !audit.gbpLookup?.gbpName ||
    !audit.gbpLookup?.phone ||
    !(Array.isArray(audit.gbpLookup?.photoUrls) && audit.gbpLookup.photoUrls.length) ||
    !audit.gbpLookup?.placeId;

  if (needsGbp) {
    const hit =
      findMatchingMapsItem(brandItems, business) ||
      findMatchingMapsItem(packItems, business) ||
      findMatchingMapsItem(brandItems, {
        businessName,
        phone: business.phone,
        website: business.website,
        placeId: audit.gbpLookup?.placeId
      });

    if (hit) {
      await mergeGbpFromMapsHit(audit, hit, { searchPhotoUrls, googleSearchUrl });
    } else {
      console.warn('[auditWorker] DataForSEO Maps: no GBP match for', businessName);
    }
  } else if (searchPhotoUrls.length || googleSearchUrl) {
    // GBP already present — still upgrade collage to Google Search images
    const prev = audit.gbpLookup || {};
    const merged = searchPhotoUrls.length ? [...searchPhotoUrls] : [];
    const outsideDistinct = merged.find((u, i) => i > 0 && u !== merged[0]) || null;
    audit.gbpLookup = {
      ...prev,
      ...(merged.length
        ? {
            photoUrls: merged,
            photoSource: 'google-search',
            photosPresent: true,
            outsideImageUrl: outsideDistinct || null
          }
        : {}),
      googleSearchUrl: googleSearchUrl || prev.googleSearchUrl || null
    };
  }

  
  lat = audit.gbpLookup?.latitude ?? audit.gbpLookup?.lat ?? null;
  lng = audit.gbpLookup?.longitude ?? audit.gbpLookup?.lng ?? null;
  const hadCoordsBefore = typeof lat === 'number' && typeof lng === 'number';
  if (hadCoordsBefore && packQuery) {
    const refreshed = await fetchMapsLocalPack({
      keyword: packQuery,
      lat,
      lng,
      locationName: locationLabel || undefined,
      depth: 10,
      timeoutMs: 20000
    });
    if (refreshed.items.length) {
      attachLocalRank(refreshed.items, packQuery);
      packTaskId = refreshed.taskId || packTaskId;
    }
  }

  
  const localRank = audit.gbpLookup?.localRank as
    | { topResults?: Array<{ mainImage?: string; isProspect?: boolean }> }
    | undefined;
  if (localRank?.topResults?.length) {
    const top = localRank.topResults.filter((r) => r && !r.isProspect).slice(0, 3);
    await Promise.all(
      top.map(async (r) => {
        if (r.mainImage && !String(r.mainImage).startsWith('data:image/')) {
          const data = await imageUrlToDataUrl(r.mainImage);
          if (data) r.mainImage = data;
        }
      })
    );
  }

  // Real Google Local Pack + Maps screenshots (same measured query users can re-type)
  const measuredQuery =
    String((audit.gbpLookup?.localRank as { query?: string } | undefined)?.query || '').trim() ||
    packQuery ||
    brandQuery;
  if (measuredQuery) {
    try {
      const [localPackScreenshot, mapsScreenshot] = await Promise.all([
        captureOrganicLocalPackScreenshot({
          keyword: measuredQuery,
          lat: typeof lat === 'number' ? lat : null,
          lng: typeof lng === 'number' ? lng : null,
          locationName: locationLabel || undefined,
          timeoutMs: 35000
        }),
        captureMapsScreenshotFromTask(packTaskId, measuredQuery)
      ]);
      audit.gbpLookup = {
        ...(audit.gbpLookup || {}),
        localPackScreenshot: { ...localPackScreenshot, query: measuredQuery },
        mapsScreenshot: { ...mapsScreenshot, query: measuredQuery }
      };

      // If Maps SERP screenshot missing, store a Static Map tile for the KP map image
      const mapsShotOk =
        mapsScreenshot?.dataUrl && String(mapsScreenshot.dataUrl).startsWith('data:image/');
      if (!mapsShotOk && typeof lat === 'number' && typeof lng === 'number') {
        const mapTile = await staticMapDataUrl(lat, lng);
        if (mapTile) {
          audit.gbpLookup = {
            ...(audit.gbpLookup || {}),
            mapImageUrl: mapTile
          };
        }
      } else if (mapsShotOk) {
        audit.gbpLookup = {
          ...(audit.gbpLookup || {}),
          mapImageUrl: mapsScreenshot.dataUrl
        };
      }
    } catch (shotErr) {
      const err = shotErr as Error;
      console.warn('[auditWorker] SERP screenshots failed:', err.message);
      audit.gbpLookup = {
        ...(audit.gbpLookup || {}),
        localPackScreenshot: {
          query: measuredQuery,
          skipped: true,
          reason: err.message || 'screenshot failed',
          capturedAt: new Date().toISOString()
        },
        mapsScreenshot: {
          query: measuredQuery,
          skipped: true,
          reason: err.message || 'screenshot failed',
          capturedAt: new Date().toISOString()
        }
      };
      if (typeof lat === 'number' && typeof lng === 'number') {
        const mapTile = await staticMapDataUrl(lat, lng);
        if (mapTile) {
          audit.gbpLookup = { ...(audit.gbpLookup || {}), mapImageUrl: mapTile };
        }
      }
    }

    // ChatGPT + Claude + Gemini × three GEO prompts (near / best / near me)
    try {
      const aiEngineChecks = await checkAiEngineMentionsMulti({
        service,
        city: locationLabel || undefined,
        businessName
      });
      console.log(
        '[auditWorker] AI engine checks:',
        aiEngineChecks.length,
        'rows,',
        [...new Set(aiEngineChecks.map((r) => r.promptKey || r.prompt))].join(' | ')
      );
      if (aiEngineChecks.length !== 9) {
        console.warn(
          '[auditWorker] Expected 9 AI engine rows (3 prompts × 3 engines), got',
          aiEngineChecks.length
        );
      }
      audit.gbpLookup = {
        ...(audit.gbpLookup || {}),
        aiEngineChecks
      };
    } catch (aiErr) {
      const err = aiErr as Error;
      console.warn('[auditWorker] AI engine checks failed:', err.message);
      const capturedAt = new Date().toISOString();
      const reason = err.message || 'AI check failed';
      const prompts = buildGeoAiPrompts({
        service,
        city: locationLabel || undefined
      });
      const engines = [
        ['chatgpt', 'ChatGPT'],
        ['claude', 'Claude'],
        ['gemini', 'Gemini']
      ] as const;
      audit.gbpLookup = {
        ...(audit.gbpLookup || {}),
        aiEngineChecks: prompts.flatMap(({ key, prompt }) =>
          engines.map(([engine, label]) => ({
            engine,
            label,
            prompt,
            promptKey: key,
            mentioned: null,
            recommendedLikely: null,
            citedHosts: [],
            answerExcerpt: '',
            skipped: true,
            reason,
            capturedAt
          }))
        )
      };
    }
  }
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

      
      try {
        await enrichFromDataForSeo(audit);
      } catch (rankErr) {
        const err = rankErr as Error;
        console.warn('[auditWorker] DataForSEO/GBP enrich failed:', err.message);
      }

      applyWebsiteChecks(audit.checklist.checks, crawl, lhMetrics, {
        city: audit.business.searchAreaLabel || audit.business.city,
        postcode: (audit.business as { postcode?: string }).postcode,
        phone: audit.business.phone,
        address: audit.business.address,
        gbpLookup: audit.gbpLookup
      });

      try {
        const napPhone = audit.checklist.checks.find((c) => c.id === 'nap_1')?.status;
        const napAddr = audit.checklist.checks.find((c) => c.id === 'nap_2')?.status;
        const geoChecklist = buildGeoChecklist({
          businessName: audit.business.businessName,
          website: audit.business.website,
          service: audit.business.serviceLabel || audit.business.service,
          city: audit.business.searchAreaLabel || audit.business.city,
          localRank: audit.gbpLookup?.localRank || null,
          aiEngines: Array.isArray(audit.gbpLookup?.aiEngineChecks)
            ? audit.gbpLookup.aiEngineChecks
            : [],
          crawl: {
            hasLocalBusinessSchema: !!crawl.hasLocalBusinessSchema,
            hasPersonSchema: !!crawl.hasPersonSchema,
            schemaTypes: crawl.schemaTypes || [],
            llmsTxtFound: !!crawl.llmsTxtFound,
            spaHeuristic: crawl.spaHeuristic || null,
            corpusText: crawl.corpus?.text || '',
            hasFaq: !!crawl.hasFaqSchema
          } as any,
          gbp: audit.gbpLookup
            ? {
                listedOnMaps: Boolean(audit.gbpLookup.listedOnMaps),
                gbpName: String(audit.gbpLookup.gbpName || ''),
                address: String(audit.gbpLookup.address || ''),
                websiteOnGbp: String(audit.gbpLookup.websiteOnGbp || ''),
                primaryTypeDisplayName: String(audit.gbpLookup.primaryTypeDisplayName || '')
              }
            : null,
          napPhonePass: napPhone === 'pass' ? true : napPhone === 'fail' ? false : null,
          napAddressPass: napAddr === 'pass' ? true : napAddr === 'fail' ? false : null
        });
        applyGeoChecklistToChecks(audit.checklist.checks, geoChecklist);
        audit.gbpLookup = {
          ...(audit.gbpLookup || {}),
          geoChecklist
        };
      } catch (geoChkErr) {
        const err = geoChkErr as Error;
        console.warn('[auditWorker] geoChecklist build failed:', err.message);
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
