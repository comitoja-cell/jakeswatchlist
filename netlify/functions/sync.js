// Netlify Function — Cloud sync using @netlify/blobs SDK
// GET  ?userId=UUID  -> returns stored JSON
// POST ?userId=UUID  -> stores request body JSON

const { getStore } = require('@netlify/blobs');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

const EMPTY = JSON.stringify({ w: [], wl: [], custom: [], _ts: 0 });

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const userId = (event.queryStringParameters?.userId || '')
    .replace(/[^a-zA-Z0-9-]/g, '');
  if (userId.length < 8) {
    return { statusCode: 400, headers: CORS,
      body: JSON.stringify({ error: 'Valid userId required' }) };
  }

  try {
    const siteID = process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOB_TOKEN || process.env.NETLIFY_FUNCTIONS_TOKEN;
    const storeConfig = (siteID && token)
      ? { name: 'watchlist', siteID, token }
      : 'watchlist';

    const store = getStore(storeConfig);

    if (event.httpMethod === 'GET') {
      const data = await store.get(userId, { type: 'text' });
      return { statusCode: 200, headers: CORS, body: data || EMPTY };
    }

    if (event.httpMethod === 'POST') {
      const payload = event.body || '';
      if (payload.length > 10_000_000) {
        return { statusCode: 413, headers: CORS,
          body: JSON.stringify({ error: 'Payload too large' }) };
      }
      await store.set(userId, payload);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
  } catch(e) {
    const netlifyEnvKeys = Object.keys(process.env)
      .filter(k => k.startsWith('NETLIFY') || k.startsWith('SITE') || k.includes('BLOB'));
    return { statusCode: 500, headers: CORS,
      body: JSON.stringify({ error: e.message, netlifyEnvKeys }) };
  }
};
