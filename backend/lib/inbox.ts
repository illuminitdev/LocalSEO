import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { query } from './db';

function snsClient() {
    return new SNSClient({ region: process.env.AWS_REGION || process.env.SES_REGION || 'us-east-1' });
}

/** On Lambda, IAM sns:Publish is enough. Locally set SMS_VIA_SNS=true (or any AWS creds) to attempt send. */
export function smsConfigured() {
    if (String(process.env.SMS_DISABLED || '').toLowerCase() === 'true') return false;
    // Always attempt on Lambda; locally allow log-only unless explicitly enabled
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
    if (String(process.env.SMS_VIA_SNS || '').toLowerCase() === 'true') return true;
    if (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE) return true;
    return false;
}

function normalizePhone(phone: string) {
    const raw = String(phone || '').replace(/[^\d+]/g, '');
    if (!raw) return '';
    if (raw.startsWith('+')) return raw;
    if (/^0\d{9,10}$/.test(raw)) return `+44${raw.slice(1)}`;
    if (/^\d{10,15}$/.test(raw)) return `+${raw}`;
    return raw;
}

export async function sendSms(to: string, body: string) {
    const phone = normalizePhone(to);
    const message = String(body || '').trim().slice(0, 1500);
    if (!phone || !message) return { sent: false, sid: null as string | null };

    if (!smsConfigured()) {
        console.log('[sms:log]', { to: phone, body: message.slice(0, 160) });
        return { sent: false, sid: null, logged: true };
    }

    try {
        const senderId = String(process.env.SMS_SENDER_ID || '').trim();
        const attrs: Record<string, { DataType: string; StringValue: string }> = {
            'AWS.SNS.SMS.SMSType': { DataType: 'String', StringValue: 'Transactional' }
        };
        if (senderId) {
            attrs['AWS.SNS.SMS.SenderID'] = { DataType: 'String', StringValue: senderId.slice(0, 11) };
        }

        const out = await snsClient().send(
            new PublishCommand({
                PhoneNumber: phone,
                Message: message,
                MessageAttributes: attrs
            })
        );
        return { sent: true, sid: out.MessageId || null };
    } catch (err: any) {
        console.error('[sms:sns]', err?.message || err);
        throw Object.assign(new Error(err?.message || 'SNS SMS send failed'), { status: 502 });
    }
}

export async function findOrCreateThread({
    orgId,
    clientId,
    phone,
    name
}: {
    orgId: string;
    clientId?: string | null;
    phone: string;
    name?: string;
}) {
    const customerPhone = normalizePhone(phone);
    if (!customerPhone) throw Object.assign(new Error('Phone required'), { status: 400 });
    const { rows: existing } = await query(
        `SELECT * FROM message_threads WHERE org_id = $1 AND customer_phone = $2 LIMIT 1`,
        [orgId, customerPhone]
    );
    if (existing[0]) {
        if (clientId && !existing[0].client_id) {
            await query(`UPDATE message_threads SET client_id = $1 WHERE id = $2`, [clientId, existing[0].id]);
            existing[0].client_id = clientId;
        }
        return existing[0];
    }
    const { rows } = await query(
        `INSERT INTO message_threads (org_id, client_id, customer_phone, customer_name)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [orgId, clientId || null, customerPhone, String(name || '')]
    );
    return rows[0];
}

export async function appendMessage({
    threadId,
    orgId,
    clientId,
    direction,
    body,
    providerMessageId,
    status
}: {
    threadId: string;
    orgId: string;
    clientId?: string | null;
    direction: 'inbound' | 'outbound';
    body: string;
    providerMessageId?: string | null;
    status?: string;
}) {
    const { rows } = await query(
        `INSERT INTO messages (thread_id, org_id, client_id, direction, channel, body, provider_message_id, status)
         VALUES ($1,$2,$3,$4,'sms',$5,$6,$7) RETURNING *`,
        [threadId, orgId, clientId || null, direction, body, providerMessageId || null, status || 'sent']
    );
    await query(`UPDATE message_threads SET last_message_at = NOW() WHERE id = $1`, [threadId]);
    return rows[0];
}

export async function sendOutboundSms({
    orgId,
    clientId,
    phone,
    name,
    body
}: {
    orgId: string;
    clientId?: string | null;
    phone: string;
    name?: string;
    body: string;
}) {
    const thread = await findOrCreateThread({ orgId, clientId, phone, name });
    const result = await sendSms(thread.customer_phone, body);
    const msg = await appendMessage({
        threadId: thread.id,
        orgId,
        clientId: thread.client_id || clientId,
        direction: 'outbound',
        body,
        providerMessageId: result.sid,
        status: result.sent ? 'sent' : 'logged'
    });
    return { thread, message: msg, result };
}

export async function listThreads(orgId: string) {
    const { rows } = await query(
        `SELECT t.*,
                (SELECT body FROM messages m WHERE m.thread_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_body
         FROM message_threads t
         WHERE t.org_id = $1
         ORDER BY t.last_message_at DESC
         LIMIT 100`,
        [orgId]
    );
    return rows;
}

export async function getThreadMessages(orgId: string, threadId: string) {
    const { rows: threads } = await query(`SELECT * FROM message_threads WHERE id = $1 AND org_id = $2`, [
        threadId,
        orgId
    ]);
    if (!threads.length) return null;
    const { rows: messages } = await query(
        `SELECT * FROM messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 500`,
        [threadId]
    );
    return { thread: threads[0], messages };
}

/** Best-effort SMS when org has sms_enabled and client has phone. */
export async function maybeSendReminderSms(org: any, phone: string, text: string, clientId?: string) {
    if (!org?.sms_enabled) return null;
    const p = normalizePhone(phone);
    if (!p) return null;
    try {
        return await sendOutboundSms({
            orgId: org.id,
            clientId: clientId || null,
            phone: p,
            name: '',
            body: text
        });
    } catch (err) {
        console.error('[sms] reminder failed', err);
        return null;
    }
}
