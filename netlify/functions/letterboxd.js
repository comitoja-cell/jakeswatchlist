// Netlify Function — Letterboxd full diary scraper
// Scrapes diary HTML pages (bypasses 50-entry RSS limit) + RSS for review text

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const LB_USER = 'Jake_Comito';
const LB_BASE = 'https://letterboxd.com/' + LB_USER;
const LB_RSS  = LB_BASE + '/rss/';
const MAX_DIARY_PAGES = 8;
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; JakesWatchList/1.0)' };

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
function decodeEntities(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0*39;/g,"'").replace(/&nbsp;/g,' ');
}
function stripHtml(h) {
  return decodeEntities(h.replace(/<[^>]+>/g,' ')).replace(/\\s+/g,' ').trim();
}

async function buildRssMap() {
  const map = {};
  try {
    const r = await fetch(LB_RSS, { headers: HEADERS });
    if (!r.ok) return map;
    const xml = await r.text();
    const items = xml.split(/<item[\\s>]/); items.shift();
    for (const item of items) {
      const title  = decodeEntities(extractTag(item, 'letterboxd:filmTitle'));
      const year   = parseInt(extractTag(item, 'letterboxd:filmYear')) || 0;
      const rating = parseFloat(extractTag(item, 'letterboxd:memberRating')) || 0;
      const lm     = item.match(/<link>([^<]+)<\\/link>/);
      const link   = lm ? lm[1].trim() : '';
      const review = stripHtml(extractCdata(item, 'description'));
      if (title) map[title.toLowerCase().trim() + '|' + year] = { review, link, rating };
    }
  } catch(_) {}
  return map;
}

function parseDiaryPage(html) {
  const entries = [];
  const rowRe = /<tr[^>]*class="[^"]*diary-entry-row[^"]*"([^>]*)>([\\s\\S]*?)<\\/tr>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const attrs = m[1], row = m[2];
    const slugM  = attrs.match(/data-film-slug="([^"]+)"/);
    const yearM  = attrs.match(/data-film-year="([^"]+)"/);
    if (!slugM) continue;
    const slug  = slugM[1];
    const year  = yearM ? parseInt(yearM[1]) : 0;
    const titleM = row.match(/<h3[^>]*>\\s*<a[^>]*>([^<]+)<\\/a>/);
    if (!titleM) continue;
    const title  = decodeEntities(titleM[1].trim());
    const ratedM = row.match(/class="[^"]*rated-(\\d+)[^"]*"/);
    const rating = ratedM ? parseInt(ratedM[1]) / 2 : 0;
    entries.push({ title, year, rating, slug, link: LB_BASE + '/film/' + slug + '/' });
  }
  return entries;
}

async function fetchDiaryPage(page) {
  const url = LB_BASE + '/films/diary/' + (page > 1 ? 'page/' + page + '/' : '');
  try {
    const r = await fetch(url, { headers: HEADERS });
    return r.ok ? r.text() : '';
  } catch(_) { return ''; }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  try {
    const pageNums = Array.from({ length: MAX_DIARY_PAGES }, (_, i) => i + 1);
    const [rssMap, ...htmlPages] = await Promise.all([
      buildRssMap(),
      ...pageNums.map(fetchDiaryPage)
    ]);
    const seen = new Set();
    const results = [];
    for (const html of htmlPages) {
      if (!html) continue;
      const entries = parseDiaryPage(html);
      if (entries.length === 0) break;
      for (const e of entries) {
        const key = e.title.toLowerCase().trim() + '|' + e.year;
        if (seen.has(key)) continue;
        seen.add(key);
        const rss = rssMap[key] || {};
        results.push({ title: e.title, year: e.year, rating: e.rating || rss.rating || 0, link: rss.link || e.link, review: rss.review || '' });
      }
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
