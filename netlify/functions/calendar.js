const { createClient } = require('@supabase/supabase-js');

function pad(n) { return String(n).padStart(2, '0'); }

function toICalDate(iso) {
  return iso.replace(/-/g, '');
}

function toICalDateTime(date) {
  const d = new Date(date);
  return d.getUTCFullYear()
    + pad(d.getUTCMonth() + 1)
    + pad(d.getUTCDate())
    + 'T'
    + pad(d.getUTCHours())
    + pad(d.getUTCMinutes())
    + pad(d.getUTCSeconds())
    + 'Z';
}

function escapeIcal(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

module.exports.handler = async (event) => {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select('id, checkin, checkout, guest_name, nights, guests, created_at')
    .eq('status', 'confirmed')
    .order('checkin', { ascending: true });

  if (error) {
    return { statusCode: 500, body: 'Erreur Supabase : ' + error.message };
  }

  const now = toICalDateTime(new Date());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Le Bus Insolite//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Le Bus Insolite — Réservations',
    'X-WR-TIMEZONE:Europe/Paris',
  ];

  for (const r of reservations) {
    const uid = `${r.id}@lebusinsolite.fr`;
    const summary = escapeIcal(`Réservé — ${r.guest_name} (${r.guests} pers.)`);
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`DTSTART;VALUE=DATE:${toICalDate(r.checkin)}`);
    lines.push(`DTEND;VALUE=DATE:${toICalDate(r.checkout)}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push(`CREATED:${toICalDateTime(r.created_at)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="lebusinsolite.ics"',
      'Cache-Control': 'no-cache',
    },
    body: lines.join('\r\n'),
  };
};
