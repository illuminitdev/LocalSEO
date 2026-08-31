function buildIcs({ uid, summary, description, location, startAt, endAt }) {
    const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//LocalPulse//Booking//EN',
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${fmt(new Date())}`,
        `DTSTART:${fmt(startAt)}`,
        `DTEND:${fmt(endAt)}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
        `LOCATION:${location || ''}`,
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
}

module.exports = { buildIcs };
