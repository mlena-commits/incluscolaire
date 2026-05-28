const { getStore } = require('@netlify/blobs');

const DAILY_LIMIT = 20;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // ── RATE LIMITING ──
    const ip = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

    const store = getStore('rate-limits');
    const raw = await store.get(ip);
    const record = raw ? JSON.parse(raw) : { date: today, count: 0 };

    if (record.date !== today) {
      record.date = today;
      record.count = 0;
    }

    if (record.count >= DAILY_LIMIT) {
      return {
        statusCode: 429,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: { message: `Limite atteinte : ${DAILY_LIMIT} analyses par jour maximum. Réessayez demain.` }
        })
      };
    }

    record.count++;
    await store.set(ip, JSON.stringify(record));

    // ── PROXY VERS ANTHROPIC ──
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { message: 'Configuration serveur manquante.' } })
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: event.body
    });

    const data = await response.json();

    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: `Erreur serveur : ${err.message}` } })
    };
  }
};
