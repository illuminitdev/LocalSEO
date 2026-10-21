import { describe, expect, it } from 'vitest';
import {
    buildPrompts,
    businessServices,
    normalizePrompts,
    normalizeServices,
    suggestKeywords,
    suggestPrompts,
    type AiPrompt
} from '../lib/aiInsights';

const clinic = { category: 'Dental & aesthetics', address: '1 High St, Basingstoke RG21 7AA, UK' };

describe('normalizeServices', () => {
    it('lowercases, dedupes, drops the category and caps the list', () => {
        expect(normalizeServices([' Facials ', 'facials', 'Dental', '', 'x'.repeat(41), 'Laser Hair Removal'], 'Dental & aesthetics')).toEqual([
            'facials',
            'laser hair removal'
        ]);
        expect(normalizeServices(Array.from({ length: 12 }, (_, i) => `service ${i}`))).toHaveLength(8);
        expect(normalizeServices('not a list')).toEqual([]);
    });

    it('drops generic words and place types but keeps real services', () => {
        expect(
            normalizeServices(['health', 'Treatments', 'hospital', 'aesthetic treatments', 'skin care', 'skin rejuvenation', 'facial contouring', 'cosmetic dentistry'])
        ).toEqual(['skin care', 'skin rejuvenation', 'facial contouring', 'cosmetic dentistry']);
    });
});

describe('businessServices', () => {
    it('puts typed services first, adds website ones and skips GBP attributes', () => {
        expect(
            businessServices({
                category: 'Dental & aesthetics',
                attributes: 'Botox, wheelchair_accessible, Free Wi-Fi\nInvisalign',
                services: ['facials', 'botox', 'laser hair removal']
            })
        ).toEqual(['botox', 'invisalign', 'facials', 'laser hair removal']);
    });

    it('prompts use typed services too', () => {
        expect(buildPrompts({ ...clinic, attributes: 'Teeth whitening' })[2]).toContain('teeth whitening');
    });
});

describe('suggestKeywords', () => {
    it('is unchanged without services', () => {
        expect(suggestKeywords(clinic)).toEqual([
            'dental & aesthetics near me',
            'dental & aesthetics basingstoke',
            'best dental & aesthetics basingstoke',
            'dental & aesthetics in basingstoke',
            'dental & aesthetics services basingstoke'
        ]);
    });

    it('alternates business and service keywords and covers every service', () => {
        const list = suggestKeywords({ ...clinic, services: ['laser hair removal', 'facials'] });
        expect(list.slice(0, 4)).toEqual([
            'dental & aesthetics near me',
            'laser hair removal basingstoke',
            'dental & aesthetics basingstoke',
            'facials basingstoke'
        ]);
        expect(list).toContain('best facials in basingstoke');
        expect(list).toContain('laser hair removal near me');
    });
});

const ai: AiPrompt[] = [
    { prompt: 'Who is the best aesthetics clinic in Basingstoke?', topic: 'business' },
    { prompt: 'Which dental and aesthetics clinic in Basingstoke has the best reviews?', topic: 'business' },
    { prompt: 'Where can I get skin rejuvenation in Basingstoke?', topic: 'skin rejuvenation' },
    { prompt: 'Who does good skin rejuvenation near Basingstoke town centre?', topic: 'skin rejuvenation' },
    { prompt: 'How much are dental implants in Basingstoke and who is good?', topic: 'dental implants' },
    { prompt: 'Best place for clear aligners in Basingstoke?', topic: 'clear aligners' },
    { prompt: 'Is there a dentist in Basingstoke that does emergency appointments?', topic: 'business' }
];

describe('normalizePrompts', () => {
    it('keeps real questions about kept services and drops the rest', () => {
        const list = normalizePrompts(
            [
                ...ai,
                { prompt: 'Is Smile Studio Basingstoke any good?', topic: 'business' },
                { prompt: 'Who offers health in Basingstoke?', topic: 'health' },
                { prompt: 'too short', topic: 'business' },
                { prompt: 'where can I get skin rejuvenation in Basingstoke?', topic: 'Skin Rejuvenation' }
            ],
            { name: 'Smile Studio Basingstoke Ltd', services: ['skin rejuvenation', 'dental implants', 'clear aligners'] }
        );
        expect(list).toEqual(ai);
    });
});

describe('buildPrompts', () => {
    it('uses 2 business prompts then one per top service from the AI list', () => {
        expect(buildPrompts({ ...clinic, aiPrompts: ai })).toEqual([
            'Who is the best aesthetics clinic in Basingstoke?',
            'Which dental and aesthetics clinic in Basingstoke has the best reviews?',
            'Where can I get skin rejuvenation in Basingstoke?',
            'How much are dental implants in Basingstoke and who is good?',
            'Best place for clear aligners in Basingstoke?'
        ]);
    });

    it('falls back to plain questions that read correctly', () => {
        const prompts = buildPrompts({ ...clinic, services: ['skin rejuvenation', 'facials'] });
        expect(prompts).toHaveLength(5);
        expect(prompts.slice(0, 2)).toEqual([
            'Who is the best dental & aesthetics in Basingstoke?',
            'Can you recommend a good dental & aesthetics in Basingstoke?'
        ]);
        expect(prompts).toContain('Where can I get skin rejuvenation in Basingstoke?');
        expect(prompts).toContain('Where can I get facials in Basingstoke?');
    });
});

describe('suggestPrompts', () => {
    it('suggests the AI prompts across topics and skips tracked ones', () => {
        const list = suggestPrompts({ ...clinic, aiPrompts: ai }, ['WHO IS THE BEST AESTHETICS CLINIC IN BASINGSTOKE?']);
        expect(list.slice(0, 4)).toEqual([
            'Which dental and aesthetics clinic in Basingstoke has the best reviews?',
            'Where can I get skin rejuvenation in Basingstoke?',
            'How much are dental implants in Basingstoke and who is good?',
            'Best place for clear aligners in Basingstoke?'
        ]);
        expect(list).toHaveLength(6);
    });
});
