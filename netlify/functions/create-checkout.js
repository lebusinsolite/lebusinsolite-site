const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const PRICE = {
  night(n) {
    if (n === 1) return 150;
    if (n === 2) return 280;
    return 150 * n - 10 * (n - 1);
  },
  packRomantique: 79,
  packFamille: 49,
  velos2: 30,
  velos4: 50,
  petitDej: { 1: 29, 2: 29, 3: 39, 4: 45 },
  lateCheckout: 20,
};

function expandDates(checkin, checkout) {
  const dates = [];
  const cur = new Date(checkin + 'T00:00:00Z');
  const end = new Date(checkout + 'T00:00:00Z');
  while (cur < end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function frDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function buildLineItems(nights, guests, options) {
  const items = [];

  items.push({
    price_data: {
      currency: 'eur',
      unit_amount: PRICE.night(nights) * 100,
      product_data: {
        name: `Séjour au Bus Insolite — ${nights} nuit${nights > 1 ? 's' : ''}`,
        description: `Jusqu'à 4 personnes · Jacuzzi privatif · Saint-Usage (21)`,
      },
    },
    quantity: 1,
  });

  if (options.packRomantique) items.push({
    price_data: { currency: 'eur', unit_amount: PRICE.packRomantique * 100,
      product_data: { name: 'Pack Romantique' } }, quantity: 1,
  });
  if (options.packFamille) items.push({
    price_data: { currency: 'eur', unit_amount: PRICE.packFamille * 100,
      product_data: { name: 'Pack Famille' } }, quantity: 1,
  });
  if (options.velos === 2) items.push({
    price_data: { currency: 'eur', unit_amount: PRICE.velos2 * 100,
      product_data: { name: '2 vélos' } }, quantity: 1,
  });
  if (options.velos === 4) items.push({
    price_data: { currency: 'eur', unit_amount: PRICE.velos4 * 100,
      product_data: { name: '4 vélos' } }, quantity: 1,
  });
  if (options.petitDejeuner) {
    const price = PRICE.petitDej[guests] || PRICE.petitDej[4];
    items.push({
      price_data: { currency: 'eur', unit_amount: price * 100,
        product_data: { name: `Petit-déjeuner (${guests} pers.)` } }, quantity: 1,
    });
  }
  if (options.lateCheckout) items.push({
    price_data: { currency: 'eur', unit_amount: PRICE.lateCheckout * 100,
      product_data: { name: 'Late checkout (13h)' } }, quantity: 1,
  });

  return items;
}

module.exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Méthode non autorisée' }) };

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON invalide' }) }; }

  const { checkin, checkout, nights, guests, options = {}, total, guestName, guestEmail, guestPhone } = body;

  if (!checkin || !checkout || !nights || !guests || !total || !guestName || !guestEmail) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Données manquantes' }) };
  }

  if (nights < 1 || nights > 30 || guests < 1 || guests > 4) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valeurs hors limites' }) };
  }

  // Double-check dispo (protection race conditions)
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const dates = expandDates(checkin, checkout);

  const { data: blocked } = await supabase.from('blocked_dates').select('date').in('date', dates);
  if (blocked && blocked.length > 0) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Ces dates ne sont plus disponibles. Veuillez en choisir d\'autres.' }) };
  }

  const { data: existing } = await supabase.from('reservations')
    .select('id').eq('status', 'confirmed').lt('checkin', checkout).gt('checkout', checkin);
  if (existing && existing.length > 0) {
    return { statusCode: 409, headers, body: JSON.stringify({ error: 'Ces dates ne sont plus disponibles. Veuillez en choisir d\'autres.' }) };
  }

  // Créer la session Stripe
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: guestEmail,
    line_items: buildLineItems(nights, guests, options),
    success_url: `${process.env.SITE_URL}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_URL}/reserver.html`,
    locale: 'fr',
    payment_intent_data: {
      description: `Bus Insolite — ${frDate(checkin)} au ${frDate(checkout)} — ${guestName}`,
    },
    metadata: {
      checkin,
      checkout,
      nights: String(nights),
      guests: String(guests),
      options: JSON.stringify(options),
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone || '',
      total_eur: String(total),
    },
  });

  return { statusCode: 200, headers, body: JSON.stringify({ url: session.url }) };
};
