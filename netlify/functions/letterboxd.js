const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; JakesWatchList/1.0)' };
const BASE = 'https://letterboxd.com/jake_comito/film/';
const FILMS = ['anora', 'x-2022', 'marty-supreme', 'the-lord-of-the-rings-the-fellowship-of-the-ring', 'spy-2015'];

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const results = await Promise.all(FILMS.map(async slug => {
    const r = await fetch(BASE + slug + '/', { headers: UA });
    const html = await r.text();
    // Rating: <meta name="twitter:data2" content="4.5 out of 5">
    const rm = html.match(/twitter:data2[^>]*content="([^"]+)"/);
    const rating = rm ? rm[1] : 'not found';
    // Review snippet
    const rev = html.match(/class="review body-text[^>]*>([\s\S]{0,300})/);
    const revText = rev ? rev[1].replace(/<[^>]+>/g,' ').trim().slice(0,150) : 'none';
    return { slug, rating, revText };
  }));
  return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
};
