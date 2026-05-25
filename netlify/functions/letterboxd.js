Fix Letterboxd: RSS + hardcoded supplement for films beyond 50-entry window// RSS covers the 50 most recent diary entries; older films are supplemented below

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const LB_RSS = 'https://letterboxd.com/Jake_Comito/rss/';
const LB_BASE = 'https://letterboxd.com/jake_comito/film/';

// Films that have aged off the 50-entry RSS window — add here when needed.
// Format: { title, year, rating, link, review }
// Rating: Letterboxd stars (0 = not rated, 3.5 = 3.5 stars, etc.)
const SUPPLEMENT = [
  { title: 'Anora',                                              year: 2024, rating: 0, link: LB_BASE + 'anora/',                review: '' },
  { title: 'X',                                                 year: 2022, rating: 4, link: LB_BASE + 'x-2022/',              review: '' },
  { title: 'Marty Supreme',                                     year: 2025, rating: 0, link: LB_BASE + 'marty-supreme/',        review: '' },
  { title: 'The Lord of the Rings: The Fellowship of the Ring', year: 2001, rating: 0, link: LB_BASE + 'the-lord-of-the-rings-the-fellowship-of-the-ring/', review: '' },
  { title: 'Spy',                                               year: 2015, rating: 0, link: LB_BASE + 'spy-2015/',            review: '' },
];

function extractTag(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>'));
  return m ? m[1].trim() : '';
}
function extractCdata(xml, tag) {
  const o = xml.indexOf('<' + tag); if (o < 0) return '';
  const s = xml.indexOf('<![CDATA[', o); if (s < 0) return '';
  const e = xml.indexOf(']]>', s); if (e < 0) return '';
  return xml.slice(s + 9, e);
}
function decode(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0*39;/g,"'").replace(/&nbsp;/g,' ');
}
function stripHtml(h) { return decode(h.replace(/<[^>]+>/g,' ')).replace(/ +/g,' ').trim(); }

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  try {
    const r = await fetch(LB_RSS, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JakesWatchList/1.0)' } });
    if (!r.ok) return { statusCode: 502, headers: CORS, body: JSON.stringify(SUPPLEMENT) };
    const xml = await r.text();
    const parts = xml.split('<item'); parts.shift();
    const seen = new Set();
    const results = [];
    for (const item of parts) {
      const title  = decode(extractTag(item, 'letterboxd:filmTitle'));
      const year   = parseInt(extractTag(item, 'letterboxd:filmYear')) || 0;
      const rating = parseFloat(extractTag(item, 'letterboxd:memberRating')) || 0;
      const lm     = item.match(/<link>([^<]+)<\/link>/);
      const link   = lm ? lm[1].trim() : '';
      const review = stripHtml(extractCdata(item, 'description'));
      if (title && (rating > 0 || review.length > 5)) {
        const key = title.toLowerCase().trim() + '|' + year;
        if (!seen.has(key)) { seen.add(key); results.push({ title, year, rating, link, review }); }
      }
    }
    // Merge supplement entries (skip any already in RSS)
    for (const s of SUPPLEMENT) {
      const key = s.title.toLowerCase().trim() + '|' + s.year;
      if (!seen.has(key)) results.push(s);
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
