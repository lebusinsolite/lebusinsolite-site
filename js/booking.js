/* ===== Le Bus Insolite — Booking Widget ===== */

// ---- TARIFS ----
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

// ---- ÉTAT ----
const state = {
  checkin: null,
  checkout: null,
  guests: 2,
  options: {},
  blocked: new Set(),
  calMonth: (() => { const d = new Date(); d.setDate(1); return d; })(),
};

// ---- UTILITAIRES ----
function toISO(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
    .toISOString().split('T')[0];
}

function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isBefore(a, b) { return toISO(a) < toISO(b); }
function isSame(a, b)   { return toISO(a) === toISO(b); }

function isPast(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}

function nights() {
  if (!state.checkin || !state.checkout) return 0;
  return Math.round((state.checkout - state.checkin) / 86400000);
}

// ---- PRIX ----
function calcTotal() {
  const n = nights();
  if (!n) return 0;
  const o = state.options;
  const g = state.guests;
  let t = PRICE.night(n);
  if (o.packRomantique) t += PRICE.packRomantique;
  if (o.packFamille)    t += PRICE.packFamille;
  if (o.velos === 2)    t += PRICE.velos2;
  if (o.velos === 4)    t += PRICE.velos4;
  if (o.petitDejeuner)  t += PRICE.petitDej[g] || PRICE.petitDej[4];
  if (o.lateCheckout)   t += PRICE.lateCheckout;
  return t;
}

// ---- FETCH DATES BLOQUÉES ----
async function fetchBlocked() {
  const from = toISO(new Date());
  const to = (() => { const d = new Date(); d.setMonth(d.getMonth() + 12); return toISO(d); })();
  try {
    const res = await fetch(`/.netlify/functions/blocked-dates?from=${from}&to=${to}`);
    const { dates } = await res.json();
    state.blocked = new Set(dates || []);
  } catch (e) {
    console.error('Erreur chargement calendrier :', e);
  }
}

// ---- CALENDRIER ----
function renderCalendar() {
  const wrap = document.getElementById('calendar');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (let i = 0; i < 2; i++) {
    const m = new Date(state.calMonth);
    m.setMonth(m.getMonth() + i);
    wrap.appendChild(buildMonth(m));
  }
  // Désactiver bouton prev si on est déjà sur le mois courant
  const prev = document.getElementById('cal-prev');
  if (prev) {
    const now = new Date(); now.setDate(1); now.setHours(0,0,0,0);
    prev.disabled = state.calMonth <= now;
  }
}

function buildMonth(month) {
  const y = month.getFullYear(), m = month.getMonth();
  const div = document.createElement('div');
  div.className = 'cal-month';

  // Entête
  const h = document.createElement('div');
  h.className = 'cal-month-title';
  h.textContent = month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  div.appendChild(h);

  // Labels jours
  const labels = document.createElement('div');
  labels.className = 'cal-labels';
  ['Lu','Ma','Me','Je','Ve','Sa','Di'].forEach(l => {
    const s = document.createElement('span'); s.textContent = l; labels.appendChild(s);
  });
  div.appendChild(labels);

  // Grille
  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  let offset = new Date(y, m, 1).getDay() - 1;
  if (offset < 0) offset = 6;
  for (let i = 0; i < offset; i++) {
    const e = document.createElement('span'); e.className = 'cal-empty'; grid.appendChild(e);
  }

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Date.UTC(y, m, d));
    const iso = toISO(date);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cal-day';
    btn.textContent = d;
    btn.dataset.date = iso;

    const blocked = state.blocked.has(iso);
    const past = isPast(date);

    if (past || blocked) {
      btn.disabled = true;
      btn.classList.add(blocked ? 'is-blocked' : 'is-past');
    } else {
      if (state.checkin && isSame(date, state.checkin))   btn.classList.add('is-checkin');
      if (state.checkout && isSame(date, state.checkout)) btn.classList.add('is-checkout');
      if (state.checkin && state.checkout && iso > toISO(state.checkin) && iso < toISO(state.checkout))
        btn.classList.add('is-range');
      btn.addEventListener('click', () => onDayClick(iso));
    }
    grid.appendChild(btn);
  }
  div.appendChild(grid);
  return div;
}

function onDayClick(iso) {
  const date = fromISO(iso);

  if (!state.checkin || (state.checkin && state.checkout)) {
    state.checkin = date;
    state.checkout = null;
  } else {
    if (!isBefore(state.checkin, date)) {
      state.checkin = date;
      state.checkout = null;
    } else {
      // Vérifier qu'aucune date bloquée n'est dans la plage
      let hasBlock = false;
      const cur = new Date(state.checkin);
      cur.setUTCDate(cur.getUTCDate() + 1);
      while (isBefore(cur, date)) {
        if (state.blocked.has(toISO(cur))) { hasBlock = true; break; }
        cur.setUTCDate(cur.getUTCDate() + 1);
      }
      if (hasBlock) {
        showMsg('Cette plage contient des dates déjà réservées. Choisissez d\'autres dates.', 'error');
        state.checkin = null;
      } else {
        state.checkout = date;
        showMsg('');
      }
    }
  }

  renderCalendar();
  updateDateDisplay();
  toggleOptions();
}

// ---- AFFICHAGE DATES ----
function updateDateDisplay() {
  const ci = document.getElementById('checkin-display');
  const co = document.getElementById('checkout-display');
  const nd = document.getElementById('nights-display');
  if (state.checkin) {
    ci.textContent = state.checkin.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    ci.classList.add('has-date');
  } else {
    ci.textContent = 'Arrivée'; ci.classList.remove('has-date');
  }
  if (state.checkout) {
    co.textContent = state.checkout.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    co.classList.add('has-date');
    nd.textContent = `${nights()} nuit${nights() > 1 ? 's' : ''}`;
  } else {
    co.textContent = 'Départ'; co.classList.remove('has-date'); nd.textContent = '';
  }
}

function showMsg(msg, type = 'info') {
  const el = document.getElementById('availability-msg');
  if (!el) return;
  el.textContent = msg;
  el.className = 'avail-msg' + (msg ? ` avail-${type}` : '');
}

// ---- OPTIONS ----
function toggleOptions() {
  const section = document.getElementById('booking-options');
  if (!section) return;
  section.style.display = (state.checkin && state.checkout) ? 'block' : 'none';
  if (state.checkin && state.checkout) updateSummary();
}

function collectOptions() {
  const o = {};
  if (document.getElementById('opt-romantique')?.checked) o.packRomantique = true;
  if (document.getElementById('opt-famille')?.checked)    o.packFamille = true;
  const velos = document.querySelector('input[name="velos"]:checked');
  if (velos && velos.value !== '0') o.velos = parseInt(velos.value);
  if (document.getElementById('opt-petitdej')?.checked)     o.petitDejeuner = true;
  if (document.getElementById('opt-latecheckout')?.checked) o.lateCheckout = true;
  if (document.getElementById('opt-animal')?.checked)       o.animal = true;
  return o;
}

function updateSummary() {
  state.options = collectOptions();
  const n = nights();
  if (!n) return;

  const total = calcTotal();
  const o = state.options;
  const g = state.guests;

  // Bouton paiement
  const btn = document.getElementById('pay-btn');
  if (btn) btn.textContent = `Payer ${total} € →`;

  // Détail prix
  const bd = document.getElementById('price-breakdown');
  if (!bd) return;
  const base = PRICE.night(n);
  let html = `<div class="bd-row"><span>${n} nuit${n>1?'s':''}</span><span>${base} €</span></div>`;
  if (o.packRomantique) html += `<div class="bd-row"><span>Pack Romantique</span><span>+${PRICE.packRomantique} €</span></div>`;
  if (o.packFamille)    html += `<div class="bd-row"><span>Pack Famille</span><span>+${PRICE.packFamille} €</span></div>`;
  if (o.velos === 2)    html += `<div class="bd-row"><span>2 vélos</span><span>+${PRICE.velos2} €</span></div>`;
  if (o.velos === 4)    html += `<div class="bd-row"><span>4 vélos</span><span>+${PRICE.velos4} €</span></div>`;
  if (o.petitDejeuner) {
    const pdp = PRICE.petitDej[g] || PRICE.petitDej[4];
    html += `<div class="bd-row"><span>Petit-déjeuner (${g} pers.)</span><span>+${pdp} €</span></div>`;
  }
  if (o.lateCheckout) html += `<div class="bd-row"><span>Late checkout 13h</span><span>+${PRICE.lateCheckout} €</span></div>`;
  if (o.animal)       html += `<div class="bd-row"><span>Animal accepté</span><span>Gratuit</span></div>`;
  html += `<div class="bd-row bd-total"><span>Total</span><span>${total} €</span></div>`;
  bd.innerHTML = html;
}

// ---- SOUMISSION ----
async function handleSubmit(e) {
  e.preventDefault();
  const n = nights();
  if (!n) return;

  const guestName  = document.getElementById('guest-name').value.trim();
  const guestEmail = document.getElementById('guest-email').value.trim();
  const guestPhone = document.getElementById('guest-phone').value.trim();

  if (!guestName || !guestEmail) {
    alert('Merci de renseigner votre nom et votre email.');
    return;
  }

  const btn = document.getElementById('pay-btn');
  btn.disabled = true;
  btn.textContent = 'Chargement…';

  try {
    const res = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkin:   toISO(state.checkin),
        checkout:  toISO(state.checkout),
        nights: n,
        guests: state.guests,
        options:   state.options,
        total:     calcTotal(),
        guestName,
        guestEmail,
        guestPhone,
      }),
    });
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error(data.error || 'Erreur lors de la création du paiement');
    }
  } catch (err) {
    alert(`Erreur : ${err.message}`);
    btn.disabled = false;
    updateSummary();
  }
}

// ---- INIT ----
async function init() {
  await fetchBlocked();
  renderCalendar();
  toggleOptions();

  document.getElementById('cal-prev')?.addEventListener('click', () => {
    const now = new Date(); now.setDate(1); now.setHours(0,0,0,0);
    const prev = new Date(state.calMonth);
    prev.setMonth(prev.getMonth() - 1);
    if (prev >= now) { state.calMonth = prev; renderCalendar(); }
  });

  document.getElementById('cal-next')?.addEventListener('click', () => {
    state.calMonth.setMonth(state.calMonth.getMonth() + 1);
    renderCalendar();
  });

  document.getElementById('guests-minus')?.addEventListener('click', () => {
    if (state.guests > 1) { state.guests--; document.getElementById('guests-count').textContent = state.guests; updateSummary(); }
  });
  document.getElementById('guests-plus')?.addEventListener('click', () => {
    if (state.guests < 4) { state.guests++; document.getElementById('guests-count').textContent = state.guests; updateSummary(); }
  });

  document.querySelectorAll('.opt-input').forEach(inp => inp.addEventListener('change', updateSummary));
  document.getElementById('booking-form')?.addEventListener('submit', handleSubmit);
}

document.addEventListener('DOMContentLoaded', init);
