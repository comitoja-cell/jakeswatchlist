const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; JakesWatchList/1.0)' };

async function getRating(slug) {
  const urls = [
    'https://letterboxd.com/jake_comito/film/' + slug + '/',
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) continue;
      const html = await r.text();
      const rm = html.match(/rated-(\d+)/);
      const reviewM = html.match(/class="body-text[^"]*">([\s\S]{0,400})/);
      const review = reviewM ? reviewM[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,200) : '';
      if (rm) return { slug, rating: parseInt(rm[1])/2, review, url };
    } catch(_) {}
  }
  return { slug, rating: 0, review: '', url: '' };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  // Check these slugs — corrected from Letterboxd canonical URLs
  const slugs = ['anora', 'x-2022', 'marty-supreme', 'the-lord-of-the-rings-the-fellowship-of-the-ring', 'spy'];
  const results = await Promise.all(slugs.map(getRating));
  return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
};
