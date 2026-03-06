// Netlify Function — Cloud sync using Netlify Blobs REST API
// Uses only Node.js built-ins (https, url) — no npm packages needed.
// GET  ?userId=UUID  → returns stored JSON
// POST ?userId=UUID  → stores request body JSON

const https = require('https');
const http  = require('http');
const { URL } = require('url');

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

// Netlify injects NETLIFY_BLOBS_CONTEXT (base64 JSON) into every function.
function getBlobsContext() {
  const raw = process.env.NETLIFY_BLOBS_CONTEXT;
  if (!raw) return null;
  try { return JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); } catch(_) {}
  try { return JSON.parse(raw); } catch(_) {}
  return null;
}

function httpReq(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers
    };
    const req = lib.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const EMPTY = JSON.stringify({ w: [], wl: [], custom: [], _ts: 0 });

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  const userId = (event.queryStringParameters?.userId || '')
    .replace(/[^a-zA-Z0-9-]/g, '');
  if (userId.length < 8) {
    return { statusCode: 400, headers: corsHeaders(),
      body: JSON.stringify({ error: 'Valid userId required' }) };
  }

  const ctx = getBlobsContext();
  if (!ctx || !ctx.url || !ctx.token || !ctx.siteID) {
    // Context unavailable (e.g. local dev) — return empty so client falls back gracefully
    return { statusCode: 200, headers: corsHeaders(), body: EMPTY };
  }

  const blobUrl = `${ctx.url}/${ctx.siteID}/watchlist/${encodeURIComponent(userId)}`;
  const auth = { Authorization: `Bearer ${ctx.token}` };

  if (event.httpMethod === 'GET') {
    try {
      const r = await httpReq('GET', blobUrl, auth, null);
      const body = (r.status === 200 && r.body) ? r.body : EMPTY;
      return { statusCode: 200, headers: corsHeaders(), body };
    } catch(e) {
      return { statusCode: 200, headers: corsHeaders(), body: EMPTY };
    }
  }

  if (event.httpMethod === 'POST') {
    const payload = event.body || '';
    if (payload.length > 10_000_000) {
      return { statusCode: 413, headers: corsHeaders(),
        body: JSON.stringify({ error: 'Payload too large' }) };
    }
    try {
      await httpReq('PUT', blobUrl, {
        ...auth,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(Buffer.byteLength(payload))
      }, payload);
      return { statusCode: 200, headers: corsHeaders(), body: JSON.stringify({ ok: true }) };
    } catch(e) {
      return { statusCode: 500, headers: corsHeaders(),
        body: JSON.stringify({ error: e.message }) };
    }
  }

  return { statusCode: 405, headers: corsHeaders(), body: 'Method not allowed' };
};
