import type { AuditFacts } from './auditFacts.js';

const UK_TOWNS = [
  'London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Sheffield', 'Bristol', 'Glasgow', 'Edinburgh',
  'Cardiff', 'Belfast', 'Newcastle', 'Nottingham', 'Leicester', 'Coventry', 'Bradford', 'Hull', 'Stoke',
  'Wolverhampton', 'Derby', 'Southampton', 'Portsmouth', 'Plymouth', 'Reading', 'Oxford', 'Cambridge', 'York',
  'Salford', 'Stockport', 'Bolton', 'Oldham', 'Wigan', 'Preston', 'Blackburn', 'Huddersfield', 'Wakefield',
  'Doncaster', 'Sunderland', 'Middlesbrough', 'Milton Keynes', 'Northampton', 'Norwich', 'Ipswich', 'Brighton',
  'Swansea', 'Aberdeen', 'Dundee', 'Exeter', 'Bath', 'Gloucester', 'Cheltenham', 'Swindon', 'Luton', 'Watford',
  'Maidenhead', 'Slough', 'Trafford', 'Rochdale', 'Bury', 'Warrington', 'Chester', 'Lincoln', 'Peterborough'
];

const PLACEHOLDERS = [
  /is professional service worth it/i,
  /how do i choose a local tradesperson/i,
  /\bundefined\b|\bNaN\b|\[object Object\]|\{\{|\}\}/,
  /\b(local services|local business) (in|near) the local area\b/i,
  /perplexity/i,
  /losing (ai )?(search )?customers|losing (enquiries|business|revenue)/i
];

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    if (!value.startsWith('data:')) out.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((v) => strings(v, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      // Third-party text (AI answers, Google answers, competitor rows) is quoted, not written by us.
      if (
        ['mapImageUrl', 'photoUrls', 'outsideImageUrl', 'answerExcerpt', 'peopleAlsoAsk', 'answerBox', 'organic', 'mapsResults', 'results', 'competitorsDetailed', 'competitorsShown'].includes(k)
      ) {
        continue;
      }
      strings(v, out);
    }
  }
  return out;
}

/**
 * Consistency rules run before a report can be published. Any error keeps the report as a draft for review;
 * warnings are shown to the admin but do not block.
 */
export function validateReport(audit: any, f: AuditFacts): { passed: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const report = audit?.aiReport || {};
  const text = strings(report).join('\n');
  const checks = [...(audit?.presence?.checks || []), ...(audit?.checklist?.checks || [])];
  const status = (id: string) => checks.find((c: any) => c.id === id)?.status;

  // Profile and Maps must tell one story.
  const listedCheck = status('presence_maps_listed') ?? status('gbp_1');
  if (f.profile.found && listedCheck === 'fail') errors.push('Google listing is shown, but a check says no profile was found');
  if (!f.profile.found && listedCheck === 'pass') errors.push('No Google listing matched, but a check says the business is listed');
  if (!f.profile.found && audit?.gbpLookup?.localRank?.position != null) {
    errors.push('A Maps position is stored for a business with no matched Google listing');
  }
  if (f.maps.position != null && f.maps.position <= 3 && /missing from (the )?top|not in the (top|local) (3|three|pack)/i.test(text)) {
    errors.push(`The report says the business is missing from the top results, but it is #${f.maps.position}`);
  }
  if (!f.profile.found && /\b(appears|ranks|is) (at )?#\d+ (on|in) Google Maps/i.test(text)) {
    errors.push('The report gives a Maps position for a business with no matched Google listing');
  }

  // One town only.
  const home = f.city.toLowerCase();
  const address = String(audit?.business?.address || '').toLowerCase();
  const competitorText = f.maps.competitors.map((c) => c.name.toLowerCase()).join(' ');
  const covered = f.otherAreas.map((a) => a.toLowerCase()).join(' | ');
  for (const town of UK_TOWNS) {
    const t = town.toLowerCase();
    if (t === home || home.includes(t) || address.includes(t) || competitorText.includes(t) || covered.includes(t)) continue;
    if (new RegExp(`\\b${t}\\b`, 'i').test(text)) errors.push(`The report mentions ${town}, but the audit is for ${f.city}`);
  }

  // Scores in text must match the saved score.
  const total = Number(audit?.score?.total);
  for (const m of text.matchAll(/\b(?:overall|score)[^.\d]{0,20}(\d{1,3})\s*\/\s*100/gi)) {
    if (Number.isFinite(total) && Number(m[1]) !== total) errors.push(`The text says ${m[1]}/100 but the score is ${total}/100`);
  }

  // AI wording must match the counts.
  if (f.ai.mentions > 0 && /(absent|missing) from (all )?ai|not (named|mentioned) by (any|chatgpt, claude or gemini)/i.test(text)) {
    errors.push(`The report says the business is absent from AI answers, but it was named in ${f.ai.mentions}`);
  }

  for (const re of PLACEHOLDERS) {
    const m = text.match(re);
    if (m) errors.push(`Template or banned wording in the report: “${m[0]}”`);
  }
  for (const m of text.matchAll(/\b([A-Z][a-z]+)( · \1){2,}/g)) errors.push(`Repeated placeholder text: “${m[0]}”`);

  const comments = report.pillarComments || {};
  for (const key of ['local_seo', 'aeo', 'geo']) {
    if (!String(comments[key] || '').trim()) errors.push(`The ${key.replace('_', ' ')} summary is empty`);
  }
  for (const issue of Array.isArray(report.criticalIssues) ? report.criticalIssues : []) {
    if (!String(issue?.evidence || '').trim()) errors.push(`Critical issue “${issue?.title}” has no evidence`);
  }

  if (!f.site.reachable) warnings.push('The website could not be read, so website checks show No');
  if (!f.maps.measured) warnings.push('Google Maps ranking was not measured');
  if (!f.ai.measured) warnings.push('AI answers (ChatGPT, Claude, Gemini) could not be collected');
  if (f.aeo.measuredQuestions === 0) warnings.push('Google answers to customer questions were not measured');
  for (const w of Array.isArray(audit?.dataWarnings) ? audit.dataWarnings : []) warnings.push(String(w));

  return { passed: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}
