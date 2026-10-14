import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHECK_KEYS,
    CheckKey,
    CheckResult,
    napGapLines,
    napMissing,
    nationalDigits,
    phoneMatches,
    nameMatches,
    parseGbpUrlText,
    priorityFromChecks,
    templateGbpObservation,
    topGaps,
    aiAnswerResult,
    aiQuestions,
    areaFromGbpAddress,
    cityFromGbpAddress,
    formatAiVisibility,
    serviceFromBusiness
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

test('GBP observation lists every failed check (no cap), including posts', () => {
    const all = templateGbpObservation(withFails([...CHECK_KEYS]));
    assert.equal(all.split('\n').length, 6);
    assert.match(all, /posting|posts/i);

    const one = templateGbpObservation(withFails(['posting']));
    assert.match(one, /posting|posts/i);
    assert.doesNotMatch(one, /category|reviews/i);
});

test('GBP observation uses the specific lines of a failed check and skips passed ones', () => {
    const checks = withFails(['posting', 'nap']).map((c) =>
        c.key === 'posting'
            ? { ...c, gaps: ['No Google posts in the last 30 days (last post 3 Oct 2025)'] }
            : c.key === 'nap'
              ? { ...c, gaps: napGapLines(['phone'], { name: 'Smith', address: 'A', phone: '0121 477 9799' }) }
              : c
    );
    assert.equal(
        templateGbpObservation(checks),
        '1. No Google posts in the last 30 days (last post 3 Oct 2025)\n' +
            '2. Phone number missing on the website (GBP: 0121 477 9799)'
    );
});

test('all checks passing gives a positive line', () => {
    assert.match(templateGbpObservation(withFails([])), /good shape/i);
});

test('service and city come from the GBP', () => {
    // Excel "Business" column wins; the GBP category is only a fallback
    assert.equal(serviceFromBusiness('Windows & Doors', 'Corporate office'), 'windows and doors');
    assert.equal(serviceFromBusiness('Pestcontrol', 'Pest control service'), 'pest control');
    assert.equal(serviceFromBusiness('Cleaning Services'), 'cleaning');
    assert.equal(serviceFromBusiness('Plumber'), 'plumbing');
    assert.equal(serviceFromBusiness('', 'Double glazing installer'), 'double glazing');
    assert.equal(serviceFromBusiness('Lead', ''), '');
    assert.equal(cityFromGbpAddress('1 Lightning Way, West Heath, Birmingham B31 3PH'), 'Birmingham');
    assert.equal(cityFromGbpAddress('7 Trentham Grove, Yardley, Birmingham B26 1HT, United Kingdom'), 'Birmingham');
});

test('area is the neighbourhood, never a street', () => {
    assert.equal(areaFromGbpAddress('1 Lightning Way, West Heath, Birmingham B31 3PH'), 'West Heath');
    assert.equal(areaFromGbpAddress('7 Trentham Grove, Yardley, Birmingham B26 1HT, United Kingdom'), 'Yardley');
    assert.equal(areaFromGbpAddress('12 High Street, Leeds LS1 1AA'), '');
    assert.equal(areaFromGbpAddress('Unit 6A, Bannister Hall Works, Higher Walton, Preston PR5 4DZ'), 'Higher Walton');
});

test('AI visibility asks 4 local-search questions (city + area), not a fixed prompt', () => {
    const qs = aiQuestions('double glazing', 'Birmingham', 'West Heath');
    assert.equal(qs.length, 4);
    assert.equal(qs[0], 'What are the best double glazing in Birmingham?');
    assert.equal(qs[1], 'Who would you recommend for double glazing in Birmingham?');
    assert.ok(qs.some((q) => q.includes('West Heath')));
    assert.ok(qs.every((q) => !/street|road|way/i.test(q)));
    // no area: still 4 questions, none mentioning an empty area
    const noArea = aiQuestions('roofing', 'Leeds');
    assert.equal(noArea.length, 4);
    assert.ok(noArea.every((q) => !/undefined|, Leeds\?/.test(q)));
});

test('AI visibility column shows every question with its rank or (Not Listed)', () => {
    const qs = ['Q1?', 'Q2?', 'Q3?', 'Q4?'];
    assert.equal(
        formatAiVisibility(qs, ['Not Listed', '2nd place', '1st place', 'Not Listed']),
        '1. Q1? (Not Listed)\n2. Q2? (2nd place)\n3. Q3? (1st place)\n4. Q4? (Not Listed)'
    );
    // a question that could not be asked is left out and the rest are renumbered
    assert.equal(
        formatAiVisibility(qs, ['Could not be checked', 'Not Listed', 'Listed', 'Could not be checked']),
        '1. Q2? (Not Listed)\n2. Q3? (Listed)'
    );
    assert.match(formatAiVisibility(qs, Array(4).fill('Could not be checked')), /could not be checked/i);
});

test('AI answer: Not Listed / place / Listed, matching the full name only', () => {
    const answer = '1. Acme Roofing Ltd - great\n2. Smith Roofing Limited - good\n3. Other Co';
    assert.equal(aiAnswerResult(answer, 'Smith Roofing Ltd'), '2nd place');
    assert.equal(aiAnswerResult(answer, 'Acme Roofing'), '1st place');
    assert.equal(aiAnswerResult('1. A\n2. B\n3. C\n4. Smith Roofing', 'Smith Roofing'), '4th place');
    assert.equal(aiAnswerResult(answer, 'Zed Roofing'), 'Not Listed');
    // a few shared words are not a match
    assert.equal(aiAnswerResult('1. Birmingham Glass Repair Centre', 'Birmingham Glass Services Ltd'), 'Not Listed');
    assert.equal(aiAnswerResult('Try Smith Roofing, they are local.', 'Smith Roofing'), 'Listed');
    assert.equal(aiAnswerResult('Nothing here', 'Smith Roofing', 'smithroofing.co.uk', ['www.smithroofing.co.uk'].map((d) => d.replace(/^www\./, ''))), 'Listed');
});

test('share.google resolved search URL gives the business name', () => {
    const p = parseGbpUrlText(
        'https://www.google.com/search?sca_esv=1&kgmid=/g/1tp07jyh&q=Birmingham+Glass+Services+Ltd&shem=dlvs1'
    );
    assert.equal(p.name, 'Birmingham Glass Services Ltd');
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

test('NAP: everything on the website gives nothing missing', () => {
    const page =
        'Welcome to LES Pest Management Ltd. Unit 6A, Bannister Hall Works, Higher Walton, Preston PR5 4DZ. Call us on 01772 885100';
    assert.deepEqual(
        napMissing(
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

test('NAP: reports only what is missing', () => {
    const page = 'Smith Plumbing, 1 High Street, Leeds LS1 1AA, tel 0113 496 0000';
    const gbp = { name: 'Smith Plumbing', address: '22 Other Road, Bradford BD1 2XY', phone: '01274 555 123' };
    const missing = napMissing(gbp, page);
    assert.deepEqual(missing, ['phone', 'address']);
    assert.deepEqual(napGapLines(missing, gbp), [
        'Phone number missing on the website (GBP: 01274 555 123)',
        'Address missing on the website (GBP: 22 Other Road, Bradford BD1 2XY)'
    ]);
    // a missing number is reported as missing, a matching name is not mentioned at all
    assert.ok(napGapLines(missing, gbp).every((l) => !/name/i.test(l)));
});

test('phone numbers match however the website formats them', () => {
    const gbp = '0121 477 9799';
    assert.equal(nationalDigits('+44 (0)121 477 9799'), '1214779799');
    assert.equal(nationalDigits('0044 121 477 9799'), '1214779799');
    for (const shown of [
        'Call 0121 477 9799',
        'Call 0121-477-9799',
        'Call 0121.477.9799',
        'Call +44 (0)121 477 9799',
        'Call +44 121 477 9799',
        'Call 01214779799'
    ]) {
        assert.equal(phoneMatches(gbp, shown), true, shown);
    }
    // GBP written with +44, website with the leading 0
    assert.equal(phoneMatches('+44 121 477 9799', 'Tel: 0121 477 9799'), true);
    assert.equal(phoneMatches(gbp, 'Call 0121 477 9800'), false);
});

test('business name matches despite punctuation, "&"/"and", Ltd and joined words', () => {
    assert.equal(nameMatches('Smith & Sons Ltd', 'Welcome to Smith and Sons'), true);
    assert.equal(nameMatches('Solihull WDC Ltd', 'SolihullWDC - windows, doors and conservatories'), true);
    assert.equal(nameMatches("Joe's Plumbing", "JOE'S PLUMBING - Leeds"), true);
    assert.equal(nameMatches('Acme Roofing', 'Totally different company page'), false);
});
