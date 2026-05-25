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
      const filmYear = parseInt(extractTag(item, 'letterboxd:filmYear')) || 0;
      const ratingStr = extractTag(item, 'letterboxd:memberRating');
      const rating = ratingStr ? parseFloat(ratingStr) : 0;

      // Prefer <guid> for the film URL (more reliable than <link> in RSS)
      const guidMatch = item.match(/<guid[^>]*>([^<]+)<\/guid>/);
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      const link = (guidMatch ? guidMatch[1].trim() : '') || (linkMatch ? linkMatch[1].trim() : '');

      const descHtml = extractCdata(item, 'description');
      const review = stripHtml(descHtml);

      // Include any entry that has a title AND (a rating OR a written review)
      // Previously strict review.length > 5 was dropping rating-only entries
      if (filmTitle && (rating > 0 || review.length > 5)) {
        reviews.push({ title: filmTitle, year: filmYear, rating, link, review: review || '' });
      }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(reviews) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
