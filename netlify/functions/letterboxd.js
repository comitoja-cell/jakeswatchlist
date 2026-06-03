// Netlify Function — Letterboxd RSS proxy + supplement for older entries
// RSS covers the 50 most recent diary entries; older films are supplemented below
// NOTE: Letterboxd's personal film pages are Cloudflare-protected; ratings are hardcoded.
//       Verify and update SUPPLEMENT manually when films age off the RSS.

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const LB_RSS  = 'https://letterboxd.com/Jake_Comito/rss/';
const LB_BASE = 'https://letterboxd.com/jake_comito/film/';
const LB_UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Films that have aged off the 50-entry RSS window.
// Ratings confirmed from Jake's watchlist (w.r) — 2026-06-03.
const SUPPLEMENT = [
  { title: 'Anora',                                              year: 2024, rating: 5, link: LB_BASE + 'anora/',
    review: 'One of my favorites of all time. I think about the scene where she rips into the mother on the plane a whole lot, and that\'s not only because I get served it on IG at least twice a week.' },
  { title: 'X',                                                 year: 2022, rating: 5, link: LB_BASE + 'x-2022/',                               review: '' },
  { title: 'Marty Supreme',                                     year: 2025, rating: 4, link: LB_BASE + 'marty-supreme/',                        review: '' },
  { title: 'The Lord of the Rings: The Fellowship of the Ring', year: 2001, rating: 2, link: LB_BASE + 'the-lord-of-the-rings-the-fellowship-of-the-ring/', review: '' },
  { title: 'Spy',                                               year: 2015, rating: 4, link: LB_BASE + 'spy/',                                  review: '' },
  // Ratings confirmed from watchlist (w.r); reviews fetched dynamically at runtime
  { title: 'Notting Hill',           year: 1999, rating: 5, link: LB_BASE + 'notting-hill/',                  review: '' },
  { title: 'Stranger Than Fiction',  year: 2006, rating: 5, link: LB_BASE + 'stranger-than-fiction-2006/',   review: '' },
  { title: 'The Others',             year: 2001, rating: 4, link: LB_BASE + 'the-others/',                   review: '' },
  { title: 'Leaving Las Vegas',      year: 1995, rating: 3, link: LB_BASE + 'leaving-las-vegas/',            review: '' },
  { title: 'Now You See Me',         year: 2013, rating: 3, link: LB_BASE + 'now-you-see-me/',               review: '' },
  { title: 'Blue Jasmine',           year: 2013, rating: 1, link: LB_BASE + 'blue-jasmine/',                 review: '' },
];

function extractTag(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>'));
  return m ? m[1].trim() : '';
}
function extractCdata(xml, tag) {
  const o = xml.indexOf('<' + tag); if (o < 0) return '';
  const s = xml.indexOf('<![CDATA[', o); if (s < 0) return '';
  const e = xml.indexOf(']]>', s);    if (e < 0) return '';
  return xml.slice(s + 9, e);
}
function decode(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&apos;/g,"'");
}
function stripHtml(h) { return decode(h.replace(/<[^>]+>/g,' ')).replace(/ +/g,' ').trim(); }

// Attempt to fetch a film review from Jake's Letterboxd film page.
// Letterboxd may allow server-side requests with browser-like headers.
// Returns '' on any failure (Cloudflare block, timeout, parse error).
async function tryFetchReview(filmUrl) {
  try {
    const r = await fetch(filmUrl, {
      headers: {
        'User-Agent': LB_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://letterboxd.com/',
        'Cache-Control': 'no-cache'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) return '';
    const html = await r.text();
    // Look for the review body in Letterboxd's HTML
    const m = html.match(/class="[^"]*body-text[^"]*"[^>]*>\s*<p>([\s\S]*?)<\/p>/);
    if (m) return stripHtml(m[1]).trim().substring(0, 800);
    return '';
  } catch(e) { return ''; }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  try {
    const r = await fetch(LB_RSS, { headers: { 'User-Agent': LB_UA } });
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
    // Merge supplement (skip any already covered by RSS)
    const suppToFetch = [];
    for (const s of SUPPLEMENT) {
      const key = s.title.toLowerCase().trim() + '|' + s.year;
      if (!seen.has(key)) {
        const entry = { title: s.title, year: s.year, rating: s.rating, link: s.link, review: s.review };
        results.push(entry);
        if (!entry.review && entry.link) suppToFetch.push(entry);
      }
    }
    // Attempt to fetch reviews for supplement entries with empty reviews
    if (suppToFetch.length) {
      await Promise.all(suppToFetch.map(async entry => {
        const rev = await tryFetchReview(entry.link);
        if (rev) entry.review = rev;
      }));
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
