import type { CorsOptions } from 'cors';
import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

/** Allowed browser origins for CORS (comma-separated CORS_ORIGINS / CLIENT_ORIGIN). */
function resolveCorsOrigins(): string[] | true {
    const raw = [
        process.env.CORS_ORIGINS || '',
        process.env.CLIENT_ORIGIN || '',
        process.env.ADMIN_ORIGIN || '',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:4173',
        'https://zappsites-local-seo.vercel.app',
        'https://app.zappsites.com',
        'https://www.zappsites.com'
    ]
        .join(',')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const unique = [...new Set(raw)];
    if (process.env.CORS_ALLOW_ALL === 'true') return true;
    return unique;
}

function corsOptions(): CorsOptions {
    const allowed = resolveCorsOrigins();
    if (allowed === true) {
        return { origin: true, credentials: false, maxAge: 86400 };
    }
    return {
        origin(origin, callback) {
            // Non-browser clients (curl, server-to-server, mobile native) send no Origin
            if (!origin) return callback(null, true);
            if (allowed.includes(origin)) return callback(null, true);
            return callback(null, false);
        },
        credentials: false,
        maxAge: 86400,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Authorization', 'Content-Type', 'X-Booking-Org']
    };
}

function securityHeaders(): RequestHandler {
    return helmet({
        contentSecurityPolicy: false, // API-only; SPA hosts its own CSP
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        referrerPolicy: { policy: 'no-referrer' },
        hsts: process.env.STAGE === 'prod' || process.env.NODE_ENV === 'production'
            ? { maxAge: 15552000, includeSubDomains: true }
            : false
    });
}

/** Global soft limit — API Gateway throttling is the primary control on AWS. */
function globalRateLimit() {
    return rateLimit({
        windowMs: 60 * 1000,
        max: Number(process.env.RATE_LIMIT_GLOBAL_MAX || 180),
        standardHeaders: true,
        legacyHeaders: false,
        // Lambda / API Gateway multi-IP X-Forwarded-For trips default validations
        validate: false,
        message: { error: 'Too many requests. Please try again shortly.' }
    });
}

/** Stricter limit on login / register / password reset / admin login. */
function authRateLimit() {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        max: Number(process.env.RATE_LIMIT_AUTH_MAX || 40),
        standardHeaders: true,
        legacyHeaders: false,
        validate: false,
        message: { error: 'Too many auth attempts. Please wait and try again.' }
    });
}

/** If API Gateway / serverless left body as a raw JSON string, parse it. */
function parseJsonBodyFallback(): RequestHandler {
    return (req, _res, next) => {
        if (typeof req.body === 'string') {
            const raw = req.body.trim();
            if (!raw) {
                req.body = {};
            } else {
                try {
                    req.body = JSON.parse(raw);
                } catch {
                    /* leave string; route will 400 */
                }
            }
        } else if (Buffer.isBuffer(req.body)) {
            try {
                req.body = JSON.parse(req.body.toString('utf8') || '{}');
            } catch {
                req.body = {};
            }
        } else if (req.body == null) {
            req.body = {};
        }
        next();
    };
}

export {
    corsOptions,
    securityHeaders,
    globalRateLimit,
    authRateLimit,
    parseJsonBodyFallback,
    resolveCorsOrigins
};
