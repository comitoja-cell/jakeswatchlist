// Netlify Function — Cloud sync endpoint using Netlify Blobs
// GET  ?userId=UUID  → returns stored JSON
// POST ?userId=UUID  → stores request body JSON

const { getStore } = require('@netlify/blobs');

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders(), body: '' };
  }

  // Sanitize userId — alphanumeric and hyphens only
  const userId = (event.queryStringParameters?.userId || '')
    .replace(/[^a-zA-Z0-9-]/g, '');

  if (userId.length < 8) {
    return {
      statusCode: 400,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Valid userId required (min 8 chars)' })
    };
  }

  let store;
  try {
    store = getStore('watchlist');
  } catch(e) {
    return {
      statusCode: 503,
      headers: corsHeaders(),
      body: JSON.stringify({ error: 'Storage unavailable: ' + e.message })
    };
  }

  if (event.httpMethod === 'GET') {
    try {
      const data = await store.get(userId, { type: 'text' });
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: data || JSON.stringify({ w: [], wl: [], custom: [], _ts: 0 })
      };
    } catch(e) {
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ w: [], wl: [], custom: [], _ts: 0 })
      };
    }
  }

  if (event.httpMethod === 'POST') {
    try {
      const body = event.body;
      if (!body || body.length > 10_000_000) { // 10MB limit
        return {
          statusCode: 413,
          headers: corsHeaders(),
          body: JSON.stringify({ error: 'Payload too large' })
        };
      }
      await store.set(userId, body);
      return {
        statusCode: 200,
        headers: corsHeaders(),
        body: JSON.stringify({ ok: true })
      };
    } catch(e) {
      return {
        statusCode: 500,
        headers: corsHeaders(),
        body: JSON.stringify({ error: e.message })
      };
    }
  }

  return { statusCode: 405, headers: corsHeaders(), body: 'Method not allowed' };
};
