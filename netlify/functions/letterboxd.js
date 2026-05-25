const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; JakesWatchList/1.0)' };

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const qs = event.queryStringParameters || {};
  const url = 'https://letterboxd.com/jake_comito/films/rated/' + (qs.p ? 'page/' + qs.p + '/' : '');
  const r = await fetch(url, { headers: UA });
  const html = await r.text();
  const start = parseInt(qs.s || '0');
  // Find markers
  const markers = ['rated-', 'data-film-slug', 'film-poster', 'poster-container', 'viewing-poster', 'poster-list', 'film-rating'];
  const found = markers.filter(m => html.includes(m));
  // Find first rated- occurrence
  const rIdx = html.indexOf('rated-');
  const rCtx = rIdx > 0 ? html.slice(Math.max(0,rIdx-100), rIdx+200) : 'not found';
  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, len: html.length, found, rCtx, slice: html.slice(start, start+2000) }) };
};
