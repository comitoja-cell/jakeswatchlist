// Netlify Function — Letterboxd RSS proxy
// GET → fetches Jake_Comito's Letterboxd RSS and returns parsed reviews as JSON

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const LB_RSS = 'https://letterboxd.com/Jake_Comito/rss/';

function extractTag(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '[^>]*>([^<]*)</' + tag + '>'));
  return m ? m[1].trim() : '';
}

function extractCdata(xml, tag) {
  // Use indexOf to avoid backslash-in-RegExp string escaping pitfalls
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
    .replace(/&#0*39;/g, "'")  // handles both &#39; and &#039;
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  try {
    const res = await fetch(LB_RSS, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JakesWatchList/1.0)' }
    });
    if (!res.ok) {
      return { statusCode: 502, headers: CORS, body: JSON.stringify([]) };
    }
    const xml = await res.text();

    const rawItems = xml.split(/<item[\s>]/);
    rawItems.shift();

    const reviews = [];

    for (const item of rawItems) {
      const filmTitle = decodeEntities(extractTag(item, 'letterboxd:filmTitle'));
      const filmYear  = parseInt(extractTag(item, 'letterboxd:filmYear')) || 0;
      const ratingStr = extractTag(item, 'letterboxd:memberRating');
      const rating    = ratingStr ? parseFloat(ratingStr) : 0;

      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      const link = linkMatch ? linkMatch[1].trim() : '';

      const descHtml = extractCdata(item, 'description');
      const review   = stripHtml(descHtml);

      if (filmTitle && review && review.length > 5) {
        reviews.push({ title: filmTitle, year: filmYear, rating, link, review });
      }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(reviews) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
