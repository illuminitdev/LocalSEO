import { OAuth2Client } from 'google-auth-library';
import calendar from '@googleapis/calendar';
import { query } from './db';

const SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
];

function getOAuthClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const apiBase =
        process.env.API_BASE_URL ||
        process.env.BACKEND_URL ||
        `http://localhost:${process.env.PORT || 5000}`;
    const redirectUri =
        process.env.GOOGLE_REDIRECT_URI ||
        `${apiBase.replace(/\/$/, '')}/api/integrations/google/callback`;
    if (!clientId || !clientSecret) return null;
    return new OAuth2Client(clientId, clientSecret, redirectUri);
}

function getAuthUrl(userId: any) {
    const client = getOAuthClient();
    if (!client) return null;
    return client.generateAuthUrl({
        access_type: 'offline',
        prompt: 'consent',
        scope: SCOPES,
        state: userId
    });
}

async function handleCallback(code: string, userId: any) {
    const client = getOAuthClient();
    if (!client) throw new Error('Google OAuth not configured');
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) throw new Error('No refresh token received — revoke app access and try again');

    await query(
        `INSERT INTO calendar_connections (user_id, google_refresh_token, calendar_id)
         VALUES ($1, $2, 'primary')
         ON CONFLICT (user_id) DO UPDATE SET google_refresh_token = EXCLUDED.google_refresh_token, connected_at = NOW()`,
        [userId, tokens.refresh_token]
    );
    return true;
}

async function getCalendarClient(userId: any) {
    const { rows } = await query('SELECT * FROM calendar_connections WHERE user_id = $1', [userId]);
    if (!rows.length) return null;
    const auth = getOAuthClient();
    if (!auth) return null;
    auth.setCredentials({ refresh_token: rows[0].google_refresh_token });
    const cal = calendar.calendar({ version: 'v3', auth: auth as any });
    return { calendar: cal, calendarId: rows[0].calendar_id };
}

async function fetchBusyBlocks(userId: any, timeMin: any, timeMax: any) {
    const calClient = await getCalendarClient(userId);
    if (!calClient) return [];
    try {
        const res = await calClient.calendar.freebusy.query({
            requestBody: {
                timeMin: new Date(timeMin).toISOString(),
                timeMax: new Date(timeMax).toISOString(),
                items: [{ id: calClient.calendarId }]
            }
        });
        const busy = res.data.calendars?.[calClient.calendarId]?.busy || [];
        return busy.map((b: any) => ({ start: b.start, end: b.end }));
    } catch (err: any) {
        console.error('Google freebusy error:', err.message);
        return [];
    }
}

async function createCalendarEvent(userId: any, booking: any, eventType: any, _org: any) {
    const calClient = await getCalendarClient(userId);
    if (!calClient) return null;
    try {
        const res = await calClient.calendar.events.insert({
            calendarId: calClient.calendarId,
            requestBody: {
                summary: `${eventType.name} — ${booking.customer_name}`,
                description: `Customer: ${booking.customer_name}\nPhone: ${booking.customer_phone}\nEmail: ${booking.customer_email}\nAddress: ${booking.customer_address}\n${booking.description || ''}`,
                location: booking.customer_address,
                start: { dateTime: new Date(booking.start_at).toISOString() },
                end: { dateTime: new Date(booking.end_at).toISOString() }
            }
        });
        return res.data.id;
    } catch (err: any) {
        console.error('Google calendar insert error:', err.message);
        return null;
    }
}

async function updateCalendarEvent(userId: any, googleEventId: any, booking: any) {
    const calClient = await getCalendarClient(userId);
    if (!calClient || !googleEventId) return;
    try {
        await calClient.calendar.events.patch({
            calendarId: calClient.calendarId,
            eventId: googleEventId,
            requestBody: {
                start: { dateTime: new Date(booking.start_at).toISOString() },
                end: { dateTime: new Date(booking.end_at).toISOString() }
            }
        });
    } catch (err: any) {
        console.error('Google calendar update error:', err.message);
    }
}

async function deleteCalendarEvent(userId: any, googleEventId: any) {
    const calClient = await getCalendarClient(userId);
    if (!calClient || !googleEventId) return;
    try {
        await calClient.calendar.events.delete({
            calendarId: calClient.calendarId,
            eventId: googleEventId
        });
    } catch (err: any) {
        console.error('Google calendar delete error:', err.message);
    }
}

export {
    getAuthUrl,
    handleCallback,
    fetchBusyBlocks,
    createCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    getCalendarClient
};
