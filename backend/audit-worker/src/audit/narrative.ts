import { aiMentionSummary, type AuditFacts } from './auditFacts.js';

type Pillar = 'Local SEO' | 'AEO' | 'GEO';
type Priority = 'Critical' | 'High' | 'Medium';

export type Issue = {
  key: string;
  pillar: Pillar;
  severity: number;
  title: string;
  evidence: string;
  impact: string;
  action: string;
  verify: string;
  where: 'Google Business Profile' | 'Website' | 'Directories and reviews';
  quickWin?: boolean;
};

function priorityOf(severity: number): Priority {
  return severity >= 75 ? 'Critical' : severity >= 45 ? 'High' : 'Medium';
}

function host(u: string): string {
  try {
    return new URL(/^https?:/i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, '');
  } catch {
    return String(u || '').replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  }
}

function stars(rating: number | null, reviews: number | null): string {
  if (rating == null) return reviews != null ? `${reviews} reviews` : 'no rating';
  return `${rating}★ from ${reviews ?? 0} reviews`;
}

function list(items: string[]): string {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs[0] || '';
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

function topCompetitors(f: AuditFacts, n = 3): string {
  return list(
    f.maps.competitors.slice(0, n).map((c) => `${c.name}${c.rating != null ? ` (${stars(c.rating, c.reviewCount)})` : ''}`)
  );
}

/** Every verified gap, worded as issue → evidence → impact → action → check. Only measured facts become issues. */
export function collectIssues(audit: any, f: AuditFacts): Issue[] {
  const issues: Issue[] = [];
  const add = (i: Issue) => issues.push(i);
  const checks = audit?.checklist?.checks || [];
  const failed = (id: string) => checks.find((c: any) => c.id === id)?.status === 'fail';
  const evidenceOf = (id: string) => String(checks.find((c: any) => c.id === id)?.evidence || '');
  const g = audit?.gbpLookup || {};
  const site = host(f.website);
  const phone = String(audit?.business?.phone || f.site.sitePhones[0] || '').trim();
  const q = f.maps.query || `${f.service} in ${f.city}`;
  const brandSearch = f.name.toLowerCase().includes(f.city.toLowerCase()) ? f.name : `${f.name} ${f.city}`;

  // Local SEO — Google Business Profile and Maps
  if (!f.profile.found) {
    const similar = g.similarListing?.name
      ? ` “${g.similarListing.name}” has a similar name but a different ${[
          g.similarListing.phoneConflict && 'phone',
          g.similarListing.websiteConflict && 'website'
        ]
          .filter(Boolean)
          .join(' and ') || 'phone and website'}, so it was not counted as this business.`
      : '';
    add({
      key: 'gbp_missing',
      pillar: 'Local SEO',
      severity: 100,
      title: `No Google Business Profile found for ${f.name}`,
      evidence: `Google Maps was searched for “${brandSearch}” and “${q}”: no listing uses ${site || 'the website'}${phone ? ` or ${phone}` : ''}.${similar}`,
      impact: `The Google Maps 3-pack is where most “${f.service}” searches in ${f.city} end. Without a verified profile the business cannot appear there at all.`,
      action: `Search Google Maps for the business. If a listing exists, claim it at business.google.com and set the website to ${site || 'the main website'}${phone ? ` and the phone to ${phone}` : ''}. If none exists, create one with the exact trading name “${f.name}”, a primary category that matches ${f.service}, and ${f.city} as the service area, then complete Google's verification.`,
      verify: `Search “${brandSearch}” on Google Maps: the listing should show ${site || 'the website'}${phone ? ` and ${phone}` : ''}.`,
      where: 'Google Business Profile'
    });
  } else if (f.maps.measured && f.maps.position == null) {
    add({
      key: 'maps_not_ranked',
      pillar: 'Local SEO',
      severity: 85,
      title: `Not in the top ${f.maps.depth} on Google Maps for “${q}”`,
      evidence: `The profile exists but does not appear in the first ${f.maps.depth} Maps results for “${q}”.${f.maps.competitors.length ? ` The top 3 are ${topCompetitors(f)}.` : ''}`,
      impact: `Searchers rarely scroll past the first few Maps results, so enquiries for ${f.service} in ${f.city} go to the businesses listed above.`,
      action: `On the Google Business Profile, make the primary category the closest match to ${f.service}, list each service you offer, write a description that names ${f.service} and the areas you cover, and add new photos every week. Ask recent customers for a Google review that mentions the job and the town.`,
      verify: `Search “${q}” on Google Maps from ${f.city} and look for the listing in the first ${f.maps.depth} results.`,
      where: 'Google Business Profile'
    });
  } else if (f.maps.position != null && f.maps.position > 3) {
    const third = f.maps.competitors.find((c) => c.position === 3);
    add({
      key: 'maps_outside_pack',
      pillar: 'Local SEO',
      severity: 70,
      title: `#${f.maps.position} on Google Maps for “${q}”, outside the top 3`,
      evidence: `The listing is #${f.maps.position}.${third ? ` #3 is ${third.name} (${stars(third.rating, third.reviewCount)}).` : ''}`,
      impact: 'The top 3 Maps results are shown on the main Google results page and take most of the calls; positions below need an extra click.',
      action: `Close the gap with the businesses above: match their review count with a steady review request after each job, add the services and photos they show, and make sure the website page for ${f.service} names ${f.city}.`,
      verify: `Search “${q}” on Google Maps from ${f.city} and check the position.`,
      where: 'Google Business Profile'
    });
  }

  if (f.profile.found) {
    if (f.nap.phone.status === 'mismatch') {
      add({
        key: 'nap_phone',
        pillar: 'Local SEO',
        severity: 80,
        title: 'Phone number differs between Google and the website',
        evidence: `Google shows ${f.nap.phone.google}; the website shows ${f.nap.phone.website}.`,
        impact: 'Conflicting numbers weaken Google’s trust in the listing and send some callers to a line that may not be answered.',
        action: `Choose one main number and use it in the Google Business Profile, the website header and footer, the contact page and the LocalBusiness schema.`,
        verify: 'The same number appears on the Google listing and on every page of the website.',
        where: 'Google Business Profile',
        quickWin: true
      });
    }
    if (f.nap.website.status === 'mismatch') {
      add({
        key: 'nap_website',
        pillar: 'Local SEO',
        severity: 75,
        title: 'The Google listing links to a different website',
        evidence: `Google links to ${f.nap.website.google}; the business website is ${f.nap.website.website}.`,
        impact: 'Google cannot connect the listing with the website, so the site’s content does not help the Maps ranking.',
        action: `In the Google Business Profile, set the website to ${site}. If the old domain is still live, redirect it to ${site} with a 301 redirect.`,
        verify: `The “Website” button on the Google listing opens ${site}.`,
        where: 'Google Business Profile',
        quickWin: true
      });
    }
    if (f.nap.name.status === 'mismatch') {
      add({
        key: 'nap_name',
        pillar: 'Local SEO',
        severity: 40,
        title: 'Trading name differs between Google and the website',
        evidence: `Google shows “${f.profile.name}”; the website uses “${f.name}”.`,
        impact: 'Two names for one business make it harder for Google and AI tools to treat them as the same company.',
        action: `Use one trading name on the Google listing, the website logo and title, and directory listings. Keep extra keywords out of the Google name, as Google can suspend listings for that.`,
        verify: 'The name on the Google listing matches the website exactly.',
        where: 'Google Business Profile',
        quickWin: true
      });
    }

    const leader = f.maps.competitors[0];
    const reviews = f.profile.reviewCount ?? 0;
    if (leader?.reviewCount != null && reviews < leader.reviewCount * 0.5) {
      add({
        key: 'reviews_gap',
        pillar: 'Local SEO',
        severity: 60,
        title: 'Fewer Google reviews than the Maps leaders',
        evidence: `${reviews} reviews, against ${leader.reviewCount} for ${leader.name} at #${leader.position} for “${q}”.`,
        impact: 'Review count and recency are among the strongest Maps ranking signals and the first thing a searcher compares.',
        action: `Send every finished customer a short Google review link (from the profile’s “Ask for reviews” button) by text the same day${
          f.teamSize === 'large' ? ', make it part of each team member’s job sign-off,' : ''
        } and reply to every review within 48 hours.`,
        verify: 'New reviews arrive every week on the Google listing.',
        where: 'Directories and reviews'
      });
    }
    if (f.profile.rating != null && f.profile.rating < 4.2) {
      add({
        key: 'rating_low',
        pillar: 'Local SEO',
        severity: 65,
        title: `Google rating of ${f.profile.rating}`,
        evidence: `${stars(f.profile.rating, f.profile.reviewCount)}.`,
        impact: 'Many searchers filter out businesses below 4 stars, and Maps favours higher-rated listings.',
        action: 'Reply calmly to each negative review with what was done to fix it, and ask satisfied customers for reviews so recent feedback outweighs the old.',
        verify: 'The average rating rises above 4.2.',
        where: 'Directories and reviews'
      });
    }
    if (f.reviews.replyRate != null && f.reviews.replyRate < 50) {
      add({
        key: 'review_replies',
        pillar: 'Local SEO',
        severity: 45,
        title: 'Most Google reviews have no reply from the owner',
        evidence: `The owner replied to ${f.reviews.replyRate}% of the reviews sampled.`,
        impact: 'Replies show searchers the business is active and give Google more text about the services and area.',
        action: `Reply to every review, naming the job and the town where it fits (e.g. “Thanks for choosing us for your ${f.service.toLowerCase()} in ${f.city}”).`,
        verify: 'Every review on the listing has an owner reply.',
        where: 'Google Business Profile',
        quickWin: true
      });
    }
    if (f.reviews.recent === false) {
      add({
        key: 'reviews_stale',
        pillar: 'Local SEO',
        severity: 45,
        title: 'No recent Google reviews',
        evidence: String(g.reviewRecencyEvidence || 'No reviews in the last 90 days.'),
        impact: 'Recent reviews signal an active business; a quiet profile slips down the Maps results.',
        action: 'Ask each customer for a review when the job is finished, using the profile’s review link.',
        verify: 'At least one new review a week.',
        where: 'Directories and reviews'
      });
    }
    const d = f.gbpDetails;
    // Only fields the public listing shows as empty; a field the data does not include is never called missing.
    const gaps = [
      d.hasDescription === false && 'business description',
      d.hasServices === false && 'services list',
      d.hasSecondaryCategories === false && 'secondary categories',
      d.hasHours === false && 'opening hours'
    ].filter(Boolean) as string[];
    if (gaps.length) {
      const only = gaps.length === 1 ? gaps[0] : '';
      add({
        key: 'gbp_incomplete',
        pillar: 'Local SEO',
        severity: 35 + gaps.length * 5,
        title: `Google Business Profile has no ${list(gaps)}`,
        evidence: `${f.profile.name ? `“${f.profile.name}”` : 'The listing'} shows no ${list(gaps)} on Google${
          f.profile.category && gaps.includes('secondary categories') ? ` (only “${f.profile.category}”)` : ''
        }.`,
        impact:
          only === 'secondary categories'
            ? `Secondary categories let the listing show for related searches, not just “${f.profile.category || f.service}”.`
            : 'Each missing section is a search the listing cannot match and a question a customer cannot answer without calling.',
        action: `In the Google Business Profile editor, add the ${list(gaps)}${
          gaps.includes('secondary categories') ? ` (e.g. every category that describes what you do in ${f.city})` : ''
        }${gaps.includes('business description') ? `; name ${f.service} and ${f.city} in the description` : ''}.`,
        verify: 'Every section of the profile editor is filled in.',
        where: 'Google Business Profile',
        quickWin: true
      });
    }
    if (d.hasRecentPosts === false || d.postsTotal === 0) {
      add({
        key: 'gbp_posts',
        pillar: 'Local SEO',
        severity: 25,
        title: 'No recent Google Posts',
        evidence: String(g.postsEvidence || 'No Google Posts in the last 60 days.'),
        impact: 'Posts keep the listing active and show recent work to people comparing businesses.',
        action: `Post a photo of a finished ${f.service.toLowerCase()} job ${
          f.teamSize === 'solo' ? 'every two weeks (5 minutes from your phone)' : 'every week'
        } with one line about the area.`,
        verify: 'A post dated within the last 7 days on the listing.',
        where: 'Google Business Profile',
        quickWin: true
      });
    }
  }

  // Local SEO — website and technical
  if (f.site.robotsBlocksGoogle) {
    add({
      key: 'robots_block',
      pillar: 'Local SEO',
      severity: 100,
      title: 'robots.txt blocks Google from the website',
      evidence: evidenceOf('tech_7') || 'robots.txt contains Disallow: / for Google.',
      impact: 'Google cannot read the site, so it cannot rank any page of it.',
      action: 'Remove “Disallow: /” from robots.txt (or limit it to private folders) and resubmit the sitemap in Google Search Console.',
      verify: `${site}/robots.txt no longer contains “Disallow: /” for all user agents.`,
      where: 'Website',
      quickWin: true
    });
  }
  if (f.site.noindexPages.length) {
    add({
      key: 'noindex',
      pillar: 'Local SEO',
      severity: 95,
      title: 'Pages tell Google not to index them',
      evidence: `noindex on ${f.site.noindexPages.length} page(s), e.g. ${f.site.noindexPages[0]}.`,
      impact: 'Pages marked noindex never appear in Google.',
      action: 'Remove the noindex meta tag (often a “discourage search engines” setting in the CMS) from every page that should be found.',
      verify: 'The page source no longer contains “noindex”.',
      where: 'Website',
      quickWin: true
    });
  }
  if (f.site.reachable && !f.site.https) {
    add({
      key: 'https',
      pillar: 'Local SEO',
      severity: 70,
      title: 'Website does not use HTTPS',
      evidence: evidenceOf('tech_9') || 'The site loads over http.',
      impact: 'Browsers mark the site “Not secure”, which stops many visitors from sending enquiries.',
      action: 'Install an SSL certificate (free from most hosts) and redirect every http address to https.',
      verify: `https://${site} loads with a padlock.`,
      where: 'Website',
      quickWin: true
    });
  }
  if (failed('web_basic_6')) {
    add({
      key: 'site_phone',
      pillar: 'Local SEO',
      severity: 55,
      title: 'No clear phone number on the website',
      evidence: evidenceOf('web_basic_6'),
      impact: 'Most local customers want to call; a hidden number costs enquiries.',
      action: 'Put the main number in the header of every page as a tap-to-call link (tel:).',
      verify: 'Tapping the number on a phone starts a call.',
      where: 'Website',
      quickWin: true
    });
  }
  const svcFails = checks.filter((c: any) => c.section === 'service_pages' && c.status === 'fail');
  const svcAll = checks.filter((c: any) => c.section === 'service_pages');
  if (svcAll.length && svcFails.length === svcAll.length) {
    add({
      key: 'service_pages',
      pillar: 'Local SEO',
      severity: 55,
      title: `No dedicated ${f.service} page`,
      evidence: `None of the ${f.site.pageCount} pages read is a page about a specific service.`,
      impact: 'Google ranks pages, not businesses: one page per service gives each service a chance to rank.',
      action: `Create one page per main service, each with its own title (e.g. “${f.service} in ${f.city}”), prices or price guidance, photos of real jobs, and a call button.`,
      verify: 'Each main service has its own URL.',
      where: 'Website'
    });
  }
  const locFails = checks.filter((c: any) => /^loc_\d/.test(String(c.id)) && c.status === 'fail');
  if (locFails.length) {
    const areas = locFails.map((c: any) => String(c.label || '').replace(/\s*location page exists\?\s*$/i, '').trim()).filter(Boolean);
    const missingHome = areas.some((a: string) => a.toLowerCase() === f.city.toLowerCase());
    add({
      key: 'location_page',
      pillar: 'Local SEO',
      severity: missingHome ? 50 : 35,
      title: `No page for ${list(areas)}`,
      evidence: `No page on the site names ${list(areas)} in its title, main heading or URL.`,
      impact: `Searches with a town name (“${f.service} ${areas[0]}”) favour pages that are clearly about that town.`,
      action: `Add one page per area (${list(areas)}) describing jobs done there, nearby areas covered and reviews from local customers, linked from the service pages.`,
      verify: `A page with each town in its title and URL.`,
      where: 'Website'
    });
  }
  if (failed('onpage_1')) {
    add({
      key: 'title_tag',
      pillar: 'Local SEO',
      severity: 40,
      title: 'Homepage title does not target the service and town',
      evidence: evidenceOf('onpage_1'),
      impact: 'The title is the main ranking text and the blue headline people click in Google.',
      action: `Rewrite the homepage title to about 55 characters: “${f.service} in ${f.city} | ${f.name}”.`,
      verify: 'The new title shows in Google within a few weeks.',
      where: 'Website',
      quickWin: true
    });
  }
  if (f.site.performance != null && (f.site.performance < 0.5 || (f.site.lcpMs != null && f.site.lcpMs > 4000))) {
    add({
      key: 'speed',
      pillar: 'Local SEO',
      severity: 50,
      title: 'Website is slow on mobile',
      evidence: `Mobile performance ${Math.round(f.site.performance * 100)}/100${f.site.lcpMs != null ? `, main content loads in ${(f.site.lcpMs / 1000).toFixed(1)}s` : ''}.`,
      impact: 'Over half of local searches are on phones; slow pages lose visitors before they see the phone number.',
      action: 'Compress large images (WebP, under 200 KB), remove unused plugins and scripts, and use caching.',
      verify: 'Google PageSpeed Insights shows mobile 70+ and LCP under 2.5s.',
      where: 'Website'
    });
  }
  if (failed('tech_6') && !f.site.robotsBlocksGoogle) {
    add({
      key: 'sitemap',
      pillar: 'Local SEO',
      severity: 30,
      title: 'No working XML sitemap',
      evidence: evidenceOf('tech_6'),
      impact: 'A sitemap helps Google find and refresh every page, especially new service pages.',
      action: 'Generate /sitemap.xml (most CMSs have a setting or plugin), list it in robots.txt and submit it in Google Search Console.',
      verify: `${site}/sitemap.xml lists every page.`,
      where: 'Website',
      quickWin: true
    });
  }
  if (failed('tech_8') && !/no canonical tag/i.test(evidenceOf('tech_8'))) {
    add({
      key: 'canonical',
      pillar: 'Local SEO',
      severity: 70,
      title: 'The homepage canonical tag points to the wrong address',
      evidence: evidenceOf('tech_8'),
      impact: 'The canonical tag tells Google which address is the real page; a wrong one can stop the homepage being indexed or ranked properly.',
      action: `Set the homepage canonical to the full address, e.g. <link rel="canonical" href="https://${site}/">, and use full https:// addresses on every page.`,
      verify: 'View the page source: the canonical starts with https:// and matches the page address.',
      where: 'Website',
      quickWin: true
    });
  }
  if (failed('tech_9') && f.site.https) {
    add({
      key: 'redirects',
      pillar: 'Local SEO',
      severity: 35,
      title: 'Several versions of the website are live',
      evidence: evidenceOf('tech_9'),
      impact: 'Links and ranking signals are split between versions of the same site.',
      action: 'Redirect http and the www / non-www variant to one https address with 301 redirects.',
      verify: 'Every variant lands on the same address.',
      where: 'Website',
      quickWin: true
    });
  }

  // AEO — answers to customer questions
  const questions = f.aeo.questions;
  if (!f.aeo.faqContent) {
    add({
      key: 'faq_missing',
      pillar: 'AEO',
      severity: 60,
      title: 'No FAQ section answering customer questions',
      evidence: `None of the ${f.site.pageCount} pages read has a questions-and-answers section.`,
      impact: 'Google’s People Also Ask boxes and AI answers quote short, direct answers from pages that ask and answer the question.',
      action: `Add an FAQ block to the ${f.service} page answering${questions.length ? `: ${list(questions.map((x) => `“${x}”`))}` : ' the questions customers ask before booking'}. Start each answer with the direct answer in one sentence, then 2–3 sentences of detail, and mention ${f.city} where it is natural.`,
      verify: 'The questions and answers are visible on the page.',
      where: 'Website'
    });
  } else if (!f.aeo.faqSchema) {
    add({
      key: 'faq_schema',
      pillar: 'AEO',
      severity: 30,
      title: 'FAQ content has no FAQPage schema',
      evidence: 'The site has questions and answers, but no FAQPage structured data.',
      impact: 'Structured data helps search engines read the questions and answers; it does not guarantee a rich result.',
      action: 'Add FAQPage JSON-LD that repeats exactly the visible questions and answers.',
      verify: 'Google’s Rich Results Test detects the FAQPage markup.',
      where: 'Website',
      quickWin: true
    });
  }
  if (f.aeo.measuredQuestions > 0 && f.aeo.answerBoxWins === 0 && f.aeo.paaWins === 0) {
    const winners = [
      ...new Set(
        (Array.isArray(audit?.aeoSerpScreenshots) ? audit.aeoSerpScreenshots : [])
          .map((s: any) => (s?.answerBox?.url ? host(s.answerBox.url) : ''))
          .filter(Boolean)
      )
    ] as string[];
    add({
      key: 'answers_absent',
      pillar: 'AEO',
      severity: 55,
      title: 'Not in Google’s answers to customer questions',
      evidence: `For the ${f.aeo.measuredQuestions} questions checked${questions.length ? ` (${list(questions.map((x) => `“${x}”`))})` : ''}, ${f.name} is not in the answer box or People Also Ask${winners.length ? `; the answers come from ${list(winners.slice(0, 3))}` : ''}.`,
      impact: 'These answers sit above the normal results; the business quoted there is the one people see first.',
      action: `Answer each question on its own heading on the ${f.service} page, with a one-sentence answer first and specifics (prices, timescales, ${f.city}) after.`,
      verify: 'Search each question on Google and look for the business in the answer box or People Also Ask.',
      where: 'Website'
    });
  }
  const unanswered = checks.filter((c: any) => String(c.id).startsWith('ai_q_') && c.status === 'fail');
  if (unanswered.length && f.aeo.faqContent) {
    add({
      key: 'questions_unanswered',
      pillar: 'AEO',
      severity: 45,
      title: 'The website does not answer the questions customers ask',
      evidence: `No clear answer on the site for ${list(unanswered.map((c: any) => `“${String(c.question || c.label).replace(/^Content answers:\s*/, '')}”`))}.`,
      impact: 'A page that does not answer the question cannot be chosen as the answer.',
      action: 'Add each missing question as a heading with a direct answer underneath.',
      verify: 'Each question appears on the site with its answer.',
      where: 'Website'
    });
  }
  if (failed('conv_9')) {
    add({
      key: 'pricing',
      pillar: 'AEO',
      severity: 35,
      title: 'No price guidance on the website',
      evidence: 'No prices, “from” prices or price ranges found on the site.',
      impact: `“How much does ${f.service.toLowerCase()} cost in ${f.city}?” is one of the most asked questions; answers without a figure are rarely quoted.`,
      action: 'Publish typical price ranges with what changes the price (size, materials, access).',
      verify: 'A price range is visible on the service page.',
      where: 'Website',
      quickWin: true
    });
  }

  // GEO — AI assistants
  const ai = f.ai;
  if (ai.measured && ai.mentions === 0) {
    const named = [
      ...new Set(
        (Array.isArray(g.aiEngineChecks) ? g.aiEngineChecks : [])
          .flatMap((r: any) => String(r?.answerExcerpt || '').split('\n'))
          .map((l: string) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
          .filter((l: string) => l && l.length < 60)
      )
    ].slice(0, 3) as string[];
    add({
      key: 'ai_absent',
      pillar: 'GEO',
      severity: 75,
      title: `Not named by ChatGPT, Claude or Gemini in any of ${ai.answers} answers`,
      evidence: `0 of ${ai.answers} AI answers named ${f.name} (${aiMentionSummary(f)}) for ${list(ai.prompts.map((p) => `“${p}”`))}.${named.length ? ` They named ${list(named)}.` : ''}`,
      impact: 'More people now ask AI assistants for a local tradesperson; they recommend businesses they find described consistently across the web.',
      action: `Get listed, with the same name, address and phone, on the directories and review sites these answers rely on (e.g. ${list((g.aiEngineChecks || []).flatMap((r: any) => r?.citedHosts || []).filter((h: string, i: number, a: string[]) => a.indexOf(h) === i && !h.includes(host(f.website))).slice(0, 3)) || 'Checkatrade, Yell and Trustpilot'}), and add LocalBusiness schema with sameAs links to those profiles.`,
      verify: `Ask ChatGPT, Claude and Gemini “${ai.prompts[0] || `${f.service} in ${f.city}`}” and check whether ${f.name} is named.`,
      where: 'Directories and reviews'
    });
  } else if (ai.measured && ai.mentions < ai.answers / 2) {
    add({
      key: 'ai_partial',
      pillar: 'GEO',
      severity: ai.mentions <= ai.answers / 4 ? 65 : 50,
      title: `Named in only ${ai.mentions} of ${ai.answers} AI answers`,
      evidence: `${ai.mentions} of ${ai.answers} AI answers named ${f.name} (${aiMentionSummary(f)}).`,
      impact: 'AI answers change from one question to the next; businesses named consistently are the ones mentioned across sources.',
      action: 'Make the business details identical on every directory and review site, and earn mentions on local sites (suppliers, local news, trade bodies).',
      verify: 'Re-run the same prompts monthly and track the count.',
      where: 'Directories and reviews'
    });
  }
  if (f.site.aiCrawlersBlocked.length) {
    add({
      key: 'ai_crawlers',
      pillar: 'GEO',
      severity: 70,
      title: 'AI crawlers are blocked from the website',
      evidence: `robots.txt blocks ${list(f.site.aiCrawlersBlocked)}.`,
      impact: 'Blocked AI tools cannot read the site, so they cannot describe or recommend the business from it.',
      action: `Remove the Disallow rules for ${list(f.site.aiCrawlersBlocked)} in robots.txt.`,
      verify: `${site}/robots.txt allows these crawlers.`,
      where: 'Website',
      quickWin: true
    });
  }
  if (failed('tech_14')) {
    add({
      key: 'local_schema',
      pillar: 'GEO',
      severity: 45,
      title: 'Business details are not marked up for search and AI',
      evidence: evidenceOf('tech_14'),
      impact: 'LocalBusiness schema states the name, address, phone, hours and profiles in a form machines read without guessing.',
      action: `Add LocalBusiness JSON-LD to the homepage with the name, address, phone, opening hours, ${f.city} as areaServed, and sameAs links to the Google listing and directory profiles.`,
      verify: 'Google’s Rich Results Test shows the LocalBusiness data.',
      where: 'Website',
      quickWin: true
    });
  }
  if (g.directoriesPresent === false) {
    add({
      key: 'directories',
      pillar: 'GEO',
      severity: 40,
      title: 'Few local directory listings',
      evidence: String(g.citationsEvidence || 'No local directory listings confirmed.'),
      impact: 'Directories are among the sources AI assistants and Google use to confirm a business is real and local.',
      action: 'Create or claim listings on Yell, Thomson Local, Bing Places, Apple Business Connect and the main trade directory for the sector, with identical details.',
      verify: 'Searching the business name shows these listings.',
      where: 'Directories and reviews'
    });
  }
  if (!f.site.llmsTxt && issues.filter((i) => i.pillar === 'GEO').length < 2) {
    add({
      key: 'llms_txt',
      pillar: 'GEO',
      severity: 15,
      title: 'No llms.txt summary for AI tools',
      evidence: `${site}/llms.txt does not exist.`,
      impact: 'A short plain-text summary of the services and areas is an easy, low-cost signal some AI tools read.',
      action: `Publish /llms.txt with the business name, services, areas covered (${f.city}), phone and key page links.`,
      verify: `${site}/llms.txt loads.`,
      where: 'Website',
      quickWin: true
    });
  }

  return issues.sort((a, b) => b.severity - a.severity);
}

/** Verified positives, strongest first. */
export function collectStrengths(f: AuditFacts): string[] {
  const out: string[] = [];
  const p = f.profile;
  if (p.found && p.rating != null && p.rating >= 4.5 && (p.reviewCount ?? 0) >= 10) {
    out.push(`a ${p.rating}★ Google rating from ${p.reviewCount} reviews`);
  }
  if (p.found && f.maps.position != null && f.maps.position <= 3) {
    out.push(`a top-3 Google Maps position (#${f.maps.position} for “${f.maps.query}”)`);
  }
  if (f.reviews.replyRate != null && f.reviews.replyRate >= 70) {
    out.push(`owner replies on ${f.reviews.replyRate}% of the reviews sampled`);
  }
  if (f.ai.mentions > 0) {
    const engines = f.ai.engines.filter((e) => e.mentions > 0).map((e) => e.label);
    out.push(`named by ${list(engines)} in ${f.ai.mentions} of ${f.ai.answers} AI answers`);
  }
  if (f.aeo.answerBoxWins > 0) out.push(`a Google answer box for ${f.aeo.answerBoxWins} customer question(s)`);
  if (f.site.localSchema) out.push('complete LocalBusiness schema');
  if (f.site.performance != null && f.site.performance >= 0.8) out.push(`a fast mobile site (${Math.round(f.site.performance * 100)}/100)`);
  if (p.found && f.nap.phone.status === 'match' && f.nap.website.status === 'match') out.push('matching phone and website on Google');
  return out.slice(0, 4);
}

/** Up to four issues, covering every pillar that has a real gap. */
export function pickCriticalIssues(issues: Issue[]): Issue[] {
  const top = issues.slice(0, 4);
  for (const pillar of ['Local SEO', 'AEO', 'GEO'] as Pillar[]) {
    if (top.some((i) => i.pillar === pillar)) continue;
    const candidate = issues.find((i) => i.pillar === pillar && i.severity >= 30);
    if (!candidate) continue;
    const counts = new Map<Pillar, number>();
    top.forEach((i) => counts.set(i.pillar, (counts.get(i.pillar) || 0) + 1));
    for (let k = top.length - 1; k >= 0; k--) {
      if ((counts.get(top[k].pillar) || 0) > 1) {
        top[k] = candidate;
        break;
      }
    }
    if (!top.includes(candidate) && top.length < 4) top.push(candidate);
  }
  return top.sort((a, b) => b.severity - a.severity);
}

function asIssueCard(i: Issue) {
  const priority = priorityOf(i.severity);
  return {
    title: i.title,
    detail: i.evidence,
    impact: priority,
    area: i.pillar,
    evidence: i.evidence,
    recommendation: i.action,
    priority,
    why: i.impact,
    verify: i.verify,
    where: i.where
  };
}

function asAction(i: Issue) {
  return {
    priority: priorityOf(i.severity),
    title: i.title,
    detail: i.evidence,
    howTo: i.action,
    issue: i.title,
    evidence: i.evidence,
    impact: i.impact,
    recommendation: `${i.action} Check: ${i.verify}`
  };
}

function pillarSentence(pillar: Pillar, f: AuditFacts, issues: Issue[]): string {
  const own = issues.filter((i) => i.pillar === pillar);
  if (pillar === 'Local SEO') {
    const rank = !f.profile.found
      ? `No Google Business Profile matches ${f.name}, so it cannot appear in Google Maps for “${f.maps.query || f.service}”`
      : f.maps.position != null
        ? `${f.name} is #${f.maps.position} on Google Maps for “${f.maps.query}”`
        : `${f.name} is not in the top ${f.maps.depth} on Google Maps for “${f.maps.query}”`;
    const next = own.find((i) => !['gbp_missing', 'maps_not_ranked', 'maps_outside_pack'].includes(i.key));
    return `${rank}${next ? `; the next fix is: ${next.title.charAt(0).toLowerCase()}${next.title.slice(1)}` : ''}.`;
  }
  if (pillar === 'AEO') {
    const answers =
      f.aeo.measuredQuestions > 0
        ? `${f.name} is in Google’s answers for ${Math.max(f.aeo.answerBoxWins, f.aeo.paaWins)} of ${f.aeo.measuredQuestions} customer questions checked`
        : `Google’s answers to customer questions could not be checked on this run`;
    const faq = f.aeo.faqContent
      ? f.aeo.faqSchema
        ? 'the site has FAQ content with FAQPage schema'
        : 'the site has FAQ content but no FAQPage schema'
      : 'the site has no FAQ section';
    return `${answers}, and ${faq}.`;
  }
  if (!f.ai.measured) return 'ChatGPT, Claude and Gemini answers could not be collected on this run.';
  return `ChatGPT, Claude and Gemini named ${f.name} in ${f.ai.mentions} of ${f.ai.answers} answers (${aiMentionSummary(f)}) for local ${f.service} prompts in ${f.city}.`;
}

export type Narrative = ReturnType<typeof buildNarrative>;

/** The written report, built only from facts. Gemini, when it works, may not change any of these fields. */
export function buildNarrative(audit: any, f: AuditFacts) {
  const issues = collectIssues(audit, f);
  const strengths = collectStrengths(f);
  const critical = pickCriticalIssues(issues);
  const fixes = [...issues].sort((a, b) => b.severity + (b.quickWin ? 10 : 0) - (a.severity + (a.quickWin ? 10 : 0))).slice(0, 3);
  const byPillar = (p: Pillar) => issues.filter((i) => i.pillar === p);

  // Summary is gaps only: the two biggest verified gaps of each pillar, no strengths and no neutral lines.
  // "FAQ content…" keeps its capitals; only an ordinary first word is lower-cased.
  const lower = (s: string) => (/^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  const gapSentence = (p: Pillar) => {
    const top = byPillar(p).slice(0, 2).map((i) => lower(i.title));
    return top.length ? `${p}: ${list(top)}.` : '';
  };
  const summaryLines = (['Local SEO', 'AEO', 'GEO'] as Pillar[]).map(gapSentence).filter(Boolean);

  const roadmap = [
    { month: 1, title: 'Google profile and website basics', items: byPillar('Local SEO').slice(0, 4).map((i) => i.action) },
    { month: 2, title: 'Answers to customer questions', items: byPillar('AEO').slice(0, 4).map((i) => i.action) },
    { month: 3, title: 'AI visibility', items: byPillar('GEO').slice(0, 4).map((i) => i.action) }
  ].filter((m) => m.items.length);

  return {
    issues,
    strengths,
    headline: `${f.name}: local search audit for ${f.service} in ${f.city}`,
    executiveSummary: summaryLines.join(' '),
    pillarComments: {
      local_seo: pillarSentence('Local SEO', f, issues),
      aeo: pillarSentence('AEO', f, issues),
      geo: pillarSentence('GEO', f, issues)
    },
    criticalIssues: critical.map(asIssueCard),
    findings: issues.slice(4, 10).map(asIssueCard),
    priorityFixes: fixes.map((i) => ({
      title: i.title,
      why: i.impact,
      action: i.action,
      suggestedPackage: i.pillar === 'Local SEO' ? 'Local Presence' : 'Local Growth',
      issue: i.title,
      evidence: i.evidence,
      impact: priorityOf(i.severity),
      recommendation: i.action,
      priority: priorityOf(i.severity)
    })),
    roadmap,
    nextSteps: [
      critical[0] && `Fix first: ${critical[0].title}.`,
      fixes.find((i) => i.quickWin) && `Quick win this week: ${fixes.find((i) => i.quickWin)!.title}.`,
      'Book a free 15-minute walkthrough to confirm each finding and agree the order of work.',
      'Re-run this audit in 60 days to measure the change.'
    ].filter(Boolean) as string[],
    gbpNote: f.profile.found
      ? `Google listing matched on ${[
          f.nap.phone.status === 'match' && 'phone',
          f.nap.website.status === 'match' && 'website',
          'name and town'
        ]
          .filter(Boolean)
          .join(', ')}: “${f.profile.name}”.`
      : audit?.gbpLookup?.similarListing?.name
        ? `“${audit.gbpLookup.similarListing.name}” appears on Google Maps with a similar name but different contact details, so it is treated as a different business.`
        : `No Google listing with ${f.name}’s website or phone was found in ${f.city}.`,
    closingLine: 'Book a free 15-minute walkthrough: we will confirm each finding with you and agree the first three fixes.',
    offerLine: 'ZappSites can make these fixes for you on a clear monthly plan, or guide your team through them.',
    decks: {
      local: {
        takeaway: pillarSentence('Local SEO', f, issues),
        actions: byPillar('Local SEO').slice(0, 4).map(asAction)
      },
      aeo: {
        visualIntro: `Questions Google shows in “People also ask” for ${f.service} in ${f.city} whose answer is a business or brand.`,
        opportunity: pillarSentence('AEO', f, issues),
        priorities: byPillar('AEO').slice(0, 4).map(asAction)
      },
      geo: {
        visualIntro: `Whether ChatGPT, Claude and Gemini name ${f.name} when asked ${list(f.ai.prompts.map((p) => `“${p}”`)) || `for ${f.service} in ${f.city}`}.`,
        goalLine: `Get ${f.name} named by ChatGPT, Claude and Gemini for ${f.service} in ${f.city}.`,
        verifyHint: `Ask ChatGPT, Claude and Gemini: ${list(f.ai.prompts.map((p) => `“${p}”`)) || `“best ${f.service} in ${f.city}”`}.`,
        opportunity: pillarSentence('GEO', f, issues),
        actions: byPillar('GEO').slice(0, 4).map(asAction)
      }
    }
  };
}

const BANDS: Array<[number, string]> = [
  [80, 'is in a strong position; the fixes below protect and extend it'],
  [65, 'has a good foundation with a few clear gaps'],
  [45, 'has clear gaps that are holding back local enquiries'],
  [0, 'is hard to find in local search today, and the fixes below are the quickest route in']
];

/** Score sentences, written from the saved score so the text and the numbers always agree. */
export function scoreText(audit: any): { overallVerdict: string; scoreComment: string } {
  const s = audit?.score || {};
  const total = Number(s.total);
  if (!Number.isFinite(total)) return { overallVerdict: '', scoreComment: '' };
  const name = String(audit?.business?.businessName || 'The business').trim();
  const band = (BANDS.find(([min]) => total >= min) || BANDS[BANDS.length - 1])[1];
  return {
    overallVerdict: `${name} ${band}.`,
    // The score breakdown line is not shown in reports (the score boxes already show it).
    scoreComment: ''
  };
}

/**
 * Final report: deck data (checklists, Maps results, AI rows) with the written text from the narrative.
 * A Gemini report is only used for the roadmap when the facts give none.
 */
export function composeReport(audit: any, decks: any, narrative: Narrative, gemini: any | null) {
  const n = narrative;
  const geminiRoadmap = Array.isArray(gemini?.roadmap) && gemini.roadmap.length >= 3 ? gemini.roadmap : null;
  return {
    generatedAt: new Date().toISOString(),
    model: gemini?.model ? `rules+${gemini.model}` : 'rules',
    kind: 'deep-local-aeo-geo',
    headline: n.headline,
    executiveSummary: n.executiveSummary,
    ...scoreText(audit),
    pillarComments: n.pillarComments,
    strengths: n.strengths,
    criticalIssues: n.criticalIssues,
    findings: n.findings,
    priorityFixes: n.priorityFixes,
    roadmap: n.roadmap.length ? n.roadmap : geminiRoadmap || [],
    nextSteps: n.nextSteps,
    gbpNote: n.gbpNote,
    offerLine: n.offerLine,
    closingLine: n.closingLine,
    localSeoFixes: {
      ...decks.localSeoFixes,
      takeaway: n.decks.local.takeaway,
      actions: n.decks.local.actions
    },
    aeoFixes: {
      ...decks.aeoFixes,
      visualIntro: n.decks.aeo.visualIntro,
      opportunity: n.decks.aeo.opportunity,
      priorities: n.decks.aeo.priorities
    },
    geoFixes: {
      ...decks.geoFixes,
      title: 'GEO: AI mentions and citations',
      visualIntro: n.decks.geo.visualIntro,
      goalLine: n.decks.geo.goalLine,
      verifyHint: n.decks.geo.verifyHint,
      opportunity: n.decks.geo.opportunity,
      actions: n.decks.geo.actions
    }
  };
}
