// Netlify Function — Letterboxd RSS proxy
// Fetches multiple pages of Jake_Comito's Letterboxd diary

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const LB_BASE = 'https://letterboxd.com/Jake_Comito/rss/';

function extractTag(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>'));
  return m ? m[1].trim() : '';
}

function extractCdata(xml, tag) {
  const open = xml.indexOf('<' + tag);
  if (open === -1) return '';
  const cdataStart = xml.indexOf('<![CDATA[', open);
  if (cdataStart === -1) return '';
  const cdataEnd = xml.indexOf(']]>', cdataStart);
  if (cdataEnd === -1) return '';
  return xml.slice(cdataStart + 9, cdataEnd);
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseItems(xml) {
  const rawItems = xml.split(/<item[\s>]/);
  rawItems.shift();
  const results = [];
  for (const item of rawItems) {
    const filmTitle = decodeEntities(extractTag(item, 'letterboxd:filmTitle'));
    const filmYear = parseInt(extractTag(item, 'letterboxd:filmYear')) || 0;
    const ratingStr = extractTag(item, 'letterboxd:memberRating');
    const rating = ratingStr ? parseFloat(ratingStr) : 0;
    const linkMatch = item.match(/<link>([^<]+)<\/link>/);
    const link = linkMatch ? linkMatch[1].trim() : '';
    const descHtml = extractCdata(item, 'description');
    const review = stripHtml(descHtml);
    if (filmTitle && (rating > 0 || review.length > 5)) {
      results.push({ title: filmTitle, year: filmYear, rating, link, review: review || '' });
    }
  }
  return results;
}

async function fetchPage(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JakesWatchList/1.0)' }
    });
    if (!r.ok) return { xml: '', status: r.status };
    return { xml: await r.text(), status: r.status };
  } catch(e) {
    return { xml: '', status: 0, error: e.message };
  }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  // If ?debug=1, return diagnostic info about pagination
  if (event.queryStringParameters && event.queryStringParameters.debug) {
    const pages = await Promise.all([1,2,3,4].map(p =>
      fetchPage(p === 1 ? LB_BASE : LB_BASE + '?page=' + p)
    ));
    const diag = pages.map((p, i) => {
      const items = parseItems(p.xml);
      return {
        page: i + 1,
        status: p.status,
        count: items.length,
        first: items[0] ? items[0].title : null,
        last: items[items.length-1] ? items[items.length-1].title : null
      };
    });
    return { statusCode: 200, headers: CORS, body: JSON.stringify(diag) };
  }

  try {
    // Fetch pages 1-4 in parallel (Letterboxd RSS: ~50 entries per page)
    const pages = await Promise.all([1,2,3,4].map(p =>
      fetchPage(p === 1 ? LB_BASE : LB_BASE + '?page=' + p)
    ));

    const seen = new Set();
    const reviews = [];
    for (const { xml } of pages) {
      if (!xml) continue;
      for (const entry of parseItems(xml)) {
        const key = entry.title.toLowerCase().trim() + '|' + entry.year;
        if (!seen.has(key)) {
          seen.add(key);
          reviews.push(entry);
        }
      }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(reviews) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
