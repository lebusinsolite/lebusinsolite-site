const ical = require('node-ical');
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function toDateString(d) {
  return new Date(d).toISOString().split('T')[0];
}

function expandDates(start, end) {
  const dates = [];
  const current = new Date(start);
  const last = new Date(end);
  while (current < last) {
    dates.push(toDateString(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

async function syncCalendar(url, source) {
  const events = await ical.async.fromURL(url);
  const rows = [];
  for (const event of Object.values(events)) {
    if (event.type !== 'VEVENT' || !event.dtstart || !event.dtend) continue;
    for (const date of expandDates(event.dtstart, event.dtend)) {
      rows.push({ date, source, label: event.summary || null, synced_at: new Date().toISOString() });
    }
  }
  if (rows.length === 0) return 0;
  const { error } = await getSupabase().from('blocked_dates').upsert(rows, { onConflict: 'date,source' });
  if (error) throw new Error(`${source}: ${error.message}`);
  return rows.length;
}

module.exports.handler = async () => {
  try {
    const [airbnb, booking] = await Promise.all([
      syncCalendar(process.env.AIRBNB_ICAL_URL, 'airbnb'),
      syncCalendar(process.env.BOOKING_ICAL_URL, 'booking'),
    ]);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, airbnb, booking }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
