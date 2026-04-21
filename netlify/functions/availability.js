const { createClient } = require('@supabase/supabase-js');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
}

function dateRange(start, end) {
  const dates = [];
  const current = new Date(start);
  const last = new Date(end);
  while (current < last) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

module.exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

  const { checkin, checkout } = event.queryStringParameters || {};

  if (!checkin || !checkout) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Paramètres checkin et checkout requis' }) };
  }

  const checkInDate = new Date(checkin);
  const checkOutDate = new Date(checkout);

  if (isNaN(checkInDate) || isNaN(checkOutDate) || checkOutDate <= checkInDate) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Dates invalides' }) };
  }

  const nights = (checkOutDate - checkInDate) / 86400000;
  if (nights < 1 || nights > 30) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Durée invalide (1–30 nuits)' }) };
  }

  const requestedDates = dateRange(checkin, checkout);
  const supabase = getSupabase();

  // Vérifier dates bloquées (Airbnb/Booking/manuel)
  const { data: blocked, error: e1 } = await supabase
    .from('blocked_dates')
    .select('date')
    .in('date', requestedDates);

  if (e1) return { statusCode: 500, headers, body: JSON.stringify({ error: e1.message }) };

  if (blocked.length > 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ available: false, reason: 'blocked' }) };
  }

  // Vérifier réservations confirmées existantes
  const { data: existing, error: e2 } = await supabase
    .from('reservations')
    .select('checkin, checkout')
    .eq('status', 'confirmed')
    .lt('checkin', checkout)
    .gt('checkout', checkin);

  if (e2) return { statusCode: 500, headers, body: JSON.stringify({ error: e2.message }) };

  if (existing.length > 0) {
    return { statusCode: 200, headers, body: JSON.stringify({ available: false, reason: 'reserved' }) };
  }

  return { statusCode: 200, headers, body: JSON.stringify({ available: true, nights }) };
};
