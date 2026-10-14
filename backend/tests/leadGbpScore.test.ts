import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHECK_KEYS,
    CheckKey,
    CheckResult,
    napMismatches,
    parseGbpUrlText,
    priorityFromChecks,
    templateCopy,
    topGaps
} from '../lib/leadGbpScore';

/** Build 6 results where the given keys fail and the rest pass. */
function withFails(fails: CheckKey[], unknown: CheckKey[] = []): CheckResult[] {
    return CHECK_KEYS.map((key) => ({
        key,
        pass: unknown.includes(key) ? null : !fails.includes(key),
        evidence: key
    }));
}

test('priority: passed 0-3 -> High, 4 -> Medium, 5-6 -> Low', () => {
    assert.equal(priorityFromChecks(withFails([...CHECK_KEYS])), 'High'); // passed 0
    assert.equal(priorityFromChecks(withFails(CHECK_KEYS.slice(0, 4))), 'High'); // passed 2
    assert.equal(priorityFromChecks(withFails(CHECK_KEYS.slice(0, 3))), 'High'); // passed 3
    assert.equal(priorityFromChecks(withFails(CHECK_KEYS.slice(0, 2))), 'Medium'); // passed 4
    assert.equal(priorityFromChecks(withFails(CHECK_KEYS.slice(0, 1))), 'Low'); // passed 5
    assert.equal(priorityFromChecks(withFails([])), 'Low'); // passed 6
});

test('unmeasured checks are not counted as gaps', () => {
    const checks = withFails(['nap'], ['posting', 'reviewReplies']);
    assert.equal(priorityFromChecks(checks), 'Low');
    assert.deepEqual(
        topGaps(checks).map((g) => g.key),
        ['nap']
    );
});

test('copy mentions only failed checks, max 3', () => {
    const copy = templateCopy(withFails([...CHECK_KEYS]));
    assert.equal(copy.gbpObservation.split('\n').length, 3);
    assert.equal(copy.aiVisibilityObservation.split('\n').length, 3);

    const one = templateCopy(withFails(['posting']));
    assert.match(one.gbpObservation, /posting/i);
    assert.doesNotMatch(one.gbpObservation, /category|reviews/i);
});

test('all checks passing gives a positive line', () => {
    const copy = templateCopy(withFails([]));
    assert.match(copy.gbpObservation, /good shape/i);
});

test('parses a full Google Maps place URL', () => {
    const p = parseGbpUrlText(
        'https://www.google.com/maps/place/LES+Pest+Management/@53.7,-2.6,17z/data=!3m1!4b1!4m6!3m5!1s0x487b9e1f3c2a1b2d:0x1f2e3d4c5b6a7988!8m2!3d53.71234!4d-2.61234'
    );
    assert.equal(p.name, 'LES Pest Management');
    assert.equal(p.lat, 53.71234);
    assert.equal(p.lng, -2.61234);
    assert.equal(p.cid, BigInt('0x1f2e3d4c5b6a7988').toString());
});

test('parses cid= links and unwraps consent redirects', () => {
    assert.equal(parseGbpUrlText('https://maps.google.com/?cid=12345678901234567890').cid, '12345678901234567890');
    const wrapped =
        'https://consent.google.com/m?continue=' +
        encodeURIComponent('https://www.google.com/maps/place/JDM+Gardens/@53.3,-2.2,15z') +
        '&gl=GB';
    assert.equal(parseGbpUrlText(wrapped).name, 'JDM Gardens');
});

test('NAP match tolerates formatting differences', () => {
    const page =
        'Welcome to LES Pest Management Ltd. Unit 6A, Bannister Hall Works, Higher Walton, Preston PR5 4DZ. Call us on 01772 885100';
    assert.deepEqual(
        napMismatches(
            {
                name: 'LES Pest Management',
                address: 'Unit 6A, Bannister Hall Works, Higher Walton, Preston PR5 4DZ, UK',
                phone: '+44 1772 885100'
            },
            page
        ),
        []
    );
});

test('NAP mismatch reports which parts differ', () => {
    const page = 'Smith Plumbing, 1 High Street, Leeds LS1 1AA, tel 0113 496 0000';
    const bad = napMismatches(
        { name: 'Smith Plumbing', address: '22 Other Road, Bradford BD1 2XY', phone: '01274 555 123' },
        page
    );
    assert.deepEqual(bad, ['address', 'phone']);
});
