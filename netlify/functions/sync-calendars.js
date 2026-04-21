const { schedule } = require('@netlify/functions');
const ical = require('node-ical');
const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function toDateString(d) {
  const date = new Date(d);
  return date.toISOString().split('T')[0];
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
    const dates = expandDates(event.dtstart, event.dtend);
    for (const date of dates) {
      rows.push({
        date,
        source,
        label: event.summary || null,
        synced_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length === 0) return 0;

  const supabase = getSupabase();
  const { error } = await supabase
    .from('blocked_dates')
    .upsert(rows, { onConflict: 'date,source' });

  if (error) throw new Error(`Supabase upsert (${source}): ${error.message}`);
  return rows.length;
}

async function run() {
  const [airbnbCount, bookingCount] = await Promise.all([
    syncCalendar(process.env.AIRBNB_ICAL_URL, 'airbnb'),
    syncCalendar(process.env.BOOKING_ICAL_URL, 'booking'),
  ]);
  console.log(`Sync OK — Airbnb: ${airbnbCount} dates, Booking: ${bookingCount} dates`);
  return { statusCode: 200, body: JSON.stringify({ airbnb: airbnbCount, booking: bookingCount }) };
}

// Déclenchement planifié toutes les 30 min
module.exports.handler = schedule('*/30 * * * *', async () => {
  try {
    return await run();
  } catch (err) {
    console.error('Sync error:', err.message);
    return { statusCode: 500, body: err.message };
  }
});
