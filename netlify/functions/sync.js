// Netlify Function — Cloud sync using @netlify/blobs
// GET  ?userId=UUID  → returns stored JSON (or an empty skeleton)
// POST ?userId=UUID  → stores the request body JSON
//
// Reliability model: Netlify injects a signed Blobs access context into the
// Lambda `event` at runtime. For classic `exports.handler` functions that
// context must be wired up with connectLambda(event) — without it the SDK has
// no credentials and Blobs returns 401. We try that automatic path first, then
// fall back to an explicit siteID+token config if one is provided. GET requests
// degrade to an empty skeleton on total failure so the public site never breaks.

const { getStore, connectLambda } = require('@netlify/blobs');

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store'
};

const STORE = 'watchlist';
const EMPTY = JSON.stringify({ w: [], wl: [], custom: [], _ts: 0 });

// Strong consistency makes a write on one device immediately visible to reads
// on another device — essential for cross-device sync (phone ⇄ desktop).
const READ_OPTS = { type: 'text', consistency: 'strong' };

// Automatic store: uses the signed context Netlify injects into the event.
function openAuto(event) {
  if (typeof connectLambda === 'function') {
    connectLambda(event);
  }
  return getStore(STORE);
}

// Manual store: only usable if an explicit token is configured.
function openManual() {
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOB_TOKEN
              || process.env.NETLIFY_FUNCTIONS_TOKEN
              || process.env.NETLIFY_API_TOKEN;
  if (!siteID || !token) return null;
  return getStore({ name: STORE, siteID, token });
}

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

  if (event.httpMethod === 'POST' && (event.body || '').length > 10_000_000) {
    return { statusCode: 413, headers: CORS,
      body: JSON.stringify({ error: 'Payload too large' }) };
  }

  // Ordered list of strategies; first one that works wins.
  const strategies = [() => openAuto(event), () => openManual()];
  let lastErr = null;

  for (const make of strategies) {
    let store;
    try { store = make(); } catch (e) { lastErr = e; continue; }
    if (!store) continue;

    try {
      if (event.httpMethod === 'GET') {
        const data = await store.get(userId, READ_OPTS);
        return { statusCode: 200, headers: CORS, body: data || EMPTY };
      }
      if (event.httpMethod === 'POST') {
        await store.set(userId, event.body || '');
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
      }
      return { statusCode: 405, headers: CORS, body: 'Method not allowed' };
    } catch (e) {
      lastErr = e; // try the next strategy
    }
  }

  // Every strategy failed. Never break the public site on a read — hand back a
  // valid empty skeleton (the client keeps any local data). Surface write
  // failures so logging problems are visible.
  if (event.httpMethod === 'GET') {
    return { statusCode: 200,
      headers: { ...CORS, 'X-Sync-Degraded': 'true' }, body: EMPTY };
  }
  return { statusCode: 500, headers: CORS,
    body: JSON.stringify({ error: lastErr ? lastErr.message : 'Sync unavailable' }) };
};
