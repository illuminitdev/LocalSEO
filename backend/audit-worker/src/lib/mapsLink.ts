export type MapsLinkIds = { placeId?: string; cid?: string; name?: string; url: string };

/** Answers given by the business before the audit (all optional). */
export type AuditIntake = {
  googleMapsUrl?: string;
  noGoogleProfile?: boolean;
  serviceArea?: 'premises' | 'travel' | null;
  topServices?: string[];
  otherAreas?: string[];
  teamSize?: 'solo' | 'small' | 'large' | null;
};

export function readIntake(audit: any): AuditIntake {
  const raw = audit?.intake || audit?.business?.intake || {};
  const list = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : String(v || '').split(/[,\n;]/))
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .slice(0, max);
  return {
    googleMapsUrl: String(raw.googleMapsUrl || '').trim(),
    noGoogleProfile: raw.noGoogleProfile === true,
    serviceArea: raw.serviceArea === 'premises' || raw.serviceArea === 'travel' ? raw.serviceArea : null,
    topServices: list(raw.topServices, 3),
    otherAreas: list(raw.otherAreas, 5),
    teamSize: ['solo', 'small', 'large'].includes(raw.teamSize) ? raw.teamSize : null
  };
}

function idsFrom(url: string): MapsLinkIds {
  const out: MapsLinkIds = { url };
  const decoded = decodeURIComponent(url);
  const cidParam = decoded.match(/[?&]cid=(\d+)/);
  if (cidParam) out.cid = cidParam[1];
  // ...!1s0x48795e7b9d1e2c2f:0x3d5c1f0b1a2e4f6a... — the second hex number is the listing's CID.
  const feature = decoded.match(/0x[0-9a-f]+:(0x[0-9a-f]+)/i);
  if (!out.cid && feature) {
    try {
      out.cid = BigInt(feature[1]).toString();
    } catch {
      /* not a valid hex id */
    }
  }
  const placeId = decoded.match(/(?:query_place_id=|place_id[:=]|!19s)(ChIJ[\w-]+)/);
  if (placeId) out.placeId = placeId[1];
  const name = decoded.match(/\/maps\/place\/([^/@?]+)/);
  if (name) out.name = name[1].replace(/\+/g, ' ').trim();
  return out;
}

/** Place ID / CID / name from a Google Maps link; short links (maps.app.goo.gl, g.page) are followed. */
export async function resolveMapsLink(input: string): Promise<MapsLinkIds | null> {
  let url = String(input || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  let ids = idsFrom(url);
  if (!ids.cid && !ids.placeId) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
      ids = { ...idsFrom(res.url || url), url };
      if (!ids.cid && !ids.placeId) {
        const html = await res.text();
        const inPage = idsFrom(html.slice(0, 200000));
        ids = { ...inPage, ...ids, cid: ids.cid || inPage.cid, placeId: ids.placeId || inPage.placeId, url };
      }
    } catch {
      /* keep what the link itself gave */
    }
  }
  return ids.cid || ids.placeId || ids.name ? ids : null;
}
