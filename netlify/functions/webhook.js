const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function frDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function frWeekday(iso) {
  return new Date(iso + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

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

function formatOptions(options, guests) {
  const lines = [];
  if (options.packRomantique) lines.push('Pack Romantique (+79 €)');
  if (options.packFamille)    lines.push('Pack Famille (+49 €)');
  if (options.velos === 2)    lines.push('2 vélos (+30 €)');
  if (options.velos === 4)    lines.push('4 vélos (+50 €)');
  if (options.petitDejeuner)  lines.push(`Petit-déjeuner ${guests} pers.`);
  if (options.lateCheckout)   lines.push('Late checkout 13h (+20 €)');
  if (options.animal)         lines.push('Animal de compagnie (gratuit)');
  return lines.length ? lines.join(', ') : 'Aucune';
}

async function sendGuestEmail(resend, session, meta, options) {
  const optionsText = formatOptions(options, parseInt(meta.guests));
  await resend.emails.send({
    from: 'Le Bus Insolite <contact@lebusinsolite.fr>',
    to: meta.guest_email,
    subject: `✅ Réservation confirmée — Bus Insolite du ${frDate(meta.checkin)} au ${frDate(meta.checkout)}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#3A2E26;">
        <div style="background:#4A5D3A;padding:2rem;text-align:center;border-radius:8px 8px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.5rem;">Réservation confirmée 🎉</h1>
        </div>
        <div style="background:#FFFBF0;padding:2rem;border-radius:0 0 8px 8px;border:1px solid #e5e5e5;">
          <p>Bonjour <strong>${meta.guest_name}</strong>,</p>
          <p>Votre réservation au <strong>Bus Insolite</strong> est confirmée. Voici le récapitulatif :</p>

          <table style="width:100%;border-collapse:collapse;margin:1.5rem 0;">
            <tr style="border-bottom:1px solid #e5e5e5;">
              <td style="padding:.6rem 0;color:#888;font-size:.9rem;">Arrivée</td>
              <td style="padding:.6rem 0;font-weight:600;">${frWeekday(meta.checkin)} à partir de 16h</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e5e5;">
              <td style="padding:.6rem 0;color:#888;font-size:.9rem;">Départ</td>
              <td style="padding:.6rem 0;font-weight:600;">${frWeekday(meta.checkout)} avant ${options.lateCheckout ? '13h' : '11h'}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e5e5;">
              <td style="padding:.6rem 0;color:#888;font-size:.9rem;">Voyageurs</td>
              <td style="padding:.6rem 0;font-weight:600;">${meta.guests} personne${meta.guests > 1 ? 's' : ''}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e5e5;">
              <td style="padding:.6rem 0;color:#888;font-size:.9rem;">Options</td>
              <td style="padding:.6rem 0;">${optionsText}</td>
            </tr>
            <tr>
              <td style="padding:.6rem 0;color:#888;font-size:.9rem;">Total payé</td>
              <td style="padding:.6rem 0;font-weight:700;color:#FF3E7F;">${meta.total_eur} €</td>
            </tr>
          </table>

          <div style="background:#F5EFE6;border-radius:8px;padding:1.25rem;margin-bottom:1.5rem;">
            <h3 style="margin:0 0 .75rem;color:#4A5D3A;">📍 Adresse & accès</h3>
            <p style="margin:0;">Le Bus Insolite<br>Saint-Usage, 21170 Côte-d'Or<br><br>
            Les instructions d'accès détaillées (code de la boîte à clés, parking, WiFi) vous seront envoyées 48h avant votre arrivée.</p>
          </div>

          <div style="background:#F5EFE6;border-radius:8px;padding:1.25rem;margin-bottom:1.5rem;">
            <h3 style="margin:0 0 .75rem;color:#4A5D3A;">❌ Politique d'annulation</h3>
            <p style="margin:0;">Remboursement intégral si annulation <strong>7 jours ou plus</strong> avant l'arrivée.<br>
            Aucun remboursement en dessous de 7 jours.</p>
          </div>

          <p>Une question ? Répondez à cet email ou appelez-nous au <strong>06 69 02 79 87</strong>.</p>
          <p style="color:#888;font-size:.85rem;">À très bientôt au Bus Insolite !</p>
        </div>
      </div>
    `,
  });
}

async function sendOwnerEmail(resend, session, meta, options) {
  const optionsText = formatOptions(options, parseInt(meta.guests));
  await resend.emails.send({
    from: 'Le Bus Insolite <contact@lebusinsolite.fr>',
    to: process.env.CONTACT_EMAIL,
    subject: `🛎 Nouvelle réservation — ${meta.guest_name} du ${frDate(meta.checkin)} au ${frDate(meta.checkout)}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;color:#3A2E26;">
        <h2 style="color:#4A5D3A;">Nouvelle réservation confirmée</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:.4rem 0;color:#888;">Client</td><td><strong>${meta.guest_name}</strong></td></tr>
          <tr><td style="padding:.4rem 0;color:#888;">Email</td><td>${meta.guest_email}</td></tr>
          <tr><td style="padding:.4rem 0;color:#888;">Téléphone</td><td>${meta.guest_phone || 'Non renseigné'}</td></tr>
          <tr><td style="padding:.4rem 0;color:#888;">Arrivée</td><td>${frDate(meta.checkin)}</td></tr>
          <tr><td style="padding:.4rem 0;color:#888;">Départ</td><td>${frDate(meta.checkout)}</td></tr>
          <tr><td style="padding:.4rem 0;color:#888;">Nuits</td><td>${meta.nights}</td></tr>
          <tr><td style="padding:.4rem 0;color:#888;">Voyageurs</td><td>${meta.guests}</td></tr>
          <tr><td style="padding:.4rem 0;color:#888;">Options</td><td>${optionsText}</td></tr>
          <tr><td style="padding:.4rem 0;color:#888;">Total</td><td><strong>${meta.total_eur} €</strong></td></tr>
          <tr><td style="padding:.4rem 0;color:#888;">Session Stripe</td><td style="font-size:.8rem;">${session.id}</td></tr>
        </table>
      </div>
    `,
  });
}

module.exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      event.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature invalide :', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    return { statusCode: 200, body: 'Ignored' };
  }

  const session = stripeEvent.data.object;
  const meta = session.metadata;

  if (!meta?.checkin || !meta?.checkout) {
    console.error('Métadonnées manquantes dans la session Stripe');
    return { statusCode: 400, body: 'Missing metadata' };
  }

  const options = JSON.parse(meta.options || '{}');
  const supabase = getSupabase();
  const resend = new Resend(process.env.RESEND_API_KEY);

  // 1. Insérer la réservation
  const { error: resaError } = await supabase.from('reservations').insert({
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent,
    checkin: meta.checkin,
    checkout: meta.checkout,
    nights: parseInt(meta.nights),
    guests: parseInt(meta.guests),
    guest_name: meta.guest_name,
    guest_email: meta.guest_email,
    guest_phone: meta.guest_phone || null,
    options,
    total_amount: Math.round(parseFloat(meta.total_eur) * 100),
    status: 'confirmed',
  });

  if (resaError) {
    // Si doublon (webhook rejoué), ignorer silencieusement
    if (resaError.code === '23505') {
      console.log('Réservation déjà existante, webhook ignoré :', session.id);
      return { statusCode: 200, body: 'Already processed' };
    }
    console.error('Erreur Supabase insert :', resaError.message);
    return { statusCode: 500, body: resaError.message };
  }

  // 2. Bloquer les dates dans blocked_dates
  const dates = expandDates(meta.checkin, meta.checkout);
  const rows = dates.map(date => ({
    date,
    source: 'reservation',
    label: `Réservation ${meta.guest_name}`,
    synced_at: new Date().toISOString(),
  }));
  await supabase.from('blocked_dates').upsert(rows, { onConflict: 'date,source' });

  // 3. Envoyer les emails (en parallèle, erreur non bloquante)
  try {
    await Promise.all([
      sendGuestEmail(resend, session, meta, options),
      sendOwnerEmail(resend, session, meta, options),
    ]);
  } catch (emailErr) {
    console.error('Erreur envoi email :', emailErr.message);
    // On ne fail pas le webhook pour un email raté
  }

  console.log(`Réservation confirmée : ${meta.guest_name} du ${meta.checkin} au ${meta.checkout}`);
  return { statusCode: 200, body: 'OK' };
};
