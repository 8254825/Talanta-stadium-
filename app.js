/* =========================================================
   TalantaTickets — Frontend App Logic
   Event: Bayern vs Ajax
   Price: KES 2,500 per seat
   Payment: SmartPayPesa (via backend /api/payments/*)
   ========================================================= */

/* ---------- Config ---------- */
const PRICE = 2500;
const MAX_SEATS = 8;
const HOLD_SECONDS = 8 * 60;
const TICKET_KEY = 'talanta_tickets_v1';

const EVENT = {
  id: 'bayern-vs-ajax',
  title: 'Bayern vs Ajax',
  subtitle: 'Champions League • Group Stage',
  date: 'Sat, 14 Nov 2026 · 20:00',
  venue: 'Talanta Stadium, Nairobi',
  image:
    'https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=80'
};

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
const COLS = 12;
const SOLD = [
  'A1', 'A2', 'A3', 'B5', 'B6', 'C7', 'C8', 'D2', 'D9',
  'E4', 'E5', 'F10', 'G1', 'G2', 'H7', 'J3', 'J4', 'K11'
];

/* ---------- State ---------- */
const state = {
  view: 'home',           // home | event | checkout | paying | ticket | mytickets
  selected: new Set(),
  holdTimer: null,
  holdRemaining: 0,
  order: null,
  buyer: null,
  ticket: null,
  pollTimer: null
};

let SEATS = buildSeats();

/* ---------- Seat data ---------- */
function buildSeats() {
  const seats = [];
  for (const row of ROWS) {
    for (let col = 1; col <= COLS; col++) {
      const id = `${row}${col}`;
      seats.push({
        id,
        row,
        col,
        status: SOLD.includes(id) ? 'sold' : 'available'
      });
    }
  }
  return seats;
}

function getSeat(id) {
  return SEATS.find((s) => s.id === id);
}

function selectedSeats() {
  return [...state.selected].map(getSeat).filter(Boolean);
}

function total() {
  return selectedSeats().length * PRICE;
}

/* ---------- Helpers ---------- */
function money(value) {
  return `KES ${Number(value).toLocaleString('en-KE')}`;
}

function formatTime(seconds) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

let toastTimer;
function toast(message) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

/* ---------- Seat hold timer ---------- */
function startHold() {
  if (state.holdTimer) return;
  state.holdRemaining = HOLD_SECONDS;
  state.holdTimer = setInterval(() => {
    state.holdRemaining -= 1;
    updateHoldUI();
    if (state.holdRemaining <= 0) {
      clearInterval(state.holdTimer);
      state.holdTimer = null;
      state.selected.clear();
      if (state.view === 'event' || state.view === 'checkout') {
        state.view = 'event';
        render();
      }
      toast('Seat hold expired. Please select seats again.');
    }
  }, 1000);
}

function stopHold() {
  if (state.holdTimer) {
    clearInterval(state.holdTimer);
    state.holdTimer = null;
  }
  state.holdRemaining = 0;
}

function updateHoldUI() {
  const el = document.getElementById('hold-timer');
  if (el) el.textContent = formatTime(state.holdRemaining);
}

/* ---------- Seat toggle ---------- */
function toggleSeat(id) {
  const seat = getSeat(id);
  if (!seat || seat.status !== 'available') return;

  if (state.selected.has(id)) {
    state.selected.delete(id);
    if (state.selected.size === 0) stopHold();
  } else {
    if (state.selected.size >= MAX_SEATS) {
      toast(`Maximum ${MAX_SEATS} seats per order.`);
      return;
    }
    state.selected.add(id);
    startHold();
  }
  render();
}

/* ---------- Navigation ---------- */
function navigate(view) {
  clearInterval(state.pollTimer);
  if (view === 'home') {
    stopHold();
    state.selected.clear();
    state.view = 'home';
  } else if (view === 'mytickets') {
    state.view = 'mytickets';
  } else if (view === 'guide') {
    toast('Stadium guide coming soon.');
    return;
  }
  render();
}

function handleAction(action) {
  if (action === 'open-event') {
    stopHold();
    state.selected.clear();
    state.holdRemaining = 0;
    state.view = 'event';
    render();
  }

  if (action === 'checkout') {
    if (!selectedSeats().length) return toast('Select at least one seat.');
    if (state.holdRemaining <= 0) return toast('Seat hold expired. Select seats again.');
    state.view = 'checkout';
    render();
  }

  if (action === 'back-event') {
    state.view = 'event';
    render();
  }
}

/* ---------- Seat map HTML ---------- */
function seatMapHTML() {
  return `
    <div class="stadium-map">
      <div class="pitch">PITCH</div>
      <div class="seat-rows">
        ${ROWS.map((row) => `
          <div class="seat-row">
            <span class="row-label">${row}</span>
            <div class="row-seats">
              ${Array.from({ length: COLS }, (_, i) => {
                const col = i + 1;
                const id = `${row}${col}`;
                const seat = getSeat(id);
                const cls =
                  seat.status === 'sold'
                    ? 'sold'
                    : state.selected.has(id)
                      ? 'selected'
                      : 'available';
                return `<button class="seat ${cls}" data-seat="${id}" ${
                  seat.status === 'sold' ? 'disabled' : ''
                } aria-label="Row ${row} seat ${col}">${col}</button>`;
              }).join('')}
            </div>
            <span class="row-label">${row}</span>
          </div>
        `).join('')}
      </div>
      <div class="legend">
        <span><i class="dot available"></i>Available</span>
        <span><i class="dot selected"></i>Selected</span>
        <span><i class="dot sold"></i>Sold</span>
      </div>
    </div>
  `;
}

/* ---------- Order summary panel ---------- */
function summaryHTML() {
  const seats = selectedSeats();
  return `
    <aside class="summary">
      <h3>Order summary</h3>
      <p>${EVENT.title}</p>
      <p>${EVENT.date}</p>
      <div class="hold">Seats held: <strong id="hold-timer">${formatTime(
        state.holdRemaining || HOLD_SECONDS
      )}</strong></div>
      <ul>
        ${
          seats.length
            ? seats
                .map(
                  (seat) =>
                    `<li><span>Row ${seat.row}, Seat ${seat.col}</span><strong>${money(
                      PRICE
                    )}</strong></li>`
                )
                .join('')
            : '<li>No seats selected</li>'
        }
      </ul>
      <div class="total"><span>Total</span><strong>${money(total())}</strong></div>
      <button class="btn btn-gold btn-block" data-action="checkout">
        Continue to checkout
      </button>
      <small>Each seat is ${money(PRICE)}. Maximum ${MAX_SEATS} seats per order.</small>
    </aside>
  `;
}

/* ---------- Views ---------- */
function homeHTML() {
  return `
    <section class="hero" style="background-image:linear-gradient(90deg, rgba(4,20,14,.2), rgba(4,20,14,.2)), url('${EVENT.image}')">
      <div class="hero-content">
        <span class="pill">Official Talanta Stadium ticketing</span>
        <h1>Bayern vs Ajax.<br>Feel the roar.</h1>
        <p>Champions League night at Talanta Stadium. Secure your seat for ${money(PRICE)}.</p>
        <div class="hero-actions">
          <button class="btn btn-gold" data-action="open-event">Buy tickets</button>
          <button class="btn btn-ghost" data-nav="mytickets">My tickets</button>
        </div>
      </div>
    </section>

    <section class="container section">
      <div class="section-head">
        <h2>Upcoming at Talanta</h2>
        <span class="muted">Official tickets only</span>
      </div>
      <article class="event-card">
        <img src="${EVENT.image}" alt="Talanta Stadium crowd">
        <div class="event-info">
          <span class="badge">Champions League</span>
          <h3>${EVENT.title}</h3>
          <p>${EVENT.date} · ${EVENT.venue}</p>
          <div class="event-foot">
            <span class="price">From ${money(PRICE)}</span>
            <button class="btn btn-dark" data-action="open-event">Buy tickets</button>
          </div>
        </div>
      </article>
    </section>
  `;
}

function eventHTML() {
  return `
    <button class="back-link" data-nav="home">← All events</button>
    <section class="event-hero" style="background-image:linear-gradient(90deg, rgba(4,20,14,.35), rgba(4,20,14,.05)), url('${EVENT.image}')">
      <div>
        <h1>${EVENT.title}</h1>
        <p>${EVENT.date} · ${EVENT.venue}</p>
      </div>
    </section>

    <div class="event-layout">
      <div class="map-card">
        <h2>Choose your seats</h2>
        <p class="muted">All seats ${money(PRICE)} each. Select up to ${MAX_SEATS} seats.</p>
        ${seatMapHTML()}
      </div>
      ${summaryHTML()}
    </div>
  `;
}

function checkoutHTML() {
  return `
    <button class="back-link" data-action="back-event">← Back to seats</button>
    <div class="checkout-layout">
      <form id="checkout-form" class="card form">
        <h2>Checkout</h2>
        <p class="muted">Enter buyer details. You will receive an M-Pesa prompt or card payment request.</p>

        <label>Full name
          <input name="name" type="text" autocomplete="name" required placeholder="e.g. Amina Otieno">
        </label>
        <label>Email address
          <input name="email" type="email" autocomplete="email" required placeholder="you@example.com">
        </label>
        <label>M-Pesa phone number
          <input name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="07XX XXX XXX">
        </label>

        <fieldset>
          <legend>Payment method</legend>
          <label><input type="radio" name="payment" value="mpesa" checked> M-Pesa</label>
          <label><input type="radio" name="payment" value="card"> Card</label>
        </fieldset>

        <button class="btn btn-gold btn-block" type="submit">Pay ${money(total())}</button>
        <small class="muted">Seats are held for a limited time. Each seat costs ${money(PRICE)}.</small>
      </form>
      ${summaryHTML()}
    </div>
  `;
}

function payingHTML() {
  return `
    <div class="paying">
      <div class="spinner"></div>
      <h2>Waiting for payment</h2>
      <p>We sent a payment request to <strong>${state.buyer?.phone || ''}</strong>.</p>
      <p>Amount: <strong>${money(state.order?.amount || total())}</strong></p>
      <p class="muted">This can take up to 30 seconds. Keep this page open.</p>
    </div>
  `;
}

function ticketHTML() {
  const t = state.ticket;
  if (!t) return '<p class="container section">Ticket not found.</p>';
  return `
    <div class="ticket-wrap">
      <div class="ticket">
        <div class="ticket-head"><span>Talanta Stadium</span><span>Official ticket</span></div>
        <h2>${t.event}</h2>
        <p>${t.date} · ${t.venue}</p>
        <div class="ticket-grid">
          <div><b>Seats</b>${t.seats.join(', ')}</div>
          <div><b>Total</b>${money(t.amount)}</div>
          <div><b>Order</b>${t.orderId}</div>
          <div><b>Buyer</b>${t.buyer?.name || 'Guest'}</div>
        </div>
        <canvas id="ticket-qr"></canvas>
        <p class="muted" style="text-align:center">Show this QR code at the gate.</p>
      </div>
      <div class="ticket-actions">
        <button class="btn btn-gold" data-nav="mytickets">View my tickets</button>
        <button class="btn btn-dark" data-nav="home">Back to events</button>
      </div>
    </div>
  `;
}

function myTicketsHTML() {
  const tickets = readTickets();
  return `
    <section class="container section">
      <h1>My tickets</h1>
      ${
        tickets.length
          ? `<div class="tickets-list">${tickets
              .map(
                (t) => `
            <article class="ticket saved">
              <canvas class="qr-canvas" data-order="${t.orderId}"></canvas>
              <div>
                <div class="ticket-head"><span>Talanta Stadium</span><span>Official ticket</span></div>
                <h2>${t.event}</h2>
                <p>${t.date} · ${t.venue}</p>
                <div class="ticket-grid">
                  <div><b>Seats</b>${t.seats.join(', ')}</div>
                  <div><b>Total</b>${money(t.amount)}</div>
                  <div><b>Order</b>${t.orderId}</div>
                  <div><b>Buyer</b>${t.buyer?.name || 'Guest'}</div>
                </div>
              </div>
            </article>
          `
              )
              .join('')}</div>`
          : '<p class="muted">No tickets yet. Buy a ticket for Bayern vs Ajax to get started.</p>'
      }
    </section>
  `;
}

/* ---------- Renderer ---------- */
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (state.view === 'home') app.innerHTML = homeHTML();
  else if (state.view === 'event') app.innerHTML = eventHTML();
  else if (state.view === 'checkout') app.innerHTML = checkoutHTML();
  else if (state.view === 'paying') app.innerHTML = payingHTML();
  else if (state.view === 'ticket') app.innerHTML = ticketHTML();
  else if (state.view === 'mytickets') app.innerHTML = myTicketsHTML();

  if (state.view === 'event') updateHoldUI();
  if (state.view === 'ticket') renderSingleQR();
  if (state.view === 'mytickets') renderSavedQRs();
}

/* ---------- QR ticket ---------- */
function qrPayload(ticket) {
  return [
    'TALANTA STADIUM — OFFICIAL TICKET',
    `EVENT: ${ticket.event}`,
    `DATE: ${ticket.date}`,
    `VENUE: ${ticket.venue}`,
    `SEATS: ${ticket.seats.join(', ')}`,
    `ORDER: ${ticket.orderId}`,
    `TOTAL: ${money(ticket.amount)}`,
    `BUYER: ${ticket.buyer?.name || 'Guest'}`,
    `CHECK: ${ticket.check}`
  ].join('\n');
}

function renderSingleQR() {
  if (typeof QRCode === 'undefined') return;
  const canvas = document.getElementById('ticket-qr');
  if (!canvas || !state.ticket) return;
  QRCode.toCanvas(canvas, qrPayload(state.ticket), {
    width: 220,
    margin: 1,
    color: { dark: '#062c1b', light: '#ffffff' }
  }).catch(console.error);
}

function renderSavedQRs() {
  if (typeof QRCode === 'undefined') return;
  const tickets = readTickets();
  document.querySelectorAll('.qr-canvas').forEach((canvas) => {
    const order = canvas.dataset.order;
    const ticket = tickets.find((t) => t.orderId === order);
    if (!ticket) return;
    QRCode.toCanvas(canvas, qrPayload(ticket), {
      width: 200,
      margin: 1,
      color: { dark: '#062c1b', light: '#ffffff' }
    }).catch(console.error);
  });
}

/* ---------- Local storage ---------- */
function readTickets() {
  try {
    return JSON.parse(localStorage.getItem(TICKET_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveTicket(ticket) {
  const all = readTickets().filter((t) => t.orderId !== ticket.orderId);
  all.unshift(ticket);
  localStorage.setItem(TICKET_KEY, JSON.stringify(all.slice(0, 20)));
}

/* ---------- Phone normaliser ---------- */
function normalizePhone(value) {
  let digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `254${digits.slice(1)}`;
  if (digits.startsWith('7') || digits.startsWith('1')) digits = `254${digits}`;
  return digits;
}

/* ---------- Payment flow ---------- */
async function startPayment(form) {
  const fd = new FormData(form);
  const name = String(fd.get('name') || '').trim();
  const email = String(fd.get('email') || '').trim();
  const phone = normalizePhone(fd.get('phone'));
  const method = String(fd.get('payment') || 'mpesa');

  if (!name || !email || !phone) return toast('Please fill in all checkout fields.');
  if (phone.length !== 12) return toast('Enter a valid Kenyan phone number.');

  const seats = selectedSeats().map((s) => s.id);
  if (!seats.length) return toast('Select at least one seat.');
  if (state.holdRemaining <= 0) return toast('Seat hold expired. Select seats again.');

  state.buyer = { name, email, phone };
  state.view = 'paying';
  render();

  try {
    const response = await fetch('/api/payments/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventId: EVENT.id,
        seats,
        buyer: state.buyer,
        amount: seats.length * PRICE,
        method
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not start payment.');

    state.order = data;
    render();
    pollPayment(data.orderId);
  } catch (error) {
    state.view = 'checkout';
    render();
    toast(error.message || 'Payment failed.');
  }
}

function pollPayment(orderId) {
  clearInterval(state.pollTimer);
  let attempts = 0;

  state.pollTimer = setInterval(async () => {
    attempts += 1;
    try {
      const response = await fetch(`/api/payments/status/${orderId}`);
      const data = await response.json();

      if (data.status === 'paid') {
        clearInterval(state.pollTimer);

        const ticket = {
          orderId: data.orderId,
          event: EVENT.title,
          date: EVENT.date,
          venue: EVENT.venue,
          seats: data.seats,
          amount: data.amount,
          buyer: state.buyer,
          issuedAt: new Date().toISOString(),
          check: `TAL-${data.orderId.slice(-6)}`
        };

        saveTicket(ticket);
        state.ticket = ticket;
        state.selected.clear();
        stopHold();
        state.view = 'ticket';
        render();
        toast('Payment confirmed. Your ticket is ready.');
      } else if (data.status === 'failed') {
        clearInterval(state.pollTimer);
        state.view = 'checkout';
        render();
        toast(data.error || 'Payment failed. Please try again.');
      } else if (attempts > 40) {
        clearInterval(state.pollTimer);
        toast('Still waiting for confirmation. Check My Tickets shortly.');
      }
    } catch {
      /* keep polling on transient network errors */
    }
  }, 2000);
}

/* ---------- Event delegation ---------- */
document.addEventListener('click', (event) => {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    event.preventDefault();
    navigate(nav.dataset.nav);
    return;
  }

  const seatEl = event.target.closest('.seat');
  if (seatEl) {
    event.preventDefault();
    toggleSeat(seatEl.dataset.seat);
    return;
  }

  const actionEl = event.target.closest('[data-action]');
  if (actionEl) {
    event.preventDefault();
    handleAction(actionEl.dataset.action);
  }
});

document.addEventListener('submit', async (event) => {
  if (event.target.id !== 'checkout-form') return;
  event.preventDefault();
  await startPayment(event.target);
});

/* ---------- Boot ---------- */
render();
