/**
 * Booking industry presets — keep in sync with
 * zappsites/frontend/src/data/bookingDemosData.js and
 * client/src/features/bookings/bookingIndustryPresets.ts
 */

export const BOOKING_INDUSTRY_IDS = [
    'plumbing',
    'electricians',
    'cleaners',
    'valeting',
    'pressure-washing',
    'pest-control',
    'gardeners',
    'salons',
    'personal-trainers',
    'restaurants',
    'professional-services',
    'small-business'
] as const;

export type BookingIndustryId = (typeof BOOKING_INDUSTRY_IDS)[number];

export type BookingCustomField = {
    id: string;
    label: string;
    type: 'select';
    options: string[];
};

export type BookingIndustryPreset = {
    id: BookingIndustryId;
    name: string;
    shortName: string;
    icon: string;
    eyebrow: string;
    demoTitle: string;
    confirmationTitle: string;
    tagline: string;
    defaultService: string;
    services: string[];
    timeSlots: string[];
    customFields: BookingCustomField[];
    uploadPrompt: string;
    notesPlaceholder: string;
    summaryBullet: string;
    setupPlaceholders: {
        name: string;
        businessName: string;
        contact: string;
        serviceArea: string;
    };
};

export const bookingIndustryPresets: BookingIndustryPreset[] = [
    {
        id: 'plumbing',
        name: 'Plumbers & Heating',
        shortName: 'Plumbers',
        icon: 'Flame',
        eyebrow: 'PLUMBING & HEATING BOOKING FLOW DEMO',
        demoTitle: 'How Your Plumbing Customers Book You 24/7',
        confirmationTitle: 'Plumbing Booking Confirmed!',
        tagline: 'Route emergency leaks, boiler servicing, and survey requests automatically.',
        defaultService: 'Annual Boiler Service (£85 Fixed)',
        services: [
            'Annual Boiler Service (£85 Fixed)',
            'Emergency Leak Call-Out (£110 Call-Out)',
            'Bathroom Leak Repair (Photo Estimate)',
            'Boiler Replacement Survey (Free Visit)',
            'Landlord Gas Safety CP12 (£75)'
        ],
        timeSlots: ['09:30 AM', '11:00 AM', '02:00 PM', '04:30 PM'],
        customFields: [
            {
                id: 'propertyType',
                label: 'Property & Access *',
                type: 'select',
                options: [
                    'House (Driveway Access)',
                    'Flat (Elevator Access)',
                    'Flat (Stairwell Only)',
                    'Commercial Premises'
                ]
            },
            {
                id: 'systemType',
                label: 'Boiler / System Type *',
                type: 'select',
                options: [
                    'Combi Boiler',
                    'System Boiler (Cylinder)',
                    'Conventional Boiler & Tank',
                    'Not Sure / Needs Survey'
                ]
            }
        ],
        uploadPrompt: 'Upload a photo of boiler serial plate, leak area or stopcock access',
        notesPlaceholder: 'E.g. Combi boiler in kitchen cupboard, pressure dropping to 0 bar.',
        summaryBullet: 'Automated SMS notification & Gas Safe engineer calendar booking confirmed.',
        setupPlaceholders: {
            name: 'e.g. Dave Miller',
            businessName: 'e.g. Miller Plumbing Ltd',
            contact: 'e.g. 07700 900123 or hello@millerplumbing.co.uk',
            serviceArea: 'e.g. Greater Manchester, within 15 miles'
        }
    },
    {
        id: 'electricians',
        name: 'Electricians & EV Chargers',
        shortName: 'Electricians',
        icon: 'Zap',
        eyebrow: 'ELECTRICAL & INSPECTION BOOKING FLOW DEMO',
        demoTitle: 'How Electricians Capture Certified Bookings 24/7',
        confirmationTitle: 'Electrical Inspection Confirmed!',
        tagline: 'Automate EICR inspections, fault call-outs, and EV charger surveys.',
        defaultService: 'Landlord EICR Certificate (£120 Up To 5 Circuits)',
        services: [
            'Landlord EICR Certificate (£120)',
            'Emergency Fault Call-Out (£95)',
            'EV Charger Installation Survey (Free)',
            'Consumer Unit Upgrade Quote',
            'Rewire / Extension First-Fix Estimate'
        ],
        timeSlots: ['08:30 AM', '10:30 AM', '01:30 PM', '03:30 PM'],
        customFields: [
            {
                id: 'fuseboxType',
                label: 'Consumer Unit / Fusebox *',
                type: 'select',
                options: [
                    'Modern RCD Board',
                    'Old Rewirable Fusebox',
                    'Dual RCD Board',
                    'Not Sure / Need Survey'
                ]
            },
            {
                id: 'propertySize',
                label: 'Property Size *',
                type: 'select',
                options: [
                    '1-2 Bedroom Property',
                    '3-4 Bedroom House',
                    '5+ Bedroom / HMO',
                    'Commercial Unit'
                ]
            }
        ],
        uploadPrompt: 'Upload a clear photo of your existing fusebox / consumer unit',
        notesPlaceholder: 'E.g. Lights flickering in upstairs hallway, trip switch won’t reset.',
        summaryBullet: 'NICEIC / Part P compliant booking logged into job management calendar.',
        setupPlaceholders: {
            name: 'e.g. Sam Patel',
            businessName: 'e.g. Patel Electrical Ltd',
            contact: 'e.g. 07700 900234 or jobs@pateelectrical.co.uk',
            serviceArea: 'e.g. Birmingham & West Midlands'
        }
    },
    {
        id: 'cleaners',
        name: 'Cleaning Services',
        shortName: 'Cleaning',
        icon: 'Sparkles',
        eyebrow: 'CLEANING SERVICE BOOKING FLOW DEMO',
        demoTitle: 'How Cleaning Companies Secure Recurring Clients 24/7',
        confirmationTitle: 'Cleaning Service Confirmed!',
        tagline: 'Self-serve options for end of tenancy, oven cleaning, and domestic cleans.',
        defaultService: 'End of Tenancy Deep Clean (£160 Fixed Rate)',
        services: [
            'End of Tenancy Deep Clean (£160)',
            'Weekly Domestic Clean (£20/hr)',
            'Oven & Range Deep Clean (£65)',
            'Upholstery Steam Cleaning (£95)',
            'Commercial Office Clean (Free Quote)'
        ],
        timeSlots: ['09:00 AM', '11:30 AM', '02:00 PM', '04:00 PM'],
        customFields: [
            {
                id: 'bedBathCount',
                label: 'Property Size *',
                type: 'select',
                options: [
                    '1 Bed, 1 Bath Flat',
                    '2 Bed, 1-2 Bath House',
                    '3 Bed, 2 Bath House',
                    '4+ Bed Family Home'
                ]
            },
            {
                id: 'cleanType',
                label: 'Cleaning Focus *',
                type: 'select',
                options: [
                    'End of Tenancy Clean',
                    'Deep Spring Clean',
                    'Weekly Domestic',
                    'Post-Builder Clean'
                ]
            }
        ],
        uploadPrompt: 'Upload a photo of oven, kitchen or room needing deep clean',
        notesPlaceholder:
            'E.g. End of tenancy clean needed before 4pm check-out, oven needs double clean.',
        summaryBullet: 'Instant booking deposit secured with key handover instructions saved.',
        setupPlaceholders: {
            name: 'e.g. Amy Clarke',
            businessName: 'e.g. Sparkle Clean Co',
            contact: 'e.g. 07700 900345 or book@sparkleclean.co.uk',
            serviceArea: 'e.g. Leeds, within 10 miles'
        }
    },
    {
        id: 'valeting',
        name: 'Mobile Car Valeters & Detailers',
        shortName: 'Car Valeting',
        icon: 'Car',
        eyebrow: 'MOBILE VALETING BOOKING FLOW DEMO',
        demoTitle: 'How Mobile Valeters Keep Calendar Full 24/7',
        confirmationTitle: 'Valeting Booking Confirmed!',
        tagline: 'Book full exterior valets, ceramic coatings, and interior extractions.',
        defaultService: 'Full Exterior & Interior Deep Valet (£75)',
        services: [
            'Full Deep Valet (£75)',
            'Ceramic Paint Coating (£250)',
            'Maintenance Wash & Vac (£45)',
            'Upholstery Stain Extraction (£90)',
            'Machine Polish & Scratch Repair (£180)'
        ],
        timeSlots: ['08:30 AM', '11:00 AM', '01:30 PM', '04:00 PM'],
        customFields: [
            {
                id: 'vehicleClass',
                label: 'Vehicle Class *',
                type: 'select',
                options: [
                    'Hatchback / Saloon',
                    'Estate / Crossover',
                    'SUV / 4x4 / Pickup',
                    'Commercial Van'
                ]
            },
            {
                id: 'powerWaterAccess',
                label: 'Power & Water *',
                type: 'select',
                options: [
                    'Water & Electric Available',
                    'Water Only (Genny Needed)',
                    'Van Self-Contained'
                ]
            }
        ],
        uploadPrompt: 'Upload a photo of your vehicle or specific scratch/stain area',
        notesPlaceholder: 'E.g. BMW 3 Series in driveway, heavy dog hair in boot area.',
        summaryBullet: 'Mobile rig location dispatch queued with instant customer confirmation.',
        setupPlaceholders: {
            name: 'e.g. Jordan Lee',
            businessName: 'e.g. Lee Mobile Valeting',
            contact: 'e.g. 07700 900456 or book@leevalet.co.uk',
            serviceArea: 'e.g. Bristol & Bath'
        }
    },
    {
        id: 'pressure-washing',
        name: 'Pressure Washing & Exterior',
        shortName: 'Pressure Wash',
        icon: 'Droplets',
        eyebrow: 'PRESSURE WASHING BOOKING FLOW DEMO',
        demoTitle: 'How Exterior Cleaners Get Instant Photo Estimates',
        confirmationTitle: 'Pressure Washing Confirmed!',
        tagline: 'Book driveway cleaning, patio re-sanding, and roof moss removal.',
        defaultService: 'Block Paving Driveway Clean & Re-Sand (£140)',
        services: [
            'Block Paving Clean & Sand (£140)',
            'Indian Sandstone Restoration (£180)',
            'Roof Moss Soft Wash (£350)',
            'Decking Anti-Slip Sealing (£110)',
            'Commercial Render Clean (Free Survey)'
        ],
        timeSlots: ['09:00 AM', '11:30 AM', '02:00 PM', '04:00 PM'],
        customFields: [
            {
                id: 'areaSize',
                label: 'Estimated Area Size *',
                type: 'select',
                options: [
                    'Single Car (<30m²)',
                    '2-3 Car (30-70m²)',
                    'Large Drive (>70m²)',
                    'Full House Roof'
                ]
            },
            {
                id: 'surfaceCondition',
                label: 'Surface Condition *',
                type: 'select',
                options: [
                    'Heavy Moss & Weeds',
                    'Oil / Black Lichen Spots',
                    'General Weathering',
                    'Newly Laid (Seal Only)'
                ]
            }
        ],
        uploadPrompt: 'Upload a photo of your driveway, patio or roof area',
        notesPlaceholder:
            'E.g. Block paving with weeds between joints, outdoor tap next to side gate.',
        summaryBullet: 'Square metre estimate calculated with photo assessment stored.',
        setupPlaceholders: {
            name: 'e.g. Chris Walsh',
            businessName: 'e.g. Walsh Exterior Clean',
            contact: 'e.g. 07700 900567 or hello@walshexterior.co.uk',
            serviceArea: 'e.g. Sheffield, South Yorkshire'
        }
    },
    {
        id: 'pest-control',
        name: 'Pest Control Services',
        shortName: 'Pest Control',
        icon: 'Bug',
        eyebrow: 'PEST CONTROL BOOKING FLOW DEMO',
        demoTitle: 'How Pest Control Teams Route Emergency Visits 24/7',
        confirmationTitle: 'Pest Control Visit Confirmed!',
        tagline: 'Instant booking for wasps, rodents, fleas, and bird proofing.',
        defaultService: 'Wasp Nest Removal (£65 Guaranteed)',
        services: [
            'Wasp Nest Removal (£65)',
            'Rodent Control 3-Visit Package (£150)',
            'Bedbug Thermal Treatment (£220)',
            'Pigeon Bird Proofing (Free Survey)',
            'Commercial Pest Audit'
        ],
        timeSlots: ['08:00 AM', '10:30 AM', '01:00 PM', '03:30 PM'],
        customFields: [
            {
                id: 'pestType',
                label: 'Pest Identified *',
                type: 'select',
                options: ['Wasp Nest / Hornets', 'Rats / Mice', 'Bedbugs / Fleas', 'Pigeons / Birds']
            },
            {
                id: 'locationOnSite',
                label: 'Pest Location *',
                type: 'select',
                options: ['Loft / Roof Space', 'Kitchen Area', 'Garden / Shed', 'Cavity Wall / Floor']
            }
        ],
        uploadPrompt: 'Upload a photo of pest activity, entry point or nest location',
        notesPlaceholder:
            'E.g. Wasp nest under roof tiles near bedroom window, active since yesterday.',
        summaryBullet: 'Discreet BPCA-compliant technician visit confirmed with safety note.',
        setupPlaceholders: {
            name: 'e.g. Nina Brooks',
            businessName: 'e.g. Brooks Pest Control',
            contact: 'e.g. 07700 900678 or call@brookspest.co.uk',
            serviceArea: 'e.g. Nottingham & surrounds'
        }
    },
    {
        id: 'gardeners',
        name: 'Gardeners & Landscapers',
        shortName: 'Gardeners',
        icon: 'Trees',
        eyebrow: 'GARDEN & LANDSCAPING BOOKING FLOW DEMO',
        demoTitle: 'How Gardeners Keep Seasonal Schedule Filled 24/7',
        confirmationTitle: 'Garden Maintenance Confirmed!',
        tagline: 'Book regular lawn maintenance, hedge trimming, and patio quotes.',
        defaultService: 'Fortnightly Lawn Mowing & Border Care (£35/visit)',
        services: [
            'Lawn Mowing & Care (£35/visit)',
            'Hedge Trimming & Reduction (£90)',
            'Garden Clearance (£180)',
            'Patio / Turf Survey (Free Visit)',
            'Tree Pruning Quote'
        ],
        timeSlots: ['08:30 AM', '11:00 AM', '01:30 PM', '04:00 PM'],
        customFields: [
            {
                id: 'gardenSize',
                label: 'Garden Size *',
                type: 'select',
                options: [
                    'Small Garden (<100m²)',
                    'Medium Lawn (100-300m²)',
                    'Large Garden (>300m²)',
                    'Commercial Grounds'
                ]
            },
            {
                id: 'wasteDisposal',
                label: 'Green Waste *',
                type: 'select',
                options: ['Include Full Waste Removal', 'Client Compost / Bin']
            }
        ],
        uploadPrompt: 'Upload a photo of your garden, lawn or overgrown hedge',
        notesPlaceholder: 'E.g. Front and back lawns need cutting, side gate unlocked.',
        summaryBullet: 'Seasonal maintenance slot reserved with green waste fee itemised.',
        setupPlaceholders: {
            name: 'e.g. Tom Hayes',
            businessName: 'e.g. Hayes Garden Care',
            contact: 'e.g. 07700 900789 or hello@hayesgardens.co.uk',
            serviceArea: 'e.g. Surrey, within 20 miles'
        }
    },
    {
        id: 'salons',
        name: 'Salons & Aesthetics',
        shortName: 'Salons & Beauty',
        icon: 'Scissors',
        eyebrow: 'SALON & BEAUTY BOOKING FLOW DEMO',
        demoTitle: 'How Salons & Aesthetic Clinics Fill Appointment Book 24/7',
        confirmationTitle: 'Salon Appointment Confirmed!',
        tagline: 'Seamless bookings for hair restyles, facials, nails, and doctor consultations.',
        defaultService: 'Facial Rejuvenation & Skin Peel (£70)',
        services: [
            'Facial Rejuvenation (£70)',
            'Hair Cut, Colour & Restyle (£85)',
            'Full Set Gel Nails (£55)',
            'Doctor Consultation (£50 Deposit)',
            'Lash Lift & Brow Lamination (£50)'
        ],
        timeSlots: ['10:00 AM', '12:00 PM', '02:30 PM', '05:00 PM'],
        customFields: [
            {
                id: 'practitionerPref',
                label: 'Practitioner *',
                type: 'select',
                options: ['First Available', 'Senior Therapist', 'Cosmetic Doctor']
            },
            {
                id: 'patchTest',
                label: 'Patch Test *',
                type: 'select',
                options: ['Patch Test Completed', 'Need 48h Patch Test', 'First-Time Visit']
            }
        ],
        uploadPrompt: 'Upload a hair inspiration photo or current skin concern',
        notesPlaceholder:
            'E.g. Wanting to go from dark brown to balayage blonde, skin sensitive.',
        summaryBullet: 'Automated deposit captured with intake medical questionnaire link sent.',
        setupPlaceholders: {
            name: 'e.g. Ella Morgan',
            businessName: 'e.g. Morgan Aesthetics',
            contact: 'e.g. 07700 900890 or book@morganaesthetics.co.uk',
            serviceArea: 'e.g. Central London / Chelsea'
        }
    },
    {
        id: 'personal-trainers',
        name: 'Personal Trainers & Fitness',
        shortName: 'Personal Trainers',
        icon: 'Dumbbell',
        eyebrow: 'PERSONAL TRAINING BOOKING FLOW DEMO',
        demoTitle: 'How Fitness Coaches Convert Consultations 24/7',
        confirmationTitle: 'Personal Training Confirmed!',
        tagline: 'Book 1-on-1 consultations, transformation packages, and group PT.',
        defaultService: '1-on-1 Fitness & Nutrition Assessment (Free)',
        services: [
            '1-on-1 Fitness Assessment (Free)',
            '12-Wk Transformation (£240/mo)',
            'Partner / Small Group PT (£35)',
            'Online Custom Coaching (£99/mo)',
            'Movement Screening (£60)'
        ],
        timeSlots: ['06:30 AM', '08:00 AM', '05:30 PM', '07:00 PM'],
        customFields: [
            {
                id: 'primaryGoal',
                label: 'Primary Goal *',
                type: 'select',
                options: [
                    'Fat Loss & Toning',
                    'Muscle & Strength',
                    'Event Preparation',
                    'Rehab & Mobility'
                ]
            },
            {
                id: 'trainingLoc',
                label: 'Location *',
                type: 'select',
                options: [
                    'Private Studio Gym',
                    'Client Home / Garden',
                    'Outdoor Park',
                    'Online Zoom'
                ]
            }
        ],
        uploadPrompt: 'Upload optional current physique photo or medical note',
        notesPlaceholder:
            'E.g. Want to lose 10kg before wedding in 4 months, minor lower back stiffness.',
        summaryBullet: 'Discovery call synced to trainer calendar with health intake form.',
        setupPlaceholders: {
            name: 'e.g. Alex Reid',
            businessName: 'e.g. Reid Performance PT',
            contact: 'e.g. 07700 900901 or coach@reidpt.co.uk',
            serviceArea: 'e.g. Manchester city & Salford'
        }
    },
    {
        id: 'restaurants',
        name: 'Restaurants & Cafes',
        shortName: 'Restaurants',
        icon: 'Utensils',
        eyebrow: 'RESTAURANT RESERVATION FLOW DEMO',
        demoTitle: 'How Restaurants Capture Out-of-Hours Tables 24/7',
        confirmationTitle: 'Table Reservation Confirmed!',
        tagline: 'Automated table booking with party size, sitting times, and dietary intake.',
        defaultService: 'Standard Table Reservation (2-6 Guests)',
        services: [
            'Standard Reservation (2-6 Guests)',
            'Sunday Roast Family Table',
            'Private Room Hire (8-16 Guests)',
            'Chef Tasting Menu Reservation',
            'Outdoor Terrace Table'
        ],
        timeSlots: ['12:30 PM', '02:00 PM', '06:00 PM', '08:15 PM'],
        customFields: [
            {
                id: 'partySize',
                label: 'Party Size *',
                type: 'select',
                options: ['2 Guests', '3-4 Guests', '5-6 Guests', '7+ Large Group']
            },
            {
                id: 'dietaryReqs',
                label: 'Dietary Needs *',
                type: 'select',
                options: [
                    'Standard Menu',
                    'Vegetarian / Vegan',
                    'Gluten-Free Required',
                    'Nut / Dairy Allergy'
                ]
            }
        ],
        uploadPrompt: 'Upload optional cake request or seating preference image',
        notesPlaceholder:
            'E.g. High chair needed for toddler, booth seating preferred if available.',
        summaryBullet: 'Instant SMS table confirmation sent with 15-minute hold policy.',
        setupPlaceholders: {
            name: 'e.g. Maria Costa',
            businessName: 'e.g. Costa Kitchen',
            contact: 'e.g. 0161 000 0000 or reservations@costakitchen.co.uk',
            serviceArea: 'e.g. Northern Quarter, Manchester'
        }
    },
    {
        id: 'professional-services',
        name: 'Professional Services',
        shortName: 'Professional Services',
        icon: 'Building2',
        eyebrow: 'PROFESSIONAL SERVICES CONSULTATION DEMO',
        demoTitle: 'How Consultants & Accountants Pre-Qualify Leads 24/7',
        confirmationTitle: 'Consultation Booking Confirmed!',
        tagline: 'Book strategy calls, tax reviews, and corporate advisory sessions.',
        defaultService: 'Free 30-Min Initial Strategy Discovery Call',
        services: [
            'Free 30-Min Strategy Call',
            'Tax Efficiency Review (£150)',
            'Annual Accounts Filing Consultation',
            'Business Exit Advisory Session',
            'Legal & Contract Review'
        ],
        timeSlots: ['09:30 AM', '11:00 AM', '02:00 PM', '04:00 PM'],
        customFields: [
            {
                id: 'turnoverRange',
                label: 'Annual Turnover *',
                type: 'select',
                options: [
                    'Startup / Pre-Revenue',
                    '£100k - £500k',
                    '£500k - £2M',
                    '£2M+ Corporate'
                ]
            },
            {
                id: 'consultTopic',
                label: 'Area of Interest *',
                type: 'select',
                options: ['Tax Minimisation', 'Company Structure', 'Audit & HMRC', 'M&A Advisory']
            }
        ],
        uploadPrompt: 'Upload company accounts draft or HMRC notice for review',
        notesPlaceholder: 'E.g. Looking to restructure LTD company before end of tax year.',
        summaryBullet: 'Calendar invite with Video link generated and NDA confirmation.',
        setupPlaceholders: {
            name: 'e.g. James Orr',
            businessName: 'e.g. Orr Advisory LLP',
            contact: 'e.g. 020 0000 0000 or office@orradvisory.co.uk',
            serviceArea: 'e.g. City of London'
        }
    },
    {
        id: 'small-business',
        name: 'Small Businesses',
        shortName: 'Small Biz',
        icon: 'Store',
        eyebrow: 'SMALL BUSINESS BOOKING FLOW DEMO',
        demoTitle: 'How Local Businesses Turn Visitors Into Bookings 24/7',
        confirmationTitle: 'Small Business Booking Confirmed!',
        tagline: 'Tailored quotes, site visits, and instant service bookings.',
        defaultService: 'Free On-Site Consultation & Quote',
        services: [
            'Free On-Site Consultation & Quote',
            'Standard Inspection Visit',
            'Express Service Call-Out',
            'Project Measurement & Survey',
            'Maintenance Contract Advisory'
        ],
        timeSlots: ['09:00 AM', '11:30 AM', '02:00 PM', '04:30 PM'],
        customFields: [
            {
                id: 'serviceNeed',
                label: 'Service Required *',
                type: 'select',
                options: ['New Installation', 'Repair & Fix', 'Routine Servicing', 'Emergency Issue']
            }
        ],
        uploadPrompt: 'Upload a photo of your project, site or item needing work',
        notesPlaceholder: 'E.g. Looking to get an upfront estimate before starting next week.',
        summaryBullet: 'Instant enquiry confirmation logged into dashboard with notification.',
        setupPlaceholders: {
            name: 'e.g. Priya Shah',
            businessName: 'e.g. Shah Local Services',
            contact: 'e.g. 07700 901012 or hello@shahlocal.co.uk',
            serviceArea: 'e.g. Leicester & county'
        }
    }
];

export function isBookingPlanId(planId: string): boolean {
    return String(planId || '').startsWith('booking-');
}

export function normalizeBookingIndustryId(raw: unknown): BookingIndustryId | null {
    const id = String(raw || '')
        .trim()
        .toLowerCase();
    if (!id) return null;
    return (BOOKING_INDUSTRY_IDS as readonly string[]).includes(id)
        ? (id as BookingIndustryId)
        : null;
}

export function bookingIndustryLabel(id: string | null | undefined): string | null {
    if (!id) return null;
    const preset = bookingIndustryPresets.find((p) => p.id === id);
    return preset?.name || id;
}

export function getBookingPreset(industryId: string | null | undefined): BookingIndustryPreset {
    if (!industryId || typeof industryId !== 'string') return bookingIndustryPresets[0];
    const idLower = industryId.toLowerCase();

    if (idLower.includes('plumb') || idLower.includes('boiler') || idLower.includes('heating')) {
        return bookingIndustryPresets[0];
    }
    if (idLower.includes('electr') || idLower.includes('ev') || idLower.includes('eicr')) {
        return bookingIndustryPresets[1];
    }
    if (idLower.includes('clean')) return bookingIndustryPresets[2];
    if (idLower.includes('valet') || idLower.includes('detail') || idLower.includes('car')) {
        return bookingIndustryPresets[3];
    }
    if (idLower.includes('pressure') || idLower.includes('patio') || idLower.includes('driveway')) {
        return bookingIndustryPresets[4];
    }
    if (idLower.includes('pest') || idLower.includes('wasp') || idLower.includes('rat')) {
        return bookingIndustryPresets[5];
    }
    if (idLower.includes('garden') || idLower.includes('landscap') || idLower.includes('lawn')) {
        return bookingIndustryPresets[6];
    }
    if (
        idLower.includes('salon') ||
        idLower.includes('beauty') ||
        idLower.includes('hair') ||
        idLower.includes('aesthetic')
    ) {
        return bookingIndustryPresets[7];
    }
    if (
        idLower.includes('personal') ||
        idLower.includes('pt') ||
        idLower.includes('fitness') ||
        idLower.includes('trainer')
    ) {
        return bookingIndustryPresets[8];
    }
    if (
        idLower.includes('restaurant') ||
        idLower.includes('food') ||
        idLower.includes('dining') ||
        idLower.includes('cafe')
    ) {
        return bookingIndustryPresets[9];
    }
    if (idLower.includes('profess') || idLower.includes('accountant') || idLower.includes('consult')) {
        return bookingIndustryPresets[10];
    }
    if (idLower.includes('small') || idLower.includes('biz')) return bookingIndustryPresets[11];

    const found = bookingIndustryPresets.find((p) => p.id === idLower);
    return found || bookingIndustryPresets[0];
}

export function slugifyServiceName(name: string): string {
    return String(name || '')
        .toLowerCase()
        .replace(/£[\d.,]+/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'service';
}
