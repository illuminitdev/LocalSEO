import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CHECK_KEYS,
    CheckKey,
    CheckResult,
    napMismatches,
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

test('GBP observation mentions only failed checks, max 3', () => {
    const all = templateGbpObservation(withFails([...CHECK_KEYS]));
    assert.equal(all.split('\n').length, 3);

    const one = templateGbpObservation(withFails(['posting']));
    assert.match(one, /posting/i);
    assert.doesNotMatch(one, /category|reviews/i);
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

test('AI visibility column shows only the Not Listed questions (max 2)', () => {
    const qs = ['Q1?', 'Q2?', 'Q3?', 'Q4?'];
    assert.equal(
        formatAiVisibility(qs, ['Not Listed', '2nd position', 'Not Listed', 'Not Listed']),
        '1. Q1? (Not Listed)\n2. Q3? (Not Listed)'
    );
    assert.equal(formatAiVisibility(qs, ['Listed', '1st position', 'Listed', 'Listed']), 'Listed in all 4 AI answers checked for local searches in their area.');
    assert.equal(
        formatAiVisibility(qs, ['Could not be checked', 'Not Listed', 'Could not be checked', 'Could not be checked']),
        '1. Q2? (Not Listed)'
    );
    assert.match(formatAiVisibility(qs, Array(4).fill('Could not be checked')), /could not be checked/i);
});

test('AI answer: Not Listed / position / Listed, matching the full name only', () => {
    const answer = '1. Acme Roofing Ltd - great\n2. Smith Roofing Limited - good\n3. Other Co';
    assert.equal(aiAnswerResult(answer, 'Smith Roofing Ltd'), '2nd position');
    assert.equal(aiAnswerResult(answer, 'Acme Roofing'), '1st position');
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
