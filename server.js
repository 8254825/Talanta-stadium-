const express = require('express');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const PRICE_PER_SEAT = 2500;

app.use(express.json());
app.use(express.static(__dirname));

const orders = new Map();

function makeOrderId() {
  return 'TAL-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
}

app.post('/api/payments/initiate', async (req, res) => {
  try {
    const { eventId, seats, buyer, amount, method } = req.body || {};

    if (!Array.isArray(seats) || seats.length === 0) {
      return res.status(400).json({ error: 'No seats selected.' });
    }
    if (seats.length > 8) {
      return res.status(400).json({ error: 'Maximum 8 seats per order.' });
    }
    if (!buyer?.phone || !buyer?.name || !buyer?.email) {
      return res.status(400).json({ error: 'Buyer name, email and phone are required.' });
    }

    const expectedAmount = seats.length * PRICE_PER_SEAT;
    if (Number(amount) !== expectedAmount) {
      return res.status(400).json({ error: 'Amount mismatch. Each seat is KES 2,500.' });
    }

    const orderId = makeOrderId();
    const paymentId = 'PAY-' + crypto.randomBytes(6).toString('hex').toUpperCase();

    const order = {
      orderId,
      paymentId,
      eventId,
      seats,
      buyer,
      amount: expectedAmount,
      method: method || 'mpesa',
      status: 'pending',
      createdAt: Date.now()
    };

    orders.set(orderId, order);

    const apiKey = process.env.SMARTPAYPESA_API_KEY;
    const mock = !apiKey || process.env.MOCK_PAYMENTS === 'true';

    if (mock) {
      // Simulate a successful M-Pesa prompt after a short delay.
      setTimeout(() => {
        order.status = 'paid';
        order.paidAt = Date.now();
      }, 4500);

      return res.json({
        orderId,
        paymentId,
        status: 'pending',
        mode: 'mock',
        message: 'Mock payment initiated. Confirm shortly.'
      });
    }

    // LIVE SmartPayPesa call — adjust endpoint/body to match provider docs.
    const base = (process.env.SMARTPAYPESA_BASE_URL || 'https://api.smartpaypesa.com').replace(/\/$/, '');
    const providerRes = await fetch(`${base}/v1/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        amount: expectedAmount,
        currency: 'KES',
        phone: buyer.phone,
        reference: orderId,
        description: `Talanta Stadium — Bayern vs Ajax (${seats.join(', ')})`
      })
    });

    const data = await providerRes.json().catch(() => ({}));

    if (!providerRes.ok) {
      throw new Error(data.message || data.error || 'SmartPayPesa initiation failed.');
    }

    order.providerRef = data.paymentId || data.id || paymentId;
    order.status = data.status || 'pending';

    if (order.status === 'paid' || order.status === 'success') {
      order.status = 'paid';
      order.paidAt = Date.now();
    }

    return res.json({
      orderId,
      paymentId: order.providerRef,
      status: order.status,
      mode: 'live'
    });
  } catch (err) {
    console.error('Payment initiation error:', err);
    return res.status(502).json({ error: err.message || 'Could not start payment.' });
  }
});

app.get('/api/payments/status/:orderId', (req, res) => {
  const order = orders.get(req.params.orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }
  return res.json({
    orderId: order.orderId,
    status: order.status,
    seats: order.seats,
    amount: order.amount,
    eventId: order.eventId,
    error: order.error || null
  });
});

// Optional webhook for live SmartPayPesa callbacks.
app.post('/api/payments/webhook', (req, res) => {
  const body = req.body || {};
  const reference = body.reference || body.orderId || body.accountReference;
  const status = String(body.status || body.paymentStatus || '').toLowerCase();

  if (reference && orders.has(reference)) {
    const order = orders.get(reference);
    order.status = ['paid', 'success', 'completed'].includes(status) ? 'paid' : 'failed';
    if (order.status === 'paid') order.paidAt = Date.now();
  }

  res.status(200).json({ received: true });
});

app.listen(PORT, () => {
  console.log(`TalantaTickets running at http://localhost:${PORT}`);
});
