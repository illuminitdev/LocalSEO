import { randomBytes } from 'node:crypto';
import { query, isDatabaseEnabled } from './db.js';
import type { AuditJobStatus } from '../types.js';

export async function createAuditJob(auditId: string): Promise<string | null> {
  if (!isDatabaseEnabled()) return null;
  const id = randomBytes(8).toString('hex');
  await query(
    `INSERT INTO audit_jobs (id, audit_id, status) VALUES ($1, $2, 'queued')`,
    [id, auditId]
  );
  return id;
}

export async function updateAuditJob(
  jobId: string,
  status: AuditJobStatus,
  error?: string | null
): Promise<void> {
  if (!isDatabaseEnabled()) return;
  await query(
    `UPDATE audit_jobs SET status = $2, error = $3, updated_at = NOW() WHERE id = $1`,
    [jobId, status, error ?? null]
  );
}

export async function getAuditJob(jobId: string) {
  if (!isDatabaseEnabled()) return null;
  const result = await query(`SELECT * FROM audit_jobs WHERE id = $1`, [jobId]);
  return result.rows[0] ?? null;
}
