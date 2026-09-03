/**
 * AWS Lambda entry — Express via @codegenie/serverless-express.
 * Runs LocalPulse-owned migrations once per cold start (skips ZappSites 005/006 on SHARED_RDS).
 */
import serverlessExpress from '@codegenie/serverless-express';
import app from './server';
import { migrate } from './lib/db';

let ready: Promise<void> | null = null;
let handlerPromise: Promise<any> | null = null;

async function ensureReady() {
    if (!ready) {
        ready = migrate()
            .then(() => {
                console.log('[lambda] Migrations complete');
            })
            .catch((err) => {
                console.error('[lambda] Migration failed:', err?.message || err);
            });
    }
    await ready;
}

function getServerlessHandler() {
    if (!handlerPromise) {
        handlerPromise = Promise.resolve(serverlessExpress({ app }));
    }
    return handlerPromise;
}

export const handler = async (event: any, context: any) => {
    await ensureReady();
    const h = await getServerlessHandler();
    return h(event, context);
};
