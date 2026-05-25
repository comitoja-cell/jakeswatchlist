// Netlify Function — Letterboxd full diary scraper
// Scrapes /films/diary/ HTML pages (bypasses 50-entry RSS limit) + RSS for review text

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const LB_USER = 'Jake_Comito';
const LB_BASE = 'https://letterboxd.com/' + LB_USER;
const LB_RSS  = LB_BASE + '/rss/';
const MAX_PAGES = 8;
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; JakesWatchList/1.0)' };

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
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&nbsp;/g, ' ');
}
function stripHtml(h) { return decode(h.replace(/<[^>]+>/g, ' ')).replace(/  +/g, ' ').trim(); }

async function buildRssMap() {
  const map = {};
  try {
    const r = await fetch(LB_RSS, { headers: UA });
    if (!r.ok) return map;
    const xml = await r.text();
    const parts = xml.split('<item'); parts.shift();
    for (const item of parts) {
      const title  = decode(extractTag(item, 'letterboxd:filmTitle'));
      const year   = parseInt(extractTag(item, 'letterboxd:filmYear')) || 0;
      const rating = parseFloat(extractTag(item, 'letterboxd:memberRating')) || 0;
      const lm     = item.match(/<link>([^<]+)<\/link>/);
      const link   = lm ? lm[1].trim() : '';
      const review = stripHtml(extractCdata(item, 'description'));
      if (title) {
        const key = title.toLowerCase().trim() + '|' + year;
        if (!map[key]) map[key] = { review, link, rating };
      }
    }
  } catch(_) {}
  return map;
}

// Parse diary entries from HTML — split on 'diary-entry-row' strings (no complex regex)
function parseDiary(html) {
  const out = [];
  const chunks = html.split('diary-entry-row');
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const sm = chunk.match(/data-film-slug="([^"]+)"/);
    const ym = chunk.match(/data-film-year="([^"]+)"/);
    const tm = chunk.match(/<h3[^>]*>[^<]*<a[^>]*>([^<]+)<\/a>/);
    if (!sm || !tm) continue;
    const slug   = sm[1];
    const year   = ym ? parseInt(ym[1]) : 0;
    const title  = decode(tm[1].trim());
    const rm     = chunk.match(/rated-(\d+)/);
    const rating = rm ? parseInt(rm[1]) / 2 : 0;
    out.push({ title, year, rating, link: LB_BASE + '/film/' + slug + '/' });
  }
  return out;
}

async function getDiaryPage(page) {
  const url = LB_BASE + '/films/diary/' + (page > 1 ? 'page/' + page + '/' : '');
  try {
    const r = await fetch(url, { headers: UA });
    return r.ok ? r.text() : '';
  } catch(_) { return ''; }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  try {
    const pageNums = Array.from({ length: MAX_PAGES }, (_, i) => i + 1);
    const [rssMap, ...htmlPages] = await Promise.all([buildRssMap(), ...pageNums.map(getDiaryPage)]);
    const seen = new Set();
    const results = [];
    for (const html of htmlPages) {
      if (!html) continue;
      const entries = parseDiary(html);
      if (entries.length === 0) break;
      for (const e of entries) {
        const key = e.title.toLowerCase().trim() + '|' + e.year;
        if (seen.has(key)) continue;
        seen.add(key);
        const rss = rssMap[key] || {};
        results.push({
          title:  e.title,
          year:   e.year,
          rating: e.rating || rss.rating || 0,
          link:   rss.link || e.link,
          review: rss.review || ''
        });
      }
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
