




export const PILLARS = [
  { id: 'gbp', label: 'Google Business Profile', sectionIds: ['gbp'], max: 10 },
  { id: 'reviews', label: 'Reviews', sectionIds: ['reviews'], max: 10 },
  { id: 'website', label: 'Website', sectionIds: ['website_basic', 'website_homepage'], max: 10 },
  { id: 'local_seo', label: 'Local SEO', sectionIds: ['local_seo', 'onpage_seo', 'technical_seo'], max: 10 },
  { id: 'service_pages', label: 'Service Pages', sectionIds: ['service_pages'], max: 10 },
  { id: 'location_seo', label: 'Location SEO', sectionIds: ['local_seo'], max: 10 },
  { id: 'ai_seo', label: 'AI SEO / Content', sectionIds: ['ai_seo'], max: 10 },
  { id: 'conversion', label: 'Conversion', sectionIds: ['conversion'], max: 10 },
  { id: 'competitor_gap', label: 'Competitor Gap', sectionIds: ['maps_competitors', 'competitor_gap'], max: 10 }
];

export const TRADE_TEMPLATES = {
  'pest-control': {
    id: 'pest-control',
    label: 'Pest Control',
    primaryService: 'Pest Control',
    servicePages: [
      'Pest Control',
      'Rat Control',
      'Mice Control',
      'Wasp Removal',
      'Bed Bug Treatment',
      'Cockroach Control',
      'Flea Treatment',
      'Bird Control',
      'Commercial Pest Control',
      'Emergency Pest Control'
    ],
    mapQueries: (city) => [
      `Pest Control near ${city}`,
      `Pest Control ${city}`,
      `Rat Control near ${city}`,
      `Mice Control near ${city}`,
      `Wasp Nest Removal near ${city}`,
      `Bed Bug Treatment near ${city}`
    ],
    aiQuestions: (city) => [
      `How much does pest control cost in ${city}?`,
      'How do I get rid of rats?',
      'How do I know if I have mice?',
      'How much does rat control cost?',
      'How long does pest control take?',
      'What should I do if I find a wasp nest?',
      'Is professional pest control worth it?'
    ],
    defaultLocations: [
      'Manchester',
      'Salford',
      'Stockport',
      'Trafford',
      'Bolton',
      'Bury',
      'Oldham',
      'Rochdale',
      'Wigan',
      'Tameside'
    ]
  },
  plumbing: {
    id: 'plumbing',
    label: 'Plumbing & Heating',
    primaryService: 'Plumbing',
    servicePages: [
      'Plumbing',
      'Boiler Repair',
      'Emergency Plumber',
      'Bathroom Fitting',
      'Central Heating',
      'Leak Detection',
      'Drain Unblocking',
      'Gas Safe Services'
    ],
    mapQueries: (city) => [
      `Plumber near ${city}`,
      `Plumber ${city}`,
      `Emergency Plumber near ${city}`,
      `Boiler Repair near ${city}`,
      `Heating Engineer near ${city}`
    ],
    aiQuestions: (city) => [
      `How much does a plumber cost in ${city}?`,
      'How do I find an emergency plumber?',
      'How much does boiler repair cost?',
      'Should I repair or replace my boiler?',
      'What does a Gas Safe engineer do?'
    ],
    defaultLocations: ['Manchester', 'Salford', 'Stockport', 'Bolton', 'Oldham', 'Trafford']
  },
  electrical: {
    id: 'electrical',
    label: 'Electrical',
    primaryService: 'Electrician',
    servicePages: [
      'Electrician',
      'EICR',
      'Emergency Electrician',
      'EV Charger Installation',
      'Rewiring',
      'Consumer Unit Upgrade',
      'Lighting Installation'
    ],
    mapQueries: (city) => [
      `Electrician near ${city}`,
      `Electrician ${city}`,
      `Emergency Electrician near ${city}`,
      `EICR near ${city}`,
      `EV Charger Installation near ${city}`
    ],
    aiQuestions: (city) => [
      `How much does an electrician cost in ${city}?`,
      'What is an EICR certificate?',
      'How much does an EV charger installation cost?',
      'Do I need to rewire my house?'
    ],
    defaultLocations: ['Manchester', 'Salford', 'Stockport', 'Bolton', 'Oldham', 'Trafford']
  },
  cleaning: {
    id: 'cleaning',
    label: 'Cleaning',
    primaryService: 'Cleaning',
    servicePages: [
      'Domestic Cleaning',
      'Office Cleaning',
      'End of Tenancy Cleaning',
      'Carpet Cleaning',
      'Deep Cleaning',
      'Commercial Cleaning'
    ],
    mapQueries: (city) => [
      `Cleaners near ${city}`,
      `Cleaners ${city}`,
      `End of Tenancy Cleaning near ${city}`,
      `Office Cleaning near ${city}`
    ],
    aiQuestions: (city) => [
      `How much do cleaners cost in ${city}?`,
      'What is included in end of tenancy cleaning?',
      'How often should I get a deep clean?'
    ],
    defaultLocations: ['Manchester', 'Salford', 'Stockport', 'Bolton', 'Oldham', 'Trafford']
  },
  general: {
    id: 'general',
    label: 'Local Service Business',
    primaryService: 'Local Services',
    servicePages: ['Main Service', 'Emergency Call-Out', 'Commercial Services', 'Domestic Services'],
    mapQueries: (city) => [`Services near ${city}`, `Services ${city}`],
    aiQuestions: (city) => [
      `How much do services cost in ${city}?`,
      'How do I choose a local tradesperson?',
      'Is professional service worth it?'
    ],
    defaultLocations: ['Manchester', 'Salford', 'Stockport', 'Bolton', 'Oldham']
  }
};

const CITATION_DIRS = [
  'Yell',
  'Yelp',
  'Bing Places',
  'Apple Business Connect',
  'Thomson Local',
  'Facebook',
  'Industry directories',
  'Trade-specific directories'
];

function check(id, section, label, source, extra = {}) {
  return {
    id,
    section,
    label,
    source,
    status: 'unknown',
    evidence: '',
    notes: '',
    ...extra
  };
}




export function buildChecklist({
  tradeId = 'general',
  city = 'the local area',
  locations
}: {
  tradeId?: string;
  city?: string;
  locations?: string[];
} = {}) {
  const trade = TRADE_TEMPLATES[tradeId] || TRADE_TEMPLATES.general;
  const locs = locations?.length
    ? locations
    : city && city !== 'the local area'
      ? [city, ...trade.defaultLocations.filter((l) => l.toLowerCase() !== city.toLowerCase())].slice(0, 6)
      : trade.defaultLocations;
  const service = trade.primaryService;
  const checks = [];

  
  const gbpItems = [
    'Is the business listed on Google Maps?',
    'Correct business name?',
    'Correct phone number?',
    'Correct website?',
    'Correct address/service area?',
    `Primary category relevant to ${service}?`,
    'Correct secondary categories?',
    'Number of Google reviews recorded',
    'Average rating recorded',
    'Are reviews recent?',
    'Are they responding to reviews?',
    'Are there unanswered negative reviews?',
    'Photos updated recently?',
    'Services/products added?',
    'Business description optimised?',
    'Opening hours correct?',
    'Emergency/24-hour availability clearly shown if applicable?',
    'Posts being used?',
    'Is the profile appearing in the local 3-pack?'
  ];
  gbpItems.forEach((label, i) => {
    checks.push(check(`gbp_${i + 1}`, 'gbp', label, 'operator', { sectionTitle: '1. Google Business Profile — Highest Priority' }));
  });

  
  trade.mapQueries(city).forEach((q, i) => {
    checks.push(
      check(`maps_query_${i + 1}`, 'maps_competitors', `Search: ${q}`, 'operator', {
        sectionTitle: '2. Google Maps Competitor Check',
        inputType: 'text'
      })
    );
  });
  [
    'Top 3–10 competitor review counts',
    'Top 3–10 competitor ratings',
    'Top 3–10 website quality',
    'Top 3–10 competitor services',
    'Top 3–10 competitor photos',
    'Top 3–10 Google Business Profile quality',
    'Top 3–10 location/service areas',
    'Who appears in the top 3',
    'Competitor observations'
  ].forEach((label, i) => {
    checks.push(
      check(`maps_obs_${i + 1}`, 'maps_competitors', label, 'operator', {
        sectionTitle: '2. Google Maps Competitor Check',
        inputType: 'textarea'
      })
    );
  });

  [
    ['Local Pack visibility (measured local query)', 'crawl'],
    ['Visible in Maps (measured local query)', 'crawl']
  ].forEach(([label, source], i) => {
    checks.push(
      check(`maps_vis_${i + 1}`, 'maps_competitors', label, source, {
        sectionTitle: '2. Google Maps Competitor Check'
      })
    );
  });

  
  [
    'Website available?',
    'HTTPS?',
    'Mobile-friendly viewport?',
    'Fast loading? (Lighthouse when available)',
    'Modern / clear layout signals?',
    'Clear phone number?',
    'Clear CTA?',
    'Quote/contact form?',
    'WhatsApp option?',
    'Emergency call CTA?'
  ].forEach((label, i) => {
    checks.push(
      check(`web_basic_${i + 1}`, 'website_basic', label, i === 3 ? 'lighthouse' : 'crawl', {
        sectionTitle: '3. Website Audit — Basic'
      })
    );
  });

  
  [
    'What they do is clearly communicated?',
    'Where they operate is clearly communicated?',
    'Why choose them is clearly communicated?',
    'How to contact them is clearly communicated?',
    `Example positioning includes ${service} + ${city}?`
  ].forEach((label, i) => {
    checks.push(
      check(`web_home_${i + 1}`, 'website_homepage', label, 'crawl', {
        sectionTitle: '3. Website Audit — Homepage'
      })
    );
  });

  
  trade.servicePages.forEach((name, i) => {
    checks.push(
      check(`svc_${i + 1}`, 'service_pages', `${name} page`, 'crawl', {
        sectionTitle: '4. Service Page Audit',
        matchTerms: [name.toLowerCase()]
      })
    );
  });

  
  locs.forEach((loc, i) => {
    checks.push(
      check(`loc_${i + 1}`, 'local_seo', `${loc} location page exists?`, 'crawl', {
        sectionTitle: '5. Local SEO Audit',
        matchTerms: [loc.toLowerCase()]
      })
    );
  });
  [
    'Pages have unique content?',
    'Location mentioned naturally?',
    'Local customer testimonials?',
    'Local project/case studies?',
    'Internal links between service/location pages?'
  ].forEach((label, i) => {
    checks.push(
      check(`loc_qual_${i + 1}`, 'local_seo', label, 'crawl', {
        sectionTitle: '5. Local SEO Audit'
      })
    );
  });

  
  [
    'SEO title',
    'Meta description',
    'One clear H1',
    'Proper H2/H3 structure',
    'Target keyword',
    'Location keyword',
    'Internal links',
    'Image ALT text',
    'Service-specific content',
    'FAQ section',
    'Strong CTA'
  ].forEach((label, i) => {
    checks.push(
      check(`onpage_${i + 1}`, 'onpage_seo', label, 'crawl', {
        sectionTitle: '6. On-Page SEO Audit'
      })
    );
  });

  
  trade.aiQuestions(city).forEach((q, i) => {
    checks.push(
      check(`ai_q_${i + 1}`, 'ai_seo', `Content answers: ${q}`, 'crawl', {
        sectionTitle: '7. AI SEO / Search Visibility Audit',
        question: q
      })
    );
  });
  [
    'Useful educational content exists?',
    'FAQs or structured answers exist?',
    'Competitors provide detailed answers? (operator)'
  ].forEach((label, i) => {
    checks.push(
      check(`ai_extra_${i + 1}`, 'ai_seo', label, i === 2 ? 'operator' : 'crawl', {
        sectionTitle: '7. AI SEO / Search Visibility Audit'
      })
    );
  });

  
  const tech = [
    ['Page speed', 'lighthouse'],
    ['Mobile usability', 'crawl'],
    ['Broken links', 'crawl'],
    ['404 pages', 'crawl'],
    ['Indexing issues', 'crawl'],
    ['Sitemap', 'crawl'],
    ['Robots.txt', 'crawl'],
    ['Canonical tags', 'crawl'],
    ['HTTPS', 'crawl'],
    ['Image optimisation', 'crawl'],
    ['Core Web Vitals', 'lighthouse'],
    ['Schema markup present', 'crawl'],
    ['FAQPage schema', 'crawl'],
    ['LocalBusiness / entity schema', 'crawl'],
    ['llms.txt for AI crawlers', 'crawl'],
    ['Priority technical issues to discuss (1–2 only)', 'operator']
  ];
  tech.forEach(([label, source], i) => {
    checks.push(
      check(`tech_${i + 1}`, 'technical_seo', label, source, {
        sectionTitle: '8. Technical SEO Audit',
        inputType: i === tech.length - 1 ? 'textarea' : undefined
      })
    );
  });

  
  [
    'FAQPage schema markup',
    'Visible FAQ / Q&A blocks',
    'Answers common service questions',
    'Near-me / best local question readiness'
  ].forEach((label, i) => {
    checks.push(
      check(`aeo_${i + 1}`, 'ai_seo', label, 'crawl', {
        sectionTitle: '7. AI SEO / Search Visibility Audit'
      })
    );
  });

  
  [
    'llms.txt published',
    'Content crawlable (not SPA shell)',
    'LocalBusiness or Person schema',
    'About / entity authority content',
    'Appears in measured local / near-me results'
  ].forEach((label, i) => {
    checks.push(
      check(`geo_${i + 1}`, 'ai_seo', label, 'crawl', {
        sectionTitle: '7. AI SEO / Search Visibility Audit'
      })
    );
  });

  // Local GEO core checklist (AI visibility / entity / external / citations)
  [
    ['geo_ai_1', 'Business mentioned in AI answers'],
    ['geo_ai_2', 'Business recommended for local searches'],
    ['geo_ai_3', 'Service + location visibility'],
    ['geo_ai_4', '"Best" query visibility'],
    ['geo_ai_5', '"Near me" query visibility'],
    ['geo_ai_6', 'Problem/solution query visibility'],
    ['geo_ai_7', 'Competitor mentions in AI answers'],
    ['geo_ai_8', 'AI recommendation position/order'],
    ['geo_ent_1', 'Business entity correctly identified'],
    ['geo_ent_2', 'Business category correctly identified'],
    ['geo_ent_3', 'Location correctly identified'],
    ['geo_ent_4', 'Services correctly identified'],
    ['geo_ent_5', 'Website correctly associated'],
    ['geo_ent_6', 'Business information consistency'],
    ['geo_ent_7', 'SameAs / entity connections'],
    ['geo_ext_1', 'Review-platform presence'],
    ['geo_ext_2', 'Directory presence'],
    ['geo_ext_3', 'Industry mentions'],
    ['geo_ext_4', 'Local publication mentions'],
    ['geo_ext_5', 'Local backlinks'],
    ['geo_ext_6', 'Brand mentions'],
    ['geo_cite_1', 'Sources cited by AI'],
    ['geo_cite_2', 'Website cited'],
    ['geo_cite_3', 'GBP / business data referenced'],
    ['geo_cite_4', 'Third-party sources referenced'],
    ['geo_cite_5', 'Incorrect information detected'],
    ['geo_cite_6', 'Missing information detected']
  ].forEach(([id, label]) => {
    const group = String(id).startsWith('geo_ai_')
      ? 'GEO — AI Visibility'
      : String(id).startsWith('geo_ent_')
        ? 'GEO — Entity Strength'
        : String(id).startsWith('geo_ext_')
          ? 'GEO — External AI Signals'
          : 'GEO — AI Citation / Source Monitoring';
    checks.push(
      check(id, 'ai_seo', label, 'crawl', {
        sectionTitle: group
      })
    );
  });

  
  ['Phone consistent with GBP/claimed', 'Address consistent with GBP/claimed'].forEach((label, i) => {
    checks.push(
      check(`nap_${i + 1}`, 'local_seo', label, 'crawl', {
        sectionTitle: '5. Local SEO Audit'
      })
    );
  });

  
  CITATION_DIRS.forEach((name, i) => {
    checks.push(
      check(`cite_${i + 1}`, 'citations', name, 'operator', {
        sectionTitle: '9. Local Citations'
      })
    );
  });
  ['Business Name consistent?', 'Address consistent?', 'Phone consistent?', 'Website consistent?'].forEach(
    (label, i) => {
      checks.push(
        check(`cite_nap_${i + 1}`, 'citations', label, 'operator', {
          sectionTitle: '9. Local Citations'
        })
      );
    }
  );

  
  [
    'Total Google reviews',
    'Average rating',
    'Review frequency',
    'Recent reviews',
    'Negative reviews',
    'Owner responses',
    'Reviews mentioning specific services',
    'Common themes in customer reviews'
  ].forEach((label, i) => {
    checks.push(
      check(`rev_${i + 1}`, 'reviews', label, 'operator', {
        sectionTitle: '10. Reviews & Reputation',
        inputType: i >= 6 ? 'textarea' : 'text'
      })
    );
  });

  
  [
    'Phone number visible immediately?',
    'Click-to-call on mobile?',
    'Emergency CTA?',
    'Quote button?',
    'Contact form?',
    'WhatsApp?',
    'Response information?',
    'Service areas?',
    'Pricing guidance?',
    'Trust badges?',
    'Testimonials?',
    'Google reviews shown?',
    'Accreditations?'
  ].forEach((label, i) => {
    checks.push(
      check(`conv_${i + 1}`, 'conversion', label, 'crawl', {
        sectionTitle: '11. Conversion Audit'
      })
    );
  });

  
  const gapDims = [
    'Google Reviews',
    'Rating',
    'Website',
    'Service Pages',
    'Location Pages',
    'Blog/FAQs',
    'Google Profile',
    'Mobile Website',
    'CTA'
  ];
  gapDims.forEach((dim, i) => {
    ['Prospect', 'Competitor 1', 'Competitor 2', 'Competitor 3'].forEach((who, j) => {
      const source = who === 'Prospect' && ['Website', 'Service Pages', 'Location Pages', 'Blog/FAQs', 'Mobile Website', 'CTA'].includes(dim)
        ? 'crawl'
        : 'operator';
      checks.push(
        check(`gap_${i + 1}_${j + 1}`, 'competitor_gap', `${dim} — ${who}`, source, {
          sectionTitle: '12. Competitor Gap Audit',
          inputType: 'text'
        })
      );
    });
  });
  checks.push(
    check('gap_obs', 'competitor_gap', 'Top competitor gap observations', 'operator', {
      sectionTitle: '12. Competitor Gap Audit',
      inputType: 'textarea'
    })
  );

  return {
    tradeId: trade.id,
    tradeLabel: trade.label,
    city,
    locations: locs,
    servicePages: trade.servicePages,
    mapQueries: trade.mapQueries(city),
    aiQuestions: trade.aiQuestions(city),
    checks
  };
}

export function groupChecksBySection(checks) {
  const map = new Map();
  for (const c of checks) {
    const title = c.sectionTitle || c.section;
    if (!map.has(title)) map.set(title, []);
    map.get(title).push(c);
  }
  return [...map.entries()].map(([title, items]) => ({ title, items }));
}

export function listTradeTemplates() {
  return Object.values(TRADE_TEMPLATES).map((t) => ({
    id: t.id,
    label: t.label,
    primaryService: t.primaryService,
    defaultLocations: t.defaultLocations
  }));
}
