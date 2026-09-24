export type AeoCheckStatus = 'yes' | 'no' | 'unknown';

export type AeoChecklistItem = {
  id: string;
  label: string;
  status: AeoCheckStatus;
  evidence?: string;
};

export type AeoChecklistGroup = {
  id: string;
  title: string;
  items: AeoChecklistItem[];
};

export type AeoCoreChecklist = {
  title: string;
  principle: string;
  groups: AeoChecklistGroup[];
  builtAt?: string;
};

type CheckRow = { id?: string; label?: string; status?: string; evidence?: string; section?: string };

type StatusEv = { status: AeoCheckStatus; evidence: string };

function checkById(checks: CheckRow[], id: string): CheckRow | undefined {
  return checks.find((c) => c.id === id);
}

function fromCheck(c: CheckRow | undefined, yesEv?: string, noEv?: string): StatusEv {
  if (!c) return { status: 'no', evidence: noEv || 'Not found / not confirmed' };
  if (c.status === 'pass') return { status: 'yes', evidence: yesEv || c.evidence || 'Pass' };
  if (c.status === 'fail') return { status: 'no', evidence: noEv || c.evidence || 'Fail' };
  return { status: 'no', evidence: noEv || c.evidence || 'Not found / not confirmed' };
}

function fromBool(v: boolean | null | undefined, yesEv: string, noEv: string, _unkEv?: string): StatusEv {
  if (v === true) return { status: 'yes', evidence: yesEv };
  return { status: 'no', evidence: noEv };
}

function item(id: string, label: string, se: StatusEv): AeoChecklistItem {
  return { id, label, status: se.status, evidence: se.evidence || '' };
}

function anyPass(checks: CheckRow[], ids: string[]): boolean {
  return ids.some((id) => checkById(checks, id)?.status === 'pass');
}

function prefer(...ses: StatusEv[]): StatusEv {
  const yes = ses.find((s) => s.status === 'yes');
  if (yes) return yes;
  const no = ses.find((s) => s.status === 'no');
  if (no) return no;
  return ses[0] || { status: 'no', evidence: 'Not found / not confirmed' };
}

/**
 * Local AEO — Core Checklist for the report AEO section.
 * Statuses come from measured audit signals only (never invent passes).
 */
export function buildAeoCoreChecklist(audit: any): AeoCoreChecklist {
  const checks: CheckRow[] = audit?.checklist?.checks || audit?.presence?.checks || [];
  const gbp = audit?.gbpLookup || {};
  const business = audit?.business || {};
  const localRank = gbp.localRank || {};
  const nap = Array.isArray(audit?.aiReport?.localSeoFixes?.inconsistencies)
    ? audit.aiReport.localSeoFixes.inconsistencies
    : [];

  const service =
    String(business.serviceLabel || business.service || '').trim() || 'local services';
  const city =
    String(business.searchAreaLabel || business.city || '').trim() || 'the local area';
  const inPack = typeof localRank.position === 'number';
  const measuredQuery = String(localRank.query || '').trim();

  const aeo1 = fromCheck(checkById(checks, 'aeo_1'), 'FAQPage schema found', 'No FAQPage schema');
  const aeo2 = fromCheck(checkById(checks, 'aeo_2'), 'Visible FAQ / Q&A blocks', 'No visible FAQ / Q&A blocks');
  const aeo3 = fromCheck(
    checkById(checks, 'aeo_3'),
    'Answers common service questions',
    'Weak coverage of common service questions'
  );
  const aeo4 = fromCheck(
    checkById(checks, 'aeo_4'),
    'Near-me / best local question readiness',
    'Not ready for near-me / best local questions'
  );
  const onpageFaq = fromCheck(checkById(checks, 'onpage_10'), 'FAQ content found', 'No FAQ content');
  const pricing = fromCheck(checkById(checks, 'conv_9'), 'Pricing guidance on site', 'No pricing guidance on site');
  const quoteCta = fromCheck(checkById(checks, 'conv_4'), 'Quote / estimate CTA present', 'No quote / estimate CTA');
  const contactForm = fromCheck(checkById(checks, 'conv_5'), 'Contact form present', 'No contact form');
  const phoneVis = fromCheck(checkById(checks, 'conv_1'), 'Phone visible', 'Phone not visible');
  const telLinks = fromCheck(checkById(checks, 'conv_2'), 'Click-to-call links', 'No tel: links');
  const serviceAreas = fromCheck(checkById(checks, 'conv_8'), 'Service areas stated', 'Service areas not clear');
  const testimonials = fromCheck(checkById(checks, 'conv_11'), 'Testimonials on site', 'No testimonials');
  const reviewsMention = fromCheck(
    checkById(checks, 'conv_12'),
    'Google reviews mentioned on site',
    'Reviews not mentioned on site'
  );
  const trust = fromCheck(checkById(checks, 'conv_10'), 'Trust / accreditation signals', 'No trust badges / accreditations');
  const aboutEntity = fromCheck(
    checkById(checks, 'geo_4'),
    'About / entity authority content',
    'Weak about / entity authority content'
  );

  const aiQPass = checks.filter((c) => String(c.id).startsWith('ai_q_') && c.status === 'pass').length;
  const aiQFail = checks.filter((c) => String(c.id).startsWith('ai_q_') && c.status === 'fail').length;
  const aiQSe: StatusEv =
    aiQPass >= 2
      ? { status: 'yes', evidence: `${aiQPass} content answer checks passed` }
      : {
          status: 'no',
          evidence: aiQPass
            ? `Only ${aiQPass} content answer check(s) passed`
            : 'Content answer checks not confirmed'
        };

  const svcChecks = checks.filter((c) => c.section === 'service_pages');
  let servicePagesSe: StatusEv = { status: 'no', evidence: 'No service pages found' };
  if (svcChecks.length) {
    const pass = svcChecks.filter((c) => c.status === 'pass').length;
    const fail = svcChecks.filter((c) => c.status === 'fail').length;
    if (pass > 0 && fail === 0) servicePagesSe = { status: 'yes', evidence: `${pass} service page(s) found` };
    else if (fail > 0) servicePagesSe = { status: 'no', evidence: `${fail} service page gap(s)` };
  }

  const locSe = fromCheck(
    checkById(checks, 'loc_qual_1') ||
      checks.find((c) => /location mentioned|where they operate|local landing/i.test(String(c.label || ''))),
    'Location / area content present',
    'Location / area content weak'
  );

  const hoursSe: StatusEv =
    gbp.hasHours === true
      ? { status: 'yes', evidence: gbp.hoursEvidence || 'Opening hours on Google' }
      : gbp.hasHours === false
        ? { status: 'no', evidence: gbp.hoursEvidence || 'No opening hours on GBP' }
        : fromCheck(
            checks.find((c) => /opening hours|hours correct/i.test(String(c.label || ''))) ||
              checkById(checks, 'gbp_16'),
            'Opening hours present',
            'Opening hours missing'
          );

  const napMismatch = nap.some((c: any) => c?.status === 'mismatch');
  const napMatch =
    nap.length > 0 && nap.every((c: any) => c?.status === 'match' || c?.status === 'unknown');
  const napSe: StatusEv = napMismatch
    ? { status: 'no', evidence: 'NAP mismatch between Google and website' }
    : napMatch
      ? { status: 'yes', evidence: 'Business information consistent across Google and website' }
      : { status: 'no', evidence: 'Business information consistency not confirmed' };

  const reviewProofSe: StatusEv =
    gbp.reviewCount != null && Number(gbp.reviewCount) > 0
      ? {
          status: 'yes',
          evidence: `${gbp.reviewCount} Google reviews${gbp.rating != null ? `, rated ${gbp.rating}` : ''}`
        }
      : prefer(testimonials, reviewsMention);

  const nearMeSe: StatusEv = measuredQuery
    ? inPack
      ? { status: 'yes', evidence: `In measured local results for “${measuredQuery}” (#${localRank.position})` }
      : { status: 'no', evidence: `Not in measured local results for “${measuredQuery}”` }
    : prefer(aeo4, fromCheck(checkById(checks, 'geo_5')));

  const bestSe: StatusEv = prefer(
    aeo4,
    fromBool(
      inPack ? true : measuredQuery ? false : false,
      `Visible for measured local query “${measuredQuery || `best ${service} near ${city}`}”`,
      `Not visible for measured “best / near” style local query`,
      'Not found for the local best / near query'
    )
  );

  const bookingSe = prefer(contactForm, telLinks, phoneVis, quoteCta);

  // SERP answer surfaces are not positively measured for this brand — treat as gaps.
  const noAnswerSurface: StatusEv = {
    status: 'no',
    evidence: 'Not winning measured answer surfaces for local questions'
  };
  const competitorCompareSe: StatusEv = Array.isArray(localRank.topResults) && localRank.topResults.length
    ? {
        status: 'no',
        evidence: `Competitors captured for “${measuredQuery || 'local query'}” — brand not shown as the answer winner`
      }
    : noAnswerSurface;

  const faqCoverage = prefer(aeo2, onpageFaq, aeo1);
  const servicePlusLoc = prefer(
    fromBool(
      anyPass(checks, ['aeo_3']) && (serviceAreas.status === 'yes' || locSe.status === 'yes'),
      `Service + location content for ${service} in ${city}`,
      'Service + location content incomplete',
      'Service + location content not confirmed'
    ),
    servicePagesSe,
    serviceAreas,
    locSe
  );

  const directAnswer = prefer(aeo3, aiQSe, aeo2);
  const conciseClear = prefer(aeo2, aeo1, aiQSe);
  const serviceExplained = prefer(aeo3, servicePagesSe, aiQSe);
  const locationStated = prefer(serviceAreas, locSe, nearMeSe);
  const supportingBiz = prefer(aboutEntity, trust, phoneVis);

  return {
    title: 'Local AEO — Core Checklist',
    principle: 'Answer real local questions clearly so search and AI can cite this business.',
    builtAt: new Date().toISOString(),
    groups: [
      {
        id: 'question_coverage',
        title: 'Question Coverage',
        items: [
          item('aeo_qc_service', 'Service questions', prefer(aeo3, aiQSe, servicePagesSe)),
          item('aeo_qc_location', 'Location questions', prefer(serviceAreas, locSe)),
          item('aeo_qc_near_me', '"Near me" questions', nearMeSe),
          item('aeo_qc_best', '"Best" questions', bestSe),
          item('aeo_qc_pricing', 'Pricing questions', pricing),
          item('aeo_qc_hours', 'Availability/opening-hours questions', hoursSe),
          item('aeo_qc_booking', 'Booking/contact questions', bookingSe),
          item('aeo_qc_service_specific', 'Service-specific questions', prefer(aeo3, aiQSe, aeo4))
        ]
      },
      {
        id: 'answer_readiness',
        title: 'Answer Readiness',
        items: [
          item('aeo_ar_direct', 'Direct answer available', directAnswer),
          item('aeo_ar_concise', 'Answer is concise and clear', conciseClear),
          item('aeo_ar_service', 'Service clearly explained', serviceExplained),
          item('aeo_ar_location', 'Location/service area clearly stated', locationStated),
          item('aeo_ar_pricing', 'Pricing information where relevant', pricing),
          item('aeo_ar_faqs', 'FAQs available', faqCoverage),
          item('aeo_ar_supporting', 'Supporting business information available', supportingBiz)
        ]
      },
      {
        id: 'aeo_visibility',
        title: 'AEO Visibility',
        items: [
          item('aeo_vis_ai', 'Google AI/search answer visibility', noAnswerSurface),
          item('aeo_vis_snippet', 'Featured snippet visibility', noAnswerSurface),
          item('aeo_vis_paa', 'People Also Ask visibility', noAnswerSurface),
          item('aeo_vis_local_q', 'Local question visibility', nearMeSe),
          item('aeo_vis_competitor', 'Question-level competitor comparison', competitorCompareSe)
        ]
      },
      {
        id: 'content_signals',
        title: 'Content Signals',
        items: [
          item('aeo_cs_faq', 'FAQ coverage', faqCoverage),
          item('aeo_cs_svc_loc', 'Service + location content', servicePlusLoc),
          item('aeo_cs_consistency', 'Business information consistency', napSe),
          item('aeo_cs_reviews', 'Review/customer proof', reviewProofSe),
          item('aeo_cs_authority', 'Authoritative supporting content', prefer(aboutEntity, trust, aeo3))
        ]
      }
    ]
  };
}
