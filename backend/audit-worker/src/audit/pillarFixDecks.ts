import { buildLocalSeoFixes } from './localSeoDeck.js';
import { buildAeoFixes } from './aeoDeck.js';
import { buildGeoFixes } from './geoDeck.js';

export { buildLocalSeoInconsistencies, buildLocalSeoFixes } from './localSeoDeck.js';
export {
  buildAeoQuerySpecs,
  buildAeoQueryCards,
  buildAeoFixes,
  type AeoQueryIntent,
  type AeoQuerySpec
} from './aeoDeck.js';
export { buildGeoFixes } from './geoDeck.js';
export {
  auditContext,
  toActions,
  mapsResultsFromAudit,
  measuredQueryFromAudit,
  inPackFromAudit,
  failedChecks
} from './deckShared.js';

export function fallbackPillarDecks(audit) {
  return {
    localSeoFixes: buildLocalSeoFixes(audit),
    aeoFixes: buildAeoFixes(audit),
    geoFixes: buildGeoFixes(audit)
  };
}
