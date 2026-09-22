import { GoogleGenerativeAI } from '@google/generative-ai';

export type CitationAuditResult = {
  ok: boolean;
  score: number | null;
  found: number;
  missing: number;
  mismatch: number;
  citationConsistency: boolean | null;
  directoriesPresent: boolean | null;
  industryCitations: boolean | null;
  brandMentions: boolean | null;
  evidence: string;
  citations: Array<{ directory?: string; status?: string; url?: string; note?: string }>;
};

function extractJson(text: string): any {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

/**
 * Gemini + Google Search citation / directory / brand-mention audit for Local SEO authority rows.
 */
export async function runCitationAudit(opts: {
  businessName: string;
  address?: string;
  phone?: string;
  website?: string;
  city?: string;
  service?: string;
}): Promise<CitationAuditResult> {
  const empty = (ev: string): CitationAuditResult => ({
    ok: false,
    score: null,
    found: 0,
    missing: 0,
    mismatch: 0,
    citationConsistency: null,
    directoriesPresent: null,
    industryCitations: null,
    brandMentions: null,
    evidence: ev,
    citations: []
  });

  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return empty('GEMINI_API_KEY not configured');
  const name = String(opts.businessName || '').trim();
  if (!name) return empty('Missing business name');

  const prompt = `Citation / local authority audit for this real UK business. Use live public web results only. Do not invent listings.
Name: ${name}
Address: ${opts.address || ''}
Phone: ${opts.phone || ''}
Website: ${opts.website || ''}
City: ${opts.city || ''}
Service: ${opts.service || ''}

Check major directories when possible: Google, Apple Maps, Bing Places, Yelp, Facebook, Yellow Pages / Yell, Thomson Local, TripAdvisor, Foursquare, and 1–2 industry-specific directories for this trade.

Return JSON only:
{
  "score": 0,
  "found": 0,
  "missing": 0,
  "mismatch": 0,
  "directoriesPresent": true,
  "industryCitations": true,
  "brandMentions": true,
  "citations": [{"directory": "", "status": "found"|"missing"|"mismatch", "url": "", "note": ""}]
}
score is 0-100. status mismatch means NAP does not match. brandMentions = true if the brand appears on local news/blogs/directories beyond the main site.`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelNames = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'];
    let parsed: any = null;
    let lastErr = '';
    for (const modelName of modelNames) {
      try {
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
          tools: [{ googleSearch: {} }] as any
        });
        const result = await model.generateContent(prompt);
        parsed = extractJson(result.response.text());
        if (parsed) break;
      } catch (err) {
        lastErr = (err as Error)?.message || String(err);
      }
    }
    if (!parsed) return empty(lastErr || 'Gemini citation audit returned no JSON');

    const citations = Array.isArray(parsed.citations) ? parsed.citations : [];
    const found = Number(parsed.found ?? citations.filter((c: any) => c.status === 'found').length) || 0;
    const missing =
      Number(parsed.missing ?? citations.filter((c: any) => c.status === 'missing').length) || 0;
    const mismatch =
      Number(parsed.mismatch ?? citations.filter((c: any) => c.status === 'mismatch').length) || 0;
    const score = typeof parsed.score === 'number' ? parsed.score : null;
    const citationConsistency = mismatch === 0 && found > 0;
    const directoriesPresent =
      typeof parsed.directoriesPresent === 'boolean' ? parsed.directoriesPresent : found >= 2;
    const industryCitations =
      typeof parsed.industryCitations === 'boolean'
        ? parsed.industryCitations
        : citations.some((c: any) => /industry|trade|assoc|chamber/i.test(String(c.directory || c.note || '')));
    const brandMentions =
      typeof parsed.brandMentions === 'boolean' ? parsed.brandMentions : found >= 1;

    return {
      ok: true,
      score,
      found,
      missing,
      mismatch,
      citationConsistency,
      directoriesPresent,
      industryCitations,
      brandMentions,
      evidence: `Citations: ${found} found, ${missing} missing, ${mismatch} NAP mismatch` +
        (score != null ? ` (score ${score})` : ''),
      citations: citations.slice(0, 20)
    };
  } catch (err) {
    return empty((err as Error)?.message || 'Citation audit failed');
  }
}
