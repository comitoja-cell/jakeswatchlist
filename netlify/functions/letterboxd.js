// Netlify Function — Letterboxd RSS proxy
// GET → fetches Jake_Comito's Letterboxd RSS (multiple pages) and returns parsed reviews as JSON

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const LB_BASE = 'https://letterboxd.com/Jake_Comito/rss/';
const MAX_PAGES = 5; // fetch up to 5 pages (~250 entries) to cover full history

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

    // Prefer <guid> for the film URL — more reliable than <link> in Letterboxd RSS
    const guidMatch = item.match(/<guid[^>]*>([^<]+)<\/guid>/);
    const linkMatch = item.match(/<link>([^<]+)<\/link>/);
    const link = (guidMatch ? guidMatch[1].trim() : '') || (linkMatch ? linkMatch[1].trim() : '');

    const descHtml = extractCdata(item, 'description');
    const review = stripHtml(descHtml);

    // Include any entry that has a title AND (a rating OR a written review)
    if (filmTitle && (rating > 0 || review.length > 5)) {
      results.push({ title: filmTitle, year: filmYear, rating, link, review: review || '' });
    }
  }
  return results;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  try {
    // Fetch multiple pages in parallel to get full diary history
    const pageNums = Array.from({ length: MAX_PAGES }, (_, i) => i + 1);
    const fetches = pageNums.map(p =>
      fetch(p === 1 ? LB_BASE : LB_BASE + '?page=' + p, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JakesWatchList/1.0)' }
      }).then(r => r.ok ? r.text() : '').catch(() => '')
    );
    const pages = await Promise.all(fetches);

    // Parse all pages and deduplicate by title+year (keep first occurrence = most recent)
    const seen = new Set();
    const reviews = [];
    for (const xml of pages) {
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
