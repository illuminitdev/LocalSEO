export type CoreCheckStatus = 'yes' | 'no' | 'unknown';

export type CoreChecklistItem = {
  id: string;
  label: string;
  status: CoreCheckStatus;
  evidence?: string;
};

export type CoreChecklistGroup = {
  id: string;
  title: string;
  items: CoreChecklistItem[];
};

export type LocalSeoCoreChecklist = {
  title: string;
  groups: CoreChecklistGroup[];
  builtAt?: string;
};

type CheckRow = { id?: string; label?: string; status?: string; evidence?: string; section?: string };

type StatusEv = { status: CoreCheckStatus; evidence: string };

function checkById(checks: CheckRow[], id: string): CheckRow | undefined {
  return checks.find((c) => c.id === id);
}

function checkByLabel(checks: CheckRow[], re: RegExp): CheckRow | undefined {
  return checks.find((c) => re.test(String(c.label || '')));
}

function fromCheck(c: CheckRow | undefined, yesEv?: string, noEv?: string): StatusEv {
  if (!c) return { status: 'unknown', evidence: 'Not measured in this audit' };
  if (c.status === 'pass') return { status: 'yes', evidence: yesEv || c.evidence || 'Pass' };
  if (c.status === 'fail') return { status: 'no', evidence: noEv || c.evidence || 'Fail' };
  return { status: 'unknown', evidence: c.evidence || 'Not confirmed' };
}

function fromBool(v: boolean | null | undefined, yesEv: string, noEv: string, unkEv: string): StatusEv {
  if (v === true) return { status: 'yes', evidence: yesEv };
  if (v === false) return { status: 'no', evidence: noEv };
  return { status: 'unknown', evidence: unkEv };
}

function item(id: string, label: string, se: StatusEv): CoreChecklistItem {
  return { id, label, status: se.status, evidence: se.evidence || '' };
}

function itemFixed(id: string, label: string, status: CoreCheckStatus, evidence: string): CoreChecklistItem {
  return { id, label, status, evidence };
}

/**
 * Local SEO — Core Checklist for the report SEO section.
 * Statuses come from measured audit signals only (never invent passes).
 */
export function buildLocalSeoCoreChecklist(audit: any): LocalSeoCoreChecklist {
  const checks: CheckRow[] = audit?.checklist?.checks || audit?.presence?.checks || [];
  const gbp = audit?.gbpLookup || {};
  const business = audit?.business || {};
  const crawl = audit?.crawlMeta || {};
  const localRank = gbp.localRank || {};
  const nap = Array.isArray(audit?.aiReport?.localSeoFixes?.inconsistencies)
    ? audit.aiReport.localSeoFixes.inconsistencies
    : [];

  const napField = (field: string) => nap.find((c: any) => c.field === field);
  const napOk = (field: string): boolean | null => {
    const c = napField(field);
    if (!c) return null;
    if (c.status === 'match') return true;
    if (c.status === 'mismatch') return false;
    return null;
  };

  const listed = gbp.listedOnMaps === true;
  const inPack = typeof localRank.position === 'number';
  const hasPhotos = Boolean(
    gbp.photosPresent || (Array.isArray(gbp.photoUrls) && gbp.photoUrls.length) || gbp.outsideImageUrl
  );
  const schemaTypes: string[] = Array.isArray(crawl.schemaTypes) ? crawl.schemaTypes : [];
  const hasLocalSchema = schemaTypes.some((t) =>
    /localbusiness|organization|restaurant|dentist|store/i.test(String(t))
  );

  const primaryCat = fromCheck(
    checkByLabel(checks, /primary category/i) || checkById(checks, 'gbp_6'),
    gbp.primaryTypeDisplayName ? `Category: ${gbp.primaryTypeDisplayName}` : undefined
  );
  const primarySe: StatusEv =
    primaryCat.status === 'unknown' && gbp.primaryTypeDisplayName
      ? { status: 'yes', evidence: `Listed as ${gbp.primaryTypeDisplayName}` }
      : primaryCat;

  const photosCheck = fromCheck(
    checkByLabel(checks, /photos updated|photos\b/i) || checkById(checks, 'gbp_13')
  );
  const photosSe: StatusEv =
    photosCheck.status !== 'unknown'
      ? photosCheck
      : fromBool(hasPhotos ? true : listed ? false : null, 'Photos present on listing', 'No photos detected', 'Photos not confirmed');

  const reviewResponseCheck = fromCheck(
    checkByLabel(checks, /responding to reviews|review replies/i) || checkById(checks, 'gbp_11')
  );
  let reviewResponseSe: StatusEv = reviewResponseCheck;
  if (gbp.ownerRepliesLikely === true) {
    reviewResponseSe = { status: 'yes', evidence: gbp.ownerRepliesEvidence || 'Owner replies detected' };
  } else if (gbp.ownerRepliesLikely === false) {
    reviewResponseSe = { status: 'no', evidence: gbp.ownerRepliesEvidence || 'Few or no owner replies' };
  }

  const svcChecks = checks.filter((c) => c.section === 'service_pages');
  let servicePagesSe: StatusEv = { status: 'unknown', evidence: 'Service pages not measured' };
  if (svcChecks.length) {
    const pass = svcChecks.filter((c) => c.status === 'pass').length;
    const fail = svcChecks.filter((c) => c.status === 'fail').length;
    if (pass > 0 && fail === 0) servicePagesSe = { status: 'yes', evidence: `${pass} service page(s) found` };
    else if (fail > 0) servicePagesSe = { status: 'no', evidence: `${fail} service page(s) missing` };
    else servicePagesSe = { status: 'unknown', evidence: 'Service pages inconclusive' };
  }

  const titleSe = fromCheck(checkByLabel(checks, /^seo title$/i) || checkById(checks, 'onpage_1'));
  const metaSe = fromCheck(checkByLabel(checks, /meta description/i) || checkById(checks, 'onpage_2'));
  let titleMetaSe: StatusEv = { status: 'unknown', evidence: 'Title/meta not fully assessed' };
  if (titleSe.status === 'yes' && metaSe.status === 'yes') {
    titleMetaSe = { status: 'yes', evidence: 'Title and meta present' };
  } else if (titleSe.status === 'no' || metaSe.status === 'no') {
    titleMetaSe = { status: 'no', evidence: titleSe.evidence || metaSe.evidence || 'Title/meta gaps' };
  }

  const addrNap = napOk('address');
  const phoneNap = napOk('phone');
  let napSe: StatusEv = { status: 'unknown', evidence: 'NAP not fully confirmed' };
  if (addrNap === true && phoneNap === true) napSe = { status: 'yes', evidence: 'Address and phone match' };
  else if (addrNap === false || phoneNap === false) napSe = { status: 'no', evidence: 'NAP mismatch detected' };

  const schemaCheck = fromCheck(checkByLabel(checks, /schema|structured data|localbusiness/i));
  const schemaSe: StatusEv =
    schemaCheck.status !== 'unknown'
      ? schemaCheck
      : fromBool(
          hasLocalSchema ? true : schemaTypes.length ? false : null,
          `Schema: ${schemaTypes.slice(0, 4).join(', ') || 'LocalBusiness'}`,
          'No LocalBusiness / Organisation schema detected',
          'Schema not measured'
        );

  const mapsVis = fromCheck(checkById(checks, 'maps_vis_2') || checkByLabel(checks, /google maps ranking/i));
  let mapsSe: StatusEv = mapsVis;
  if (mapsVis.status === 'unknown') {
    if (inPack) mapsSe = { status: 'yes', evidence: `Maps / pack #${localRank.position}` };
    else if (localRank.query) mapsSe = { status: 'no', evidence: `Not in top results for “${localRank.query}”` };
    else mapsSe = { status: 'unknown', evidence: 'Maps ranking not measured' };
  }

  const packVis = fromCheck(checkById(checks, 'maps_vis_1') || checkByLabel(checks, /local pack visibility/i));
  let packSe: StatusEv = packVis;
  if (packVis.status === 'unknown') {
    if (inPack) packSe = { status: 'yes', evidence: `In Local Pack at #${localRank.position}` };
    else if (localRank.query) packSe = { status: 'no', evidence: `Not in Local Pack for “${localRank.query}”` };
    else packSe = { status: 'unknown', evidence: 'Local Pack not measured' };
  }

  const top = Array.isArray(localRank.topResults) ? localRank.topResults : [];
  const competitorSe: StatusEv = top.length
    ? { status: 'yes', evidence: `${top.length} competitors captured for measured query` }
    : { status: 'unknown', evidence: 'Competitor pack not captured' };

  const serviceVisSe: StatusEv = localRank.query
    ? {
        status: inPack ? 'yes' : 'no',
        evidence: `Measured query: “${localRank.query}”${inPack ? ` (#${localRank.position})` : ''}`
      }
    : { status: 'unknown', evidence: 'Service-level query not measured' };

  const ratingSe: StatusEv =
    gbp.rating != null
      ? { status: 'yes', evidence: `Average rating ${gbp.rating}` }
      : fromCheck(checkByLabel(checks, /average rating/i) || checkById(checks, 'gbp_9'));

  const reviewCountSe: StatusEv =
    gbp.reviewCount != null
      ? { status: 'yes', evidence: `${gbp.reviewCount} reviews` }
      : fromCheck(checkByLabel(checks, /number of google reviews/i) || checkById(checks, 'gbp_8'));

  return {
    title: 'Local SEO — Core Checklist',
    groups: [
      {
        id: 'gbp',
        title: 'Google Business Profile',
        items: [
          item(
            'core_gbp_name',
            'Business name consistency',
            fromBool(
              napOk('brand'),
              'Brand name aligned across Google and website',
              'Brand name differs between Google and website',
              'Brand consistency not confirmed'
            )
          ),
          item('core_gbp_primary_cat', 'Primary category', primarySe),
          item(
            'core_gbp_secondary_cat',
            'Secondary categories',
            fromCheck(checkByLabel(checks, /secondary categor/i) || checkById(checks, 'gbp_7'))
          ),
          item(
            'core_gbp_description',
            'Business description',
            fromCheck(checkByLabel(checks, /business description/i) || checkById(checks, 'gbp_15'))
          ),
          item(
            'core_gbp_address',
            'Address / service area',
            fromBool(
              napOk('address') ?? (listed && gbp.address ? true : listed === false ? false : null),
              gbp.address || 'Address present on Google',
              'Address missing or mismatched',
              'Address not confirmed'
            )
          ),
          item(
            'core_gbp_phone',
            'Phone number',
            fromBool(
              napOk('phone') ?? (gbp.phone ? true : listed === false ? false : null),
              gbp.phone || 'Phone listed on Google',
              'Phone missing or mismatched',
              'Phone not confirmed'
            )
          ),
          item(
            'core_gbp_website',
            'Website URL',
            fromBool(
              napOk('website') ?? (gbp.websiteOnGbp || business.website ? true : null),
              gbp.websiteOnGbp || business.website || 'Website linked',
              'Website missing or mismatched',
              'Website URL not confirmed'
            )
          ),
          item(
            'core_gbp_hours',
            'Opening hours',
            fromCheck(checkByLabel(checks, /opening hours|hours correct/i) || checkById(checks, 'gbp_16'))
          ),
          item(
            'core_gbp_services',
            'Services',
            fromCheck(checkByLabel(checks, /services\/products|services added/i) || checkById(checks, 'gbp_14'))
          ),
          item(
            'core_gbp_products',
            'Products',
            fromCheck(checkByLabel(checks, /products added|products\b/i))
          ),
          item('core_gbp_photos', 'Photos', photosSe),
          item(
            'core_gbp_posts',
            'Google Posts',
            fromCheck(checkByLabel(checks, /posts being used|google posts/i) || checkById(checks, 'gbp_18'))
          ),
          itemFixed('core_gbp_qa', 'GBP Q&A', 'unknown', 'Q&A not measured automatically'),
          item('core_gbp_rating', 'Review rating', ratingSe),
          item('core_gbp_review_count', 'Review count', reviewCountSe),
          item(
            'core_gbp_review_recency',
            'Review recency',
            fromCheck(checkByLabel(checks, /reviews recent/i) || checkById(checks, 'gbp_10'))
          ),
          item('core_gbp_review_response', 'Review response rate', reviewResponseSe)
        ]
      },
      {
        id: 'website',
        title: 'Website',
        items: [
          item(
            'core_web_landing',
            'Local landing page',
            fromCheck(
              checkByLabel(checks, /location page exists|local landing/i) ||
                checks.find((c) => c.section === 'local_seo' && /location page/i.test(String(c.label || '')))
            )
          ),
          item('core_web_service_pages', 'Service pages', servicePagesSe),
          item(
            'core_web_loc_service',
            'Location + service relevance',
            fromCheck(checkByLabel(checks, /location mentioned|example positioning|where they operate/i))
          ),
          item('core_web_title_meta', 'Title & meta optimisation', titleMetaSe),
          item('core_web_nap', 'NAP consistency', napSe),
          item('core_web_schema', 'Local business schema', schemaSe),
          item(
            'core_web_internal',
            'Internal linking',
            fromCheck(
              checkByLabel(checks, /internal links/i) || checkById(checks, 'loc_qual_5') || checkById(checks, 'onpage_7')
            )
          ),
          item(
            'core_web_faqs',
            'Local FAQs',
            fromCheck(
              checkByLabel(checks, /faq|people also ask/i) || checkById(checks, 'aeo_1') || checkById(checks, 'onpage_10')
            )
          ),
          item(
            'core_web_mobile',
            'Mobile usability',
            fromCheck(checkByLabel(checks, /mobile-friendly|viewport/i) || checkById(checks, 'web_basic_3'))
          ),
          item(
            'core_web_index',
            'Indexability',
            fromCheck(checkByLabel(checks, /index|robots|canonical/i) || checkById(checks, 'tech_1'))
          )
        ]
      },
      {
        id: 'authority',
        title: 'Local Authority',
        items: [
          item('core_auth_citations', 'Citation consistency', fromCheck(checkByLabel(checks, /citation/i))),
          itemFixed(
            'core_auth_duplicates',
            'Duplicate/incorrect listings',
            'unknown',
            'Duplicate listings not measured automatically'
          ),
          item('core_auth_directories', 'Relevant local directories', fromCheck(checkByLabel(checks, /director/i))),
          itemFixed(
            'core_auth_industry',
            'Industry citations',
            'unknown',
            'Industry citations not measured automatically'
          ),
          item('core_auth_backlinks', 'Local backlinks', fromCheck(checkByLabel(checks, /backlink|local link/i))),
          item(
            'core_auth_mentions',
            'Local brand mentions',
            fromCheck(checkByLabel(checks, /brand mention|local publication/i))
          )
        ]
      },
      {
        id: 'visibility',
        title: 'Visibility',
        items: [
          item('core_vis_maps', 'Google Maps ranking', mapsSe),
          item('core_vis_pack', 'Local Pack visibility', packSe),
          itemFixed(
            'core_vis_organic',
            'Local organic ranking',
            'unknown',
            'Organic local ranking not measured in this pass'
          ),
          item('core_vis_competitors', 'Competitor comparison', competitorSe),
          itemFixed('core_vis_geogrid', 'Geo-grid visibility', 'unknown', 'Geo-grid not measured in full audit'),
          item('core_vis_service', 'Service-level visibility', serviceVisSe)
        ]
      }
    ],
    builtAt: new Date().toISOString()
  };
}
