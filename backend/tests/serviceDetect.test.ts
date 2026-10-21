import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectServices } from '../lib/serviceDetect';

const html = (body: string) => new Response(`<html><body>${body}</body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });

afterEach(() => vi.unstubAllGlobals());

describe('detectServices', () => {
    it('reads the website and returns services + cleaned prompts from one Gemini call', async () => {
        const page = `<h1>Our treatments</h1><p>${'Laser hair removal, facials and Botox in Basingstoke. '.repeat(20)}</p>`;
        vi.stubGlobal('fetch', vi.fn(async () => html(page)));
        // "health" / "treatments" are generic, "microneedling" is not on the site: dropped, and so are their prompts.
        const generate = vi.fn(async () =>
            JSON.stringify({
                services: ['Health', 'Laser Hair Removal', 'Treatments', 'Facials', 'Microneedling', 'Dental & aesthetics', 'facials'],
                prompts: [
                    { prompt: 'Who is the best aesthetics clinic in Basingstoke?', topic: 'business' },
                    { prompt: 'Where can I get laser hair removal in Basingstoke?', topic: 'Laser Hair Removal' },
                    { prompt: 'Is Glow Clinic in Basingstoke good for facials?', topic: 'facials' },
                    { prompt: 'Where can I get microneedling in Basingstoke?', topic: 'microneedling' },
                    { prompt: 'Who offers health in Basingstoke?', topic: 'health' }
                ]
            })
        );
        const result = await detectServices(
            { name: 'Glow Clinic', category: 'Dental & aesthetics', address: '1 High St, Basingstoke RG21 7AA, UK', website: 'clinic.example' },
            generate
        );
        expect(result.services).toEqual(['laser hair removal', 'facials']);
        expect(result.prompts).toEqual([
            { prompt: 'Who is the best aesthetics clinic in Basingstoke?', topic: 'business' },
            { prompt: 'Where can I get laser hair removal in Basingstoke?', topic: 'laser hair removal' }
        ]);
        expect(generate).toHaveBeenCalledTimes(1);
        const [prompt, config] = generate.mock.calls[0] as unknown as [string, any];
        expect(prompt).toContain('Laser hair removal');
        expect(prompt).toContain('Town: Basingstoke');
        expect(config).toEqual({ responseMimeType: 'application/json' });
    });

    it('falls back to Google search when the site cannot be read', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => html('<div id="root"></div>')));
        const generate = vi.fn(async () => '{"services": ["teeth whitening"], "prompts": [{"prompt": "Where can I get teeth whitening near me?", "topic": "teeth whitening"}]}');
        const result = await detectServices({ name: 'Clinic', category: 'Dentist', website: 'https://clinic.example' }, generate);
        expect(result).toEqual({
            services: ['teeth whitening'],
            prompts: [{ prompt: 'Where can I get teeth whitening near me?', topic: 'teeth whitening' }]
        });
        expect((generate.mock.calls[0] as unknown as [string, any])[1]).toEqual({ tools: [{ googleSearch: {} }] });
    });

    it('returns nothing on unreadable model output', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => html('')));
        expect(await detectServices({ category: 'Dentist', website: 'x.example' }, async () => 'sorry')).toEqual({ services: [], prompts: [] });
    });
});
