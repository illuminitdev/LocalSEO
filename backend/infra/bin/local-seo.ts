#!/usr/bin/env node
import * as path from 'path';
import * as fs from 'fs';
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { LocalSeoApiStack } from '../lib/local-seo-api-stack';

/** Load backend/.env so deploy can inject Gemini/Places/Stripe keys without committing them. */
function loadBackendEnv() {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadBackendEnv();

const app = new cdk.App();
const stage = String(app.node.tryGetContext('stage') || 'dev');
if (stage !== 'dev' && stage !== 'prod') {
  throw new Error(`Invalid stage "${stage}". Use -c stage=dev|prod`);
}

const env = {
  account: '288761766237',
  region: 'us-east-1',
};

new LocalSeoApiStack(app, `LocalSeoApi-${stage}`, {
  env,
  stage: stage as 'dev' | 'prod',
  description: `Local SEO (LocalPulse) API — ${stage}`,
});

app.synth();
