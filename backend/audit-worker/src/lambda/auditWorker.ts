import type { SQSEvent, SQSHandler } from 'aws-lambda';
import { getAudit, saveAudit } from '../audit/store.js';
import { crawlWebsite } from '../audit/crawler.js';
import { applyWebsiteChecks } from '../audit/checksWebsite.js';
import { runLighthouse } from '../audit/lighthouseRunner.js';
import { fallbackPillarDecks } from '../audit/pillarFixDecks.js';
import { buildAeoQuerySpecs } from '../audit/aeoDeck.js';
import { extractSiteServices, generateAeoQuestions } from '../audit/aeoQuestionsAi.js';
import { auditContext } from '../audit/deckShared.js';
import { buildGeoChecklist, applyGeoChecklistToChecks } from '../audit/geoChecklist.js';
import { buildAeoCoreChecklist } from '../audit/aeoCoreChecklist.js';
import { buildLocalSeoCoreChecklist } from '../audit/localSeoCoreChecklist.js';
import { computeScore } from '../audit/score.js';
import { generateDeepAiReport } from '../audit/geminiReport.js';
import { buildAuditFacts } from '../audit/auditFacts.js';
import { addAreaChecks, businessServices, evaluatePageChecks, relabelQuestionChecks, syncChecksWithFacts } from '../audit/checkSync.js';
import { buildNarrative, composeReport } from '../audit/narrative.js';
import { validateReport } from '../audit/reportValidator.js';
import { geminiCallLog, geminiWarnings, resetGeminiCallLog } from '../lib/gemini.js';
import { updateAuditJob } from '../lib/auditJobs.js';
import {
  buildDeepLocalRank,
  buildGeoAiPrompts,
  captureAeoSerpScreenshot,
  captureMapsScreenshotFromTask,
  checkAiEngineMentionsMulti,
  detectDuplicateListings,
  fetchBacklinksSummary,
  fetchGbpMyBusinessInfo,
  fetchGbpQa,
  fetchGbpReviewsSample,
  fetchGbpUpdates,
  fetchMapsLocalPack,
  finalizeWorstLocalRank,
  fetchOrganicBrandImages,
  fetchOrganicLocalRank,
  findMatchingMapsItem,
  mapsMatchSignals,
  measureGeoGridVisibility,
  pickWorstLocalRank,
  requireDataForSeoConfigured,
  searchBusinessListings,
  type DataForSeoMapsItem
} from '../lib/dataForSeo.js';
import { runCitationAudit } from '../audit/citationAudit.js';
import {
  fetchPlaceDetailsById,
  gbpFieldsFromPlaceDetails,
  photoUrlsFromPlace
} from '../lib/placesGbp.js';
import { looksLikeStreet, resolveSearchArea, trustedCity } from '../lib/searchArea.js';
import { alignRankWithProfile, markNoProfile, profileStillMatches, similarListing } from '../audit/profileMatch.js';
import { readIntake, resolveMapsLink, type MapsLinkIds } from '../lib/mapsLink.js';

function hostOf(url: string): string {
  const u = String(url || '').trim();
  if (!u) return '';
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/** UK postcode, upper-cased with no spaces ("M1 1AE" → "M11AE"). */
function postcodeOf(text: string): string {
  const m = String(text || '').match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i);
  return m ? m[0].replace(/\s+/g, '').toUpperCase() : '';
}

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

async function streetViewDataUrl(lat: number, lng: number): Promise<string | null> {
  const key = String(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const params = new URLSearchParams({
      size: '600x400',
      location: `${lat},${lng}`,
      fov: '80',
      pitch: '0',
      key
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/streetview?${params}`);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const ct = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
    if (!buf.length || !/^image\//i.test(ct)) return null;
    
    if (buf.length < 4000) return null;
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

  
  let photoUrls: string[] = (opts?.searchPhotoUrls || []).filter((u) =>
    String(u || '').startsWith('data:image/')
  );
  let photoSource: string | null = photoUrls.length ? 'google-search' : null;

  if (!photoUrls.length && Array.isArray(prev.photoUrls) && prev.photoSource === 'google-search') {
    photoUrls = prev.photoUrls.filter((u: string) => String(u || '').startsWith('data:image/'));
    if (photoUrls.length) photoSource = 'google-search';
  }


  if (photoUrls.length < 2 && place) {
    const resolved = await photoUrlsFromPlace(place, 2);
    for (const u of resolved) {
      if (photoUrls.length >= 2) break;
      const asData = (await imageUrlToDataUrl(u)) || u;
      if (!String(asData || '').startsWith('data:image/')) continue;
      const key = String(asData).slice(0, 120);
      if (photoUrls.some((p) => String(p).slice(0, 120) === key)) continue;
      photoUrls.push(asData);
    }
    if (!photoSource && photoUrls.length) photoSource = 'places-or-maps';
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

  
  const seen = new Set<string>();
  photoUrls = photoUrls.filter((u) => {
    const key = String(u).slice(0, 120);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const outsideDistinct =
    photoUrls.find((u, i) => i > 0 && u !== photoUrls[0]) ||
    (prev.outsideImageUrl &&
    String(prev.outsideImageUrl).startsWith('data:image/') &&
    prev.outsideImageUrl !== photoUrls[0]
      ? prev.outsideImageUrl
      : null);

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

  
  let outsideImageUrl: string | null = null;
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    outsideImageUrl = await streetViewDataUrl(latitude, longitude);
  }
  if (!outsideImageUrl) {
    outsideImageUrl =
      outsideDistinct ||
      (prev.outsideImageUrl && prev.outsideImageUrl !== photoUrls[0]
        ? prev.outsideImageUrl
        : null);
  }
  if (outsideImageUrl && photoUrls[0] && outsideImageUrl === photoUrls[0]) {
    outsideImageUrl = outsideDistinct && outsideDistinct !== photoUrls[0] ? outsideDistinct : null;
  }

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
    secondaryTypes: fromPlace?.secondaryTypes || prev.secondaryTypes || [],
    hasHours: fromPlace?.hasHours ?? prev.hasHours ?? null,
    hoursText: fromPlace?.hoursText || prev.hoursText || '',
    description: fromPlace?.description || prev.description || null,
    photosPresent: photoUrls.length > 0 || Boolean(fromPlace?.photosPresent) || hit.totalPhotos > 0,
    photoNames: fromPlace?.photoNames || prev.photoNames || [],
    photoUrls,
    photoSource: photoSource || prev.photoSource || null,
    outsideImageUrl,
    evidence: `Matched Google Maps listing: ${gbpName || hit.placeId}`,
    serviceQuery: prev.serviceQuery || null
  };
}



async function enrichFromDataForSeo(audit: any, crawl: any) {
  if (!requireDataForSeoConfigured()) return;

  const business = audit.business || {};
  const service =
    String(business.service || business.serviceLabel || business.primaryService || '').trim() ||
    'local business';

  const intakeCity = trustedCity(business.city, business.address);
  const area = resolveSearchArea({
    city: business.searchAreaLabel || intakeCity,
    address: business.address
  });
  const searchArea = String(business.searchAreaLabel || area.label || '').trim();
  if (searchArea && searchArea !== 'the local area') {
    business.searchAreaLabel = searchArea;
    if (area.postcode) business.postcode = area.postcode;
    
    if (!intakeCity) business.city = searchArea;
    else business.city = intakeCity;
    audit.business = business;
  }
  const cityPlace = intakeCity && !looksLikeStreet(intakeCity) ? intakeCity : '';
  const nearPlace =
    (searchArea && searchArea !== 'the local area' && !looksLikeStreet(searchArea) ? searchArea : '') ||
    cityPlace;
  const formCityRaw = intakeCity || String(business.city || '').trim();
  const formCity = formCityRaw && !looksLikeStreet(formCityRaw) ? formCityRaw : '';
  const businessName = String(business.businessName || '').trim();

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const nearNorm = norm(nearPlace);
  const cityNorm = norm(formCity);
  const cityAlreadyInNear =
    Boolean(cityNorm) &&
    Boolean(nearNorm) &&
    (nearNorm === cityNorm || nearNorm.endsWith(` ${cityNorm}`) || nearNorm.includes(cityNorm));

  const locationLabel = nearPlace || formCity;
  // The business's own Maps link (from the intake questions) names the exact listing; no guessing.
  const intake = readIntake(audit);
  const link = intake.googleMapsUrl ? await resolveMapsLink(intake.googleMapsUrl) : null;
  if (intake.googleMapsUrl) {
    console.log('[auditWorker] Maps link from intake:', link ? JSON.stringify({ ...link, url: undefined }) : 'not readable');
  }
  const linkIds = link?.placeId || link?.cid ? { placeId: link.placeId, cid: link.cid, idOnly: true } : null;
  const listingName = link?.name || businessName;
  const brandQuery = [listingName, listingName.toLowerCase().includes(locationLabel.toLowerCase()) ? '' : locationLabel]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cityForQuery = locationLabel;
  const packQueryVariants: string[] = [];
  const packQueryPlace = new Map<string, string>();
  const pushQ = (q: string, place = '') => {
    const cleaned = q.replace(/\s+/g, ' ').trim();
    if (cleaned && !packQueryVariants.some((q) => q.toLowerCase() === cleaned.toLowerCase())) {
      packQueryVariants.push(cleaned);
      packQueryPlace.set(cleaned, place);
    }
  };
  // The Maps ranking searches for the service in the city and area.
  const rankCity = formCity || cityForQuery;
  const rankArea = nearPlace && !looksLikeStreet(nearPlace) ? nearPlace : rankCity;
  for (const place of [rankCity, rankArea]) {
    if (place) pushQ(`${service} in ${place}`, place);
  }
  for (const place of [rankCity, rankArea]) {
    if (place) pushQ(`${service} near ${place}`, place);
  }

  let packQuery = packQueryVariants[0] || '';

  let lat = audit.gbpLookup?.latitude ?? audit.gbpLookup?.lat ?? null;
  let lng = audit.gbpLookup?.longitude ?? audit.gbpLookup?.lng ?? null;

  const mapsOptsBase = {
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
    locationName: locationLabel || undefined,
    depth: 10,
    timeoutMs: 35000
  };

  let packItems: DataForSeoMapsItem[] = [];
  let packTaskId: string | null = null;
  let measuredRank: ReturnType<typeof finalizeWorstLocalRank> | null = null;

  /** Run every Maps search and keep the worst result. */
  const measureWorstRank = async (opts: typeof mapsOptsBase) => {
    const runs = await Promise.all(
      packQueryVariants.map(async (keyword) => {
        const place = packQueryPlace.get(keyword) || '';
        let pack = await fetchMapsLocalPack({
          ...opts,
          keyword,
          lat: null,
          lng: null,
          locationName: place || opts.locationName
        });
        if (!pack.items.length) pack = await fetchMapsLocalPack({ ...opts, keyword });
        const rank = buildDeepLocalRank({
          query: keyword,
          items: pack.items,
          businessName,
          placeId: linkIds?.placeId || audit.gbpLookup?.placeId || '',
          cid: linkIds?.cid,
          idOnly: Boolean(linkIds),
          phone: business.phone,
          website: business.website,
          city: formCity || locationLabel
        });
        return { keyword, pack, rank };
      })
    );
    const withItems = runs.filter((r) => r.pack.items.length);
    const pool = withItems.length ? withItems : runs;
    const worstRank = pickWorstLocalRank(pool.map((r) => r.rank));
    const worst = pool.find((r) => r.rank === worstRank) || pool[0];
    if (!worst) return null;
    return {
      items: worst.pack.items,
      taskId: worst.pack.taskId || null,
      query: worst.keyword,
      rank: finalizeWorstLocalRank(worst.rank, runs.map((r) => r.rank))
    };
  };

  if (packQueryVariants.length) {
    const first = await measureWorstRank(mapsOptsBase);
    if (first) {
      packItems = first.items;
      packTaskId = first.taskId;
      packQuery = first.query;
      measuredRank = first.rank;
    }
  }

  let brandItems: DataForSeoMapsItem[] = [];
  let brandTaskId: string | null = null;
  if (brandQuery && brandQuery !== packQuery) {
    const brand = await fetchMapsLocalPack({
      ...mapsOptsBase,
      keyword: brandQuery
    });
    brandItems = brand.items;
    brandTaskId = brand.taskId;
  } else if (brandQuery === packQuery && packItems.length) {
    brandItems = packItems;
  }

  
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


  const attachLocalRank = (rank: ReturnType<typeof finalizeWorstLocalRank>) => {
    audit.gbpLookup = {
      ...(audit.gbpLookup || {}),
      localRank: rank,
      serviceQuery: rank.query
    };
  };

  // Ranking always comes from the service searches, never the brand-name search.
  if (measuredRank) {
    attachLocalRank(measuredRank);
    if (!packItems.length) {
      console.warn('[auditWorker] DataForSEO Maps empty for', packQuery, '— saved measured No');
    }
  } else {
    console.warn('[auditWorker] No Maps query could be built for', businessName);
  }

  const needsGbp =
    !audit.gbpLookup?.listedOnMaps ||
    !audit.gbpLookup?.gbpName ||
    !audit.gbpLookup?.phone ||
    !(Array.isArray(audit.gbpLookup?.photoUrls) && audit.gbpLookup.photoUrls.length) ||
    !audit.gbpLookup?.placeId;

  // What the website says about the business: its phones, its domain and links to its own Google listing.
  const phones: string[] = [];
  for (const raw of [business.phone, crawl?.technical?.schemaEntity?.telephone, ...(crawl?.sitePhones || [])]) {
    const p = String(raw || '').trim();
    const key = p.replace(/\D/g, '').slice(-9);
    if (key.length === 9 && !phones.some((q) => q.replace(/\D/g, '').slice(-9) === key)) phones.push(p);
  }
  const sitePhones = phones.slice(0, 3);
  const siteDomain = hostOf(crawl?.finalUrl || business.website || '');
  const siteMapsUrls: string[] = Array.isArray(crawl?.technical?.mapsUrls) ? crawl.technical.mapsUrls : [];
  const sitePostcode = postcodeOf(
    [business.postcode, business.address, crawl?.technical?.schemaEntity?.address].filter(Boolean).join(' ')
  );

  const baseTarget = {
    businessName,
    phone: business.phone || sitePhones[0],
    website: business.website,
    city: formCity || locationLabel
  };
  const stored = audit.gbpLookup || {};
  const storedOk =
    stored.listedOnMaps === true &&
    profileStillMatches(stored, {
      ...baseTarget,
      placeId: linkIds?.placeId || stored.placeId,
      cid: linkIds?.cid,
      idOnly: Boolean(linkIds)
    });
  const matchTarget = {
    ...baseTarget,
    placeId: linkIds?.placeId || (storedOk ? stored.placeId : undefined),
    cid: linkIds?.cid,
    idOnly: Boolean(linkIds)
  };

  /** A listing counts as theirs only when its place ID, phone, website or postcode ties it to the website. */
  const confirmed = (item: DataForSeoMapsItem, target: typeof baseTarget & { placeId?: string; cid?: string }) => {
    const { signals } = mapsMatchSignals(item, target);
    if (signals.placeId || signals.phone === 'match' || signals.website === 'match') return true;
    const pc = postcodeOf(item.address);
    return Boolean(sitePostcode && pc === sitePostcode && signals.phone !== 'conflict' && signals.website !== 'conflict');
  };
  const listingFromIds = (ids: MapsLinkIds) =>
    ({
      position: 0,
      placeId: ids.placeId || '',
      cid: ids.cid,
      name: ids.name || businessName,
      address: '',
      rating: null,
      reviewsCount: 0,
      lat: null,
      lng: null,
      mapsUrl: ids.url || '',
      website: '',
      phone: '',
      mainImage: '',
      totalPhotos: 0,
      isThisBusiness: true
    }) as DataForSeoMapsItem;
  const byIds = (ids: MapsLinkIds) => {
    const t = { ...baseTarget, placeId: ids.placeId, cid: ids.cid, idOnly: true };
    return findMatchingMapsItem(brandItems, t) || findMatchingMapsItem(packItems, t) || listingFromIds(ids);
  };

  const tried: string[] = [];
  // A search that returned no task ID failed (error or timeout); one with a task ID and no items found nothing.
  let searches = 0;
  let failedSearches = 0;
  for (const [ran, taskId] of [
    [Boolean(brandQuery && brandQuery !== packQuery), brandTaskId],
    [packQueryVariants.length > 0, packTaskId]
  ] as const) {
    if (!ran) continue;
    searches += 1;
    if (!taskId) failedSearches += 1;
  }
  const mapsSearch = async (keyword: string) => {
    const r = await fetchMapsLocalPack({ ...mapsOptsBase, keyword });
    searches += 1;
    if (!r.taskId) failedSearches += 1;
    return r.items;
  };
  const merge = async (hit: DataForSeoMapsItem, via: string, how: string) => {
    await mergeGbpFromMapsHit(audit, hit, { searchPhotoUrls, googleSearchUrl });
    if (hit.cid) audit.gbpLookup.cid = hit.cid;
    audit.gbpLookup.matchedVia = via;
    audit.gbpLookup.evidence = `Matched Google listing “${audit.gbpLookup.gbpName || hit.name}” ${how}`;
    console.log('[auditWorker] GBP lookup:', via, '→', audit.gbpLookup.gbpName || hit.placeId || hit.cid);
  };

  if (intake.noGoogleProfile) {
    markNoProfile(audit, null);
    audit.gbpLookup.evidence = `${businessName || 'The business'} has told us it has no Google Business Profile yet`;
  } else if (needsGbp || !storedOk) {
    let matched = false;

    // 1. The Maps link the business gave us names the exact listing.
    if (linkIds) {
      await merge(byIds({ ...linkIds, name: link?.name, url: link?.url || '' }), 'form_link', 'from the Maps link provided');
      matched = true;
    }

    // 2. A map embed, Maps link or Google review button on their own website.
    if (!matched && siteMapsUrls.length) {
      tried.push('the website’s Google map and review links');
      for (const url of siteMapsUrls) {
        const ids = await resolveMapsLink(url);
        if (!ids?.placeId && !ids?.cid) continue;
        const before = audit.gbpLookup;
        await merge(byIds(ids), 'site_link', 'from the Google map/review link on the website');
        // A map of somewhere else (a venue, a partner): its phone and website both differ from the site.
        const g = audit.gbpLookup;
        const s = mapsMatchSignals(
          { ...listingFromIds(ids), phone: g.phone || '', website: g.websiteOnGbp || '' },
          baseTarget
        ).signals;
        if (s.phone === 'conflict' && s.website === 'conflict') {
          console.log('[auditWorker] GBP lookup: site link is another business →', g.gbpName);
          audit.gbpLookup = before;
          continue;
        }
        matched = true;
        break;
      }
    }

    // 3. Results already fetched (brand name and service searches) with a phone, website or postcode match.
    if (!matched) {
      const hit = [...brandItems, ...packItems].find((item) => confirmed(item, baseTarget));
      if (hit) {
        await merge(hit, 'name', 'by name, confirmed by phone, website or postcode');
        matched = true;
      }
    }

    // 4. DataForSEO's listings database: the listing whose website is this site.
    const listingsSearch = async (opts: Parameters<typeof searchBusinessListings>[0]) => {
      const r = await searchBusinessListings(opts);
      searches += 1;
      if (!r.taskId) failedSearches += 1;
      return r.items;
    };
    if (!matched && siteDomain) {
      tried.push(`Google listings with website ${siteDomain}`);
      const items = await listingsSearch({ domain: siteDomain });
      const hit = items.find((item) => mapsMatchSignals(item, baseTarget).signals.website === 'match');
      if (hit) {
        await merge(hit, 'listings_domain', `by its website ${siteDomain}`);
        matched = true;
      }
    }

    // 5. The same database by name and town, confirmed by phone, website or postcode.
    if (!matched && businessName) {
      tried.push(`Google listings named “${businessName}”`);
      const items = await listingsSearch({ name: businessName, city: formCity || locationLabel });
      const hit = items.find((item) => confirmed(item, baseTarget));
      if (hit) {
        await merge(hit, 'listings_name', 'by name, confirmed by phone, website or postcode');
        matched = true;
      }
    }

    // 6. Google Maps search by phone number: one number belongs to one business.
    for (const phone of matched ? [] : sitePhones) {
      tried.push(`phone ${phone}`);
      const items = await mapsSearch(phone);
      const hit = items.find((item) => mapsMatchSignals(item, { ...baseTarget, phone }).signals.phone === 'match');
      if (hit) {
        await merge(hit, 'phone', `by phone number ${phone}`);
        matched = true;
        break;
      }
    }

    // 7. Google Maps search by website domain.
    if (!matched && siteDomain) {
      tried.push(`website ${siteDomain}`);
      const items = await mapsSearch(siteDomain);
      const hit = items.find((item) => mapsMatchSignals(item, baseTarget).signals.website === 'match');
      if (hit) {
        await merge(hit, 'domain', `by website ${siteDomain}`);
        matched = true;
      }
    }

    if (!matched) {
      tried.push(`name “${brandQuery || businessName}”`);
      // A same-name listing with nothing tying it to the website is shown to the admin, never used.
      const nameOnly = findMatchingMapsItem(brandItems, matchTarget) || findMatchingMapsItem(packItems, matchTarget);
      const lookupFailed = searches > 0 && failedSearches === searches;
      if (storedOk) {
        console.log('[auditWorker] GBP lookup: no new match, keeping stored listing', stored.gbpName);
      } else if (lookupFailed) {
        console.warn('[auditWorker] GBP lookup: Google Maps searches failed for', businessName);
        markNoProfile(audit, null, tried);
        audit.gbpLookup.lookupFailed = true;
        audit.gbpLookup.evidence = 'Google Business Profile could not be checked: Google Maps search failed on this run';
      } else {
        console.warn('[auditWorker] GBP lookup: no match for', businessName, '| tried', tried.join(', '));
        markNoProfile(audit, similarListing([...brandItems, ...packItems], matchTarget), tried);
        if (nameOnly) {
          audit.gbpLookup.possibleListing = {
            name: nameOnly.name,
            address: nameOnly.address || '',
            phone: nameOnly.phone || '',
            website: nameOnly.website || '',
            mapsUrl: nameOnly.mapsUrl || ''
          };
          audit.gbpLookup.evidence = `Possible Google listing “${nameOnly.name}” found by name only; its phone and website could not be tied to the business`;
        }
      }
    }
  }
  alignRankWithProfile(audit);
  const profileFound = audit.gbpLookup?.listedOnMaps === true;

  if (!needsGbp && profileFound && (searchPhotoUrls.length || googleSearchUrl)) {
    
    const prev = audit.gbpLookup || {};
    const merged = searchPhotoUrls.length
      ? searchPhotoUrls.filter((u) => String(u || '').startsWith('data:image/')).slice(0, 3)
      : [];
    const plat = typeof prev.latitude === 'number' ? prev.latitude : null;
    const plng = typeof prev.longitude === 'number' ? prev.longitude : null;
    let outside =
      plat != null && plng != null ? await streetViewDataUrl(plat, plng) : null;
    if (
      !outside &&
      prev.outsideImageUrl &&
      String(prev.outsideImageUrl).startsWith('data:image/') &&
      prev.outsideImageUrl !== merged[0]
    ) {
      outside = prev.outsideImageUrl;
    }
    audit.gbpLookup = {
      ...prev,
      ...(merged.length
        ? {
            photoUrls: merged.slice(0, 3),
            photoSource: 'google-search',
            photosPresent: true
          }
        : {}),
      outsideImageUrl: outside || null,
      googleSearchUrl: googleSearchUrl || prev.googleSearchUrl || null
    };
  }

  if (profileFound) {
    const gbp = audit.gbpLookup || {};
    const olat = typeof gbp.latitude === 'number' ? gbp.latitude : typeof lat === 'number' ? lat : null;
    const olng =
      typeof gbp.longitude === 'number' ? gbp.longitude : typeof lng === 'number' ? lng : null;
    const main0 = Array.isArray(gbp.photoUrls) ? gbp.photoUrls[0] : null;
    const hasOutside =
      String(gbp.outsideImageUrl || '').startsWith('data:image/') &&
      gbp.outsideImageUrl !== main0;
    if (!hasOutside && olat != null && olng != null) {
      const street = await streetViewDataUrl(olat, olng);
      if (street && street !== main0) {
        audit.gbpLookup = { ...gbp, outsideImageUrl: street };
      }
    }
  }


  try {
    const gbp = audit.gbpLookup || {};
    const placeId = String(gbp.placeId || '').trim();
    const cid = String(gbp.cid || '').trim();
    const keyword =
      placeId ||
      String(gbp.gbpName || businessName || '').trim() ||
      brandQuery;
    if (keyword) {
      const locOpts = {
        lat: typeof gbp.latitude === 'number' ? gbp.latitude : typeof lat === 'number' ? lat : null,
        lng: typeof gbp.longitude === 'number' ? gbp.longitude : typeof lng === 'number' ? lng : null,
        locationName: locationLabel || undefined,
        timeoutMs: 60000
      };
      const organicKw = packQuery || `${service} ${locationLabel}`.trim();
      // Profile lookups by name would return another business's data when no listing matched.
      const noListing = (fields: Record<string, unknown>) =>
        Promise.resolve({ ok: false, evidence: gbp.evidence || 'No Google Business Profile found', ...fields } as any);

      const [updates, reviews, info, qa, backlinks, organic, duplicates, citations] =
        await Promise.all([
          !profileFound ? noListing({ hasRecentPosts: null, totalPosts: null }) : fetchGbpUpdates({
            placeId: placeId || undefined,
            cid: cid || undefined,
            keyword: placeId ? undefined : String(keyword),
            fallbackKeyword: [businessName || gbp.gbpName, locationLabel].filter(Boolean).join(' '),
            ...locOpts,
            depth: 10,
            recentDays: 60,
            timeoutMs: 75000
          }),
          !profileFound ? noListing({ replyRate: null, samples: [], reviewsLookRecent: null }) : fetchGbpReviewsSample({
            placeId: placeId || undefined,
            cid: cid || undefined,
            keyword: placeId ? undefined : String(keyword),
            fallbackKeyword: [businessName || gbp.gbpName, locationLabel].filter(Boolean).join(' '),
            ...locOpts,
            depth: 20,
            recentDays: 90
          }),
          !profileFound ? noListing({ additionalCategories: [] }) : fetchGbpMyBusinessInfo({
            placeId: placeId || undefined,
            cid: cid || undefined,
            keyword: placeId ? undefined : String(keyword),
            ...locOpts
          }),
          !profileFound ? noListing({ hasQa: null }) : fetchGbpQa({
            placeId: placeId || undefined,
            cid: cid || undefined,
            keyword: placeId ? undefined : String(keyword),
            ...locOpts,
            depth: 20
          }),
          fetchBacklinksSummary({ website: business.website }),
          // Searched from the town as a whole, not from the business's own street; the pin is only a fallback.
          (async () => {
            const rankOpts = {
              keyword: organicKw,
              website: business.website || gbp.websiteOnGbp,
              businessName: businessName || gbp.gbpName,
              locationName: locOpts.locationName
            };
            const town = locOpts.locationName ? await fetchOrganicLocalRank({ ...rankOpts, lat: null, lng: null }) : null;
            return town?.ok ? town : fetchOrganicLocalRank({ ...rankOpts, lat: locOpts.lat, lng: locOpts.lng });
          })(),
          !profileFound ? noListing({ duplicateLikely: null }) : detectDuplicateListings({
            businessName: businessName || gbp.gbpName || '',
            placeId: placeId || undefined,
            phone: business.phone || gbp.phone,
            website: business.website,
            lat: locOpts.lat,
            lng: locOpts.lng,
            locationName: locOpts.locationName
          }),
          runCitationAudit({
            businessName: businessName || gbp.gbpName || '',
            address: business.address || gbp.address,
            phone: business.phone || gbp.phone,
            website: business.website || gbp.websiteOnGbp,
            city: locationLabel,
            service
          })
        ]);

      let geoGrid: Awaited<ReturnType<typeof measureGeoGridVisibility>> | null = null;
      if (
        profileFound &&
        typeof locOpts.lat === 'number' &&
        typeof locOpts.lng === 'number' &&
        organicKw
      ) {
        geoGrid = await measureGeoGridVisibility({
          keyword: organicKw,
          placeId: placeId || undefined,
          businessName: businessName || gbp.gbpName,
          lat: locOpts.lat,
          lng: locOpts.lng,
          locationName: locOpts.locationName
        });
      }

      audit.gbpLookup = {
        ...(audit.gbpLookup || {}),
        postsOk: updates.ok,
        hasRecentPosts: updates.hasRecentPosts,
        postsEvidence: updates.evidence,
        recentPostAt: updates.recentPostAt,
        postsTotal: updates.totalPosts,
        reviewsOk: reviews.ok,
        ownerRepliesLikely: reviews.ownerRepliesLikely,
        ownerRepliesEvidence: reviews.evidence,
        reviewReplyRate: reviews.replyRate,
        reviewSamples: reviews.samples,
        reviewsLookRecent: reviews.reviewsLookRecent,
        reviewRecencyEvidence: reviews.recencyEvidence,
        newestReviewAt: reviews.newestReviewAt,
        primaryCategory: info.category || gbp.primaryTypeDisplayName || null,
        primaryTypeDisplayName:
          info.category || gbp.primaryTypeDisplayName || null,
        additionalCategories: info.additionalCategories,
        hasSecondaryCategories: info.ok
          ? info.additionalCategories.length > 0
          : Array.isArray(gbp.secondaryTypes) && gbp.secondaryTypes.length > 1
            ? true
            : null,
        description: info.description || gbp.description || null,
        hasDescription: info.ok
          ? Boolean(info.description)
          : gbp.description
            ? true
            : null,
        hasHours: info.hasHours ?? gbp.hasHours ?? null,
        hoursText: gbp.hoursText || info.hoursText || '',
        hoursEvidence: info.hoursEvidence,
        hasServices: info.hasServices,
        servicesCount: info.servicesCount,
        infoOk: info.ok,
        hasProducts: info.hasProducts,
        productsEvidence: info.productsEvidence,
        gbpInfoEvidence: info.evidence,
        cid: info.cid || null,
        qaOk: qa.ok,
        hasQa: qa.hasQa,
        qaEvidence: qa.evidence,
        qaQuestionCount: qa.questionCount,
        backlinksCount: backlinks.backlinks,
        referringDomains: backlinks.referringDomains,
        hasBacklinks: backlinks.hasBacklinks,
        backlinksEvidence: backlinks.evidence,
        inOrganicLocal: organic.inOrganic,
        organicPosition: organic.position,
        organicEvidence: organic.evidence,
        duplicateLikely: duplicates.duplicateLikely,
        duplicateEvidence: duplicates.evidence,
        citationConsistency: citations.citationConsistency,
        directoriesPresent: citations.directoriesPresent,
        industryCitations: citations.industryCitations,
        brandMentions: citations.brandMentions,
        citationsEvidence: citations.evidence,
        citationRows: citations.citations,
        geoGridVisible: geoGrid?.inGrid ?? null,
        geoGridPct: geoGrid?.visibilityPct ?? null,
        geoGridEvidence: geoGrid?.evidence || null
      };
      console.log(
        '[auditWorker] Local SEO extras:',
        updates.evidence,
        '|',
        reviews.evidence,
        '|',
        info.evidence,
        '|',
        qa.evidence,
        '|',
        citations.evidence
      );
    }
  } catch (postsErr) {
    console.warn('[auditWorker] Local SEO extras enrich failed:', (postsErr as Error).message);
  }

  lat = audit.gbpLookup?.latitude ?? audit.gbpLookup?.lat ?? null;
  lng = audit.gbpLookup?.longitude ?? audit.gbpLookup?.lng ?? null;
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

  
  const measuredQuery =
    String((audit.gbpLookup?.localRank as { query?: string } | undefined)?.query || '').trim() ||
    packQuery;
  if (measuredQuery) {
    // The Maps view is the profile card's map; no other search screenshots are taken for the report.
    if (profileFound) {
      try {
        const mapsScreenshot = await captureMapsScreenshotFromTask(packTaskId, measuredQuery);
        audit.gbpLookup = {
          ...(audit.gbpLookup || {}),
          mapsScreenshot: { ...mapsScreenshot, query: measuredQuery }
        };
        const mapsShotOk =
          mapsScreenshot?.dataUrl && String(mapsScreenshot.dataUrl).startsWith('data:image/');
        const mapImageUrl = mapsShotOk
          ? mapsScreenshot.dataUrl
          : typeof lat === 'number' && typeof lng === 'number'
            ? await staticMapDataUrl(lat, lng)
            : null;
        if (mapImageUrl) audit.gbpLookup = { ...(audit.gbpLookup || {}), mapImageUrl };
      } catch (shotErr) {
        console.warn('[auditWorker] Maps screenshot failed:', (shotErr as Error).message);
        if (typeof lat === 'number' && typeof lng === 'number') {
          const mapTile = await staticMapDataUrl(lat, lng);
          if (mapTile) audit.gbpLookup = { ...(audit.gbpLookup || {}), mapImageUrl: mapTile };
        }
      }
    }

    try {
      const aiEngineChecks = await checkAiEngineMentionsMulti({
        service,
        city: locationLabel || undefined,
        address: business.address || (audit.gbpLookup as { address?: string } | undefined)?.address,
        website: business.website,
        businessName
      });
      console.log(
        '[auditWorker] AI engine checks:',
        aiEngineChecks.length,
        'rows,',
        aiEngineChecks.map((r) => `${r.label} ${r.mentionCount ?? 0}/${r.answeredCount ?? 0}${r.skipped ? ` (${r.reason})` : ''}`).join(' | ')
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
        city: locationLabel || undefined,
        address: business.address || (audit.gbpLookup as { address?: string } | undefined)?.address
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
            mentionCount: 0,
            answeredCount: 0,
            bestPosition: null,
            brandName: businessName,
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
      resetGeminiCallLog();

      const audit = await getAudit(auditId);
      if (!audit) throw new Error('Audit not found');
      const dataWarnings: string[] = [];
      const intake = readIntake(audit);

      const website = audit.business?.website;
      if (!website) throw new Error('Business website URL is required');

      const crawl = await crawlWebsite(website, { maxPages: 12 });
      if (!crawl.pageCount) dataWarnings.push('The website could not be read; website checks show No');
      let lighthouse = null;
      if (!skipLighthouse) {
        lighthouse = await runLighthouse(crawl.finalUrl || website);
      } else {
        lighthouse = { skipped: true, reason: 'Skipped by operator' };
      }

      const lhMetrics = lighthouse && !(lighthouse as { skipped?: boolean }).skipped ? lighthouse : null;
      if (!lhMetrics) {
        const reason = String((lighthouse as { reason?: string } | null)?.reason || '').trim().slice(0, 160);
        dataWarnings.push(
          `Page speed (Lighthouse) was not measured${reason ? ` (${reason})` : ''}; speed checks show No`
        );
        console.warn('[auditWorker] Lighthouse not measured:', reason);
      }

      if (!requireDataForSeoConfigured()) {
        dataWarnings.push('DataForSEO is not configured: Google Maps, profile and AI checks were not run');
      }
      try {
        await enrichFromDataForSeo(audit, crawl);
        const g = (audit.gbpLookup || {}) as { lookupFailed?: boolean; possibleListing?: { name: string } };
        if (g.lookupFailed) dataWarnings.push('Google Business Profile could not be checked: Google Maps search failed');
        else if (g.possibleListing) {
          dataWarnings.push(
            `Possible Google listing “${g.possibleListing.name}” found by name only; confirm it or add the Maps link and re-run`
          );
        }
      } catch (rankErr) {
        const err = rankErr as Error;
        console.warn('[auditWorker] DataForSEO/GBP enrich failed:', err.message);
        dataWarnings.push(`Google Maps / profile data failed: ${err.message}`);
      }

      // AEO questions: Gemini writes them fresh from the services on the website (or Google Search when the site
      // can't be read). The services read from the crawl are a hint; the fixed wording is only a last resort.
      const { city: aeoCity } = auditContext(audit);
      const aeoCategory = audit.business?.serviceLabel || audit.business?.service;
      const crawledServices = businessServices(extractSiteServices(crawl.pages, {
        businessName: audit.business?.businessName,
        city: aeoCity,
        category: aeoCategory
      }), audit, crawl.pages);
      const aeoAi = await generateAeoQuestions({
        businessName: audit.business?.businessName,
        category: aeoCategory,
        city: aeoCity,
        address: audit.business?.address,
        website: crawl.finalUrl || website,
        pages: crawl.pages,
        siteServices: intake.topServices?.length ? intake.topServices : crawledServices
      }).catch((err: Error) => {
        console.warn('[auditWorker] AEO questions failed:', err?.message || err);
        return null;
      });
      // Services the owner named come first; otherwise the AI-read or crawled services.
      audit.siteServices = intake.topServices?.length
        ? intake.topServices
        : aeoAi?.services.length
          ? aeoAi.services
          : crawledServices;
      addAreaChecks(audit, intake.otherAreas || []);
      const aeoSpecs = aeoAi?.specs ?? buildAeoQuerySpecs(audit);
      audit.aeoQuerySpecs = aeoSpecs;
      console.log(
        '[auditWorker] AEO questions from',
        aeoAi?.source || 'fallback',
        '|',
        aeoSpecs.map((s) => s.query).join(' | ')
      );
      relabelQuestionChecks(audit, aeoSpecs.map((s) => s.query));

      // Google's answer box and People Also Ask for each customer question (search data only, no screenshots).
      if (requireDataForSeoConfigured() && aeoSpecs.length) {
        const g = audit.gbpLookup || {};
        audit.aeoSerpScreenshots = await Promise.all(
          aeoSpecs.map((spec) =>
            (async () => {
              const aeoOpts = { keyword: spec.query, locationName: aeoCity, businessName: audit.business?.businessName, city: aeoCity, website };
              // Google's answers as seen from the town as a whole; the business's own pin is only a fallback.
              const town = aeoCity ? await captureAeoSerpScreenshot({ ...aeoOpts, lat: null, lng: null }) : null;
              if (town?.serpMeasured) return town;
              return captureAeoSerpScreenshot({
                ...aeoOpts,
                lat: typeof g.latitude === 'number' ? g.latitude : null,
                lng: typeof g.longitude === 'number' ? g.longitude : null
              });
            })().catch((err: Error) => ({
              query: spec.query,
              skipped: true,
              reason: err?.message || 'Google results could not be captured',
              capturedAt: new Date().toISOString()
            }))
          )
        );
        const measured = (audit.aeoSerpScreenshots as Array<{ serpMeasured?: boolean }>).filter((s) => s.serpMeasured).length;
        if (measured < aeoSpecs.length) {
          dataWarnings.push(`Google answers were measured for ${measured} of ${aeoSpecs.length} customer questions`);
        }
      } else {
        audit.aeoSerpScreenshots = [];
      }

      applyWebsiteChecks(audit.checklist.checks, crawl, lhMetrics, {
        city: audit.business.searchAreaLabel || audit.business.city,
        postcode: (audit.business as { postcode?: string }).postcode,
        phone: audit.business.phone,
        address: audit.business.address,
        gbpLookup: audit.gbpLookup,
        service: audit.business.serviceLabel || audit.business.service
      });
      evaluatePageChecks(audit, crawl.pages, (audit.siteServices as string[]) || [], aeoCity, crawl.corpus?.text || '', {
        trustedServices: Boolean(intake.topServices?.length)
      });

      try {
        const napPhone = audit.checklist.checks.find((c) => c.id === 'nap_1')?.status;
        const napAddr = audit.checklist.checks.find((c) => c.id === 'nap_2')?.status;
        const g = audit.gbpLookup || {};
        const geoChecklist = buildGeoChecklist({
          businessName: audit.business.businessName,
          website: audit.business.website,
          service: audit.business.serviceLabel || audit.business.service,
          city: audit.business.searchAreaLabel || audit.business.city,
          localRank: g.localRank || null,
          aiEngines: Array.isArray(g.aiEngineChecks) ? g.aiEngineChecks : [],
          crawl: {
            hasLocalBusinessSchema: !!crawl.hasLocalBusinessSchema,
            hasPersonSchema: !!crawl.hasPersonSchema,
            schemaTypes: crawl.schemaTypes || [],
            llmsTxtFound: !!crawl.llmsTxtFound,
            spaHeuristic: crawl.spaHeuristic || null,
            corpusText: crawl.corpus?.text || '',
            hasFaq: !!crawl.hasFaqSchema,
            schemaEntity: crawl.technical?.schemaEntity || null
          } as any,
          gbp: {
            listedOnMaps: g.listedOnMaps === true,
            gbpName: String(g.gbpName || ''),
            address: String(g.address || ''),
            phone: String(g.phone || ''),
            websiteOnGbp: String(g.websiteOnGbp || ''),
            primaryTypeDisplayName: String(g.primaryTypeDisplayName || ''),
            hasBacklinks: g.hasBacklinks === true ? true : g.hasBacklinks === false ? false : null,
            backlinksEvidence: String(g.backlinksEvidence || ''),
            directoriesPresent: typeof g.directoriesPresent === 'boolean' ? g.directoriesPresent : null,
            citationsEvidence: String(g.citationsEvidence || ''),
            brandMentions: typeof g.brandMentions === 'boolean' ? g.brandMentions : null
          },
          sitePhones: crawl.sitePhones || [],
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
        dataWarnings.push(`GEO checklist could not be built: ${err.message}`);
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
        websiteHours: Array.isArray(crawl.websiteHours) ? crawl.websiteHours : [],
        homepageHasTel: Boolean(
          (crawl.pages?.[0]?.telLinks || []).length ||
            (crawl.pages?.[0]?.phonesInText || []).length
        ),
        technical: crawl.technical || null,
        mode: 'deep-crawl'
      };
      audit.lighthouseMeta = lighthouse;

      // One set of facts, then every check, score and sentence is built from it.
      const facts = buildAuditFacts(audit);
      syncChecksWithFacts(audit, facts);

      const aeoChecklist = buildAeoCoreChecklist(audit);
      const localSeoChecklist = buildLocalSeoCoreChecklist(audit);
      audit.score = computeScore(audit.checklist.checks, {
        localRank: audit.gbpLookup?.localRank || null,
        aiEngineChecks: Array.isArray(audit.gbpLookup?.aiEngineChecks) ? audit.gbpLookup.aiEngineChecks : [],
        aeoChecklist,
        aeoQueries: Array.isArray(audit.aeoSerpScreenshots) ? audit.aeoSerpScreenshots : [],
        localSeoChecklist,
        geoChecklist: audit.gbpLookup?.geoChecklist || null
      });

      const narrative = buildNarrative(audit, facts);
      let gemini: any = null;
      if (generateAi !== false) {
        try {
          gemini = await generateDeepAiReport(audit);
        } catch (aiErr) {
          console.warn('[auditWorker] Gemini report failed, rule-based report used:', (aiErr as Error).message);
        }
      }
      audit.aiReport = composeReport(audit, fallbackPillarDecks(audit), narrative, gemini);

      for (const w of geminiWarnings()) dataWarnings.push(w);
      audit.dataWarnings = dataWarnings;

      // Saved as a draft first: saving recalculates the score and the score sentences.
      const wasPublished = audit.published === true;
      audit.status = 'reviewed';
      audit.published = false;
      await saveAudit(audit);

      const gate = validateReport(audit, facts);
      audit.qualityGate = { ...gate, checkedAt: new Date().toISOString(), geminiCalls: geminiCallLog() };
      console.log(
        `[auditWorker] quality gate ${gate.passed ? 'passed' : 'BLOCKED'} | errors: ${gate.errors.join(' | ') || 'none'} | warnings: ${gate.warnings.join(' | ') || 'none'}`
      );
      // A report that fails the gate is never public; it waits in the admin panel with the reasons.
      if (gate.passed && (autoPublish || wasPublished)) {
        audit.status = 'published';
        audit.published = true;
        audit.publishedAt = wasPublished && audit.publishedAt ? audit.publishedAt : new Date().toISOString();
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
