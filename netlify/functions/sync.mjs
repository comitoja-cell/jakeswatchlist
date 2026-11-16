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
// This is a modern (v2) function so Netlify wires up Blobs automatically, including
// strongly consistent reads: a read always sees the latest write, with no lag.
// GET requests degrade to an empty skeleton on total failure so the public site
// never breaks (the page keeps its local data when it sees an empty diary).

import { getStore } from '@netlify/blobs';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Etag, X-Sync-Degraded, X-Sync-Read',
  'Cache-Control': 'no-store'
};
const STORE = 'watchlist';
const EMPTY = JSON.stringify({ w: [], wl: [], custom: [], _ts: 0 });
const reply = (status, body, extra) => new Response(body, { status, headers: { ...CORS, ...(extra || {}) } });
const json = (status, obj, extra) => reply(status, JSON.stringify(obj), extra);

// Stores to try, in order: the automatic one, then an explicit token if configured.
function stores() {
  const list = [() => getStore({ name: STORE, consistency: 'strong' })];
  const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_BLOB_TOKEN || process.env.NETLIFY_FUNCTIONS_TOKEN || process.env.NETLIFY_API_TOKEN;
  if (siteID && token) list.push(() => getStore({ name: STORE, siteID, token }));
  return list;
}

// Read the stored copy and its version. Strong read first; if this environment can't
// do one, fall back to the default read (which can lag a write by a few seconds). The
// version check on write is what guarantees nothing is overwritten either way.
async function readCurrent(store, key) {
  try {
    const r = await store.getWithMetadata(key, { type: 'text', consistency: 'strong' });
    return { data: r ? r.data : null, etag: (r && r.etag) || '', how: 'strong' };
  } catch (e) {}
  const r = await store.getWithMetadata(key, { type: 'text', consistency: 'eventual' });
  return { data: r ? r.data : null, etag: (r && r.etag) || '', how: 'eventual' };
}

export default async (req) => {
  if (req.method === 'OPTIONS') return reply(200, '');

  const q = new URL(req.url).searchParams;
  const userId = (q.get('userId') || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (userId.length < 8) return json(400, { error: 'Valid userId required' });

  let body = '';
  if (req.method === 'POST') {
    body = await req.text();
    if (body.length > 10_000_000) return json(413, { error: 'Payload too large' });
    // Pages loaded before the version check existed don't send v=2. They hold an old
    // copy of the diary and would overwrite everything with it, so they're turned away
    // (the page shows its sync-error state until it's refreshed).
    if (q.get('v') !== '2') return json(409, { error: 'This page is out of date. Refresh to keep saving.', refresh: true });
    // Never store something that isn't a diary.
    let parsed = null;
    try { parsed = JSON.parse(body); } catch (e) {}
    if (!parsed || !Array.isArray(parsed.w)) return json(400, { error: 'Body must be a diary object' });
  } else if (req.method !== 'GET') {
    return reply(405, 'Method not allowed');
  }

  let lastErr = null;
  for (const make of stores()) {
    try {
      const store = make();
      if (req.method === 'GET') {
        const cur = await readCurrent(store, userId);
        return reply(200, cur.data || EMPTY, { 'X-Etag': cur.etag, 'X-Sync-Read': cur.how });
      }
      const etag = q.get('etag') || '';
      const r = etag ? await store.set(userId, body, { onlyIfMatch: etag }) : await store.set(userId, body);
      if (etag && r && r.modified === false) {
        // Someone else saved first. Hand back what's there now.
        const cur = await readCurrent(store, userId);
        return reply(409, '{"conflict":true,"etag":' + JSON.stringify(cur.etag) + ',"data":' + (cur.data || 'null') + '}', { 'X-Sync-Read': cur.how });
      }
      return json(200, { ok: true, etag: (r && r.etag) || '' });
    } catch (e) {
      lastErr = e; // try the next store
    }
  }

  if (req.method === 'GET') return reply(200, EMPTY, { 'X-Sync-Degraded': 'true' });
  return json(500, { error: lastErr ? lastErr.message : 'Sync unavailable' });
};
