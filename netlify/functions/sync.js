// Netlify Function — Cloud sync using @netlify/blobs
// GET  ?userId=UUID                 → stored JSON (or an empty skeleton), version in the X-Etag header
// POST ?userId=UUID&v=2&etag=ETAG   → stores the body ONLY if the stored copy is still version ETAG.
//                                     If someone else saved first → 409 with the current copy, so the
//                                     caller can merge its changes into it and try again.
// POST ?userId=UUID&v=2             → no version known to the caller: plain write.
//
// Why the version check: several tabs and devices share one diary. Without it, two
// saves a moment apart silently overwrite each other (last one wins, the other's
// changes vanish). With it, the second save is told "you're behind" and merges.
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
  'Access-Control-Expose-Headers': 'X-Etag, X-Sync-Degraded',
  'Cache-Control': 'no-store'
};

const STORE = 'watchlist';
const EMPTY = JSON.stringify({ w: [], wl: [], custom: [], _ts: 0 });

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

// Read the stored copy and its version. Prefers a strongly consistent read (always
// the latest write); if this environment can't do one, falls back to the default
// read, which can lag a write by a few seconds. The version check on write is what
// guarantees correctness either way.
async function readCurrent(store, key) {
  try {
    const r = await store.getWithMetadata(key, { type: 'text', consistency: 'strong' });
    return r ? { data: r.data, etag: r.etag || '' } : { data: null, etag: '' };
  } catch (e) {}
  try {
    const r = await store.getWithMetadata(key, { type: 'text' });
    return r ? { data: r.data, etag: r.etag || '' } : { data: null, etag: '' };
  } catch (e) {
    return { data: await store.get(key, { type: 'text' }), etag: '' };
  }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const q = event.queryStringParameters || {};
  const userId = (q.userId || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (userId.length < 8) {
    return { statusCode: 400, headers: CORS,
      body: JSON.stringify({ error: 'Valid userId required' }) };
  }

  if (event.httpMethod === 'POST') {
    const body = event.body || '';
    if (body.length > 10_000_000) {
      return { statusCode: 413, headers: CORS,
        body: JSON.stringify({ error: 'Payload too large' }) };
    }
    // Pages loaded before the version check existed don't send v=2. They hold an old
    // copy of the diary and would overwrite everything with it, so they're turned away
    // (the page shows its sync-error state until it's refreshed).
    if (q.v !== '2') {
      return { statusCode: 409, headers: CORS,
        body: JSON.stringify({ error: 'This page is out of date. Refresh to keep saving.', refresh: true }) };
    }
    // Never store something that isn't a diary.
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (e) {}
    if (!parsed || !Array.isArray(parsed.w)) {
      return { statusCode: 400, headers: CORS,
        body: JSON.stringify({ error: 'Body must be a diary object' }) };
    }
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
        const cur = await readCurrent(store, userId);
        return { statusCode: 200, headers: { ...CORS, 'X-Etag': cur.etag }, body: cur.data || EMPTY };
      }
      if (event.httpMethod === 'POST') {
        const etag = q.etag || '';
        if (etag) {
          const r = await store.set(userId, event.body, { onlyIfMatch: etag });
          if (r && r.modified === false) {
            // Someone else saved first. Hand back what's there now.
            const cur = await readCurrent(store, userId);
            return { statusCode: 409, headers: CORS,
              body: '{"conflict":true,"etag":' + JSON.stringify(cur.etag) + ',"data":' + (cur.data || 'null') + '}' };
          }
          return { statusCode: 200, headers: CORS,
            body: JSON.stringify({ ok: true, etag: (r && r.etag) || '' }) };
        }
        const r = await store.set(userId, event.body);
        return { statusCode: 200, headers: CORS,
          body: JSON.stringify({ ok: true, etag: (r && r.etag) || '' }) };
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
