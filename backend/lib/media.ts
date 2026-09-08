import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;

function mediaBucket() {
    return String(process.env.MEDIA_BUCKET || '').trim();
}

function s3Client() {
    return new S3Client({ region: process.env.AWS_REGION || process.env.SES_REGION || 'us-east-1' });
}

export function mediaConfigured() {
    return Boolean(mediaBucket());
}

export async function createUploadPresign({
    kind,
    contentType,
    orgId,
    userId
}: {
    kind: 'avatar' | 'job';
    contentType: string;
    orgId?: string;
    userId?: string;
}) {
    const bucket = mediaBucket();
    if (!bucket) {
        throw Object.assign(new Error('Media uploads are not configured'), { status: 503 });
    }
    const type = String(contentType || '').toLowerCase();
    if (!ALLOWED_TYPES.has(type)) {
        throw Object.assign(new Error('Only JPEG, PNG, WebP, or GIF images are allowed'), { status: 400 });
    }
    const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : type === 'image/gif' ? 'gif' : 'jpg';
    const prefix = kind === 'avatar' ? 'avatars' : 'jobs';
    const owner = kind === 'avatar' ? userId || 'user' : orgId || 'org';
    const key = `${prefix}/${owner}/${randomUUID()}.${ext}`;

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: type
    });
    const uploadUrl = await getSignedUrl(s3Client(), command, { expiresIn: 300 });
    const publicUrl = `https://${bucket}.s3.amazonaws.com/${key}`;
    return { uploadUrl, publicUrl, key, maxBytes: MAX_BYTES };
}

export function isAllowedMediaUrl(url: string) {
    const u = String(url || '').trim();
    if (!u.startsWith('https://')) return false;
    const bucket = mediaBucket();
    if (bucket && u.includes(`${bucket}.s3`)) return true;
    // Allow any https for job photos when bucket unset (local / URL fallback)
    return !bucket;
}
