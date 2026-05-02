const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Parseur iCal minimal, compatible VALUE=DATE (format Airbnb & Booking)
function parseIcal(text) {
  const events = [];
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  let current = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT' && current) {
      if (current.dtstart && current.dtend) events.push(current);
      current = null;
    } else if (current) {
      if (line.startsWith('DTSTART')) {
        const val = line.split(':').slice(1).join(':').trim();
        // VALUE=DATE : YYYYMMDD
        if (/^\d{8}$/.test(val)) {
          current.dtstart = `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)}`;
        } else {
          // DATETIME : YYYYMMDDTHHMMSSZ → garde juste la date
          current.dtstart = val.slice(0, 10).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        }
      } else if (line.startsWith('DTEND')) {
        const val = line.split(':').slice(1).join(':').trim();
        if (/^\d{8}$/.test(val)) {
          current.dtend = `${val.slice(0,4)}-${val.slice(4,6)}-${val.slice(6,8)}`;
        } else {
          current.dtend = val.slice(0, 10).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
        }
      } else if (line.startsWith('SUMMARY:')) {
        current.summary = line.slice(8).trim();
      }
    }
  }
  return events;
}

function expandDates(start, end) {
  const dates = [];
  const cur = new Date(start + 'T00:00:00Z');
  const last = new Date(end + 'T00:00:00Z');
  while (cur < last) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

async function syncCalendar(url, source) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${source} échoué : ${res.status}`);
  const text = await res.text();
  const events = parseIcal(text);

  const rows = [];
  for (const ev of events) {
    for (const date of expandDates(ev.dtstart, ev.dtend)) {
      rows.push({ date, source, label: ev.summary || null, synced_at: new Date().toISOString() });
    }
  }

  if (rows.length === 0) return 0;

  const { error } = await getSupabase()
    .from('blocked_dates')
    .upsert(rows, { onConflict: 'date,source' });

  if (error) throw new Error(`Supabase ${source} : ${error.message}`);
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
