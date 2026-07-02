// Netlify Function — Letterboxd RSS proxy + supplement for older entries
// RSS covers the 50 most recent diary entries; older films are supplemented below
// with the rating + review text confirmed from Jake's Letterboxd film pages.
// When a film ages off the RSS window and its review goes blank on the site,
// add it here (rating + review) so it keeps showing.

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

const LB_RSS  = 'https://letterboxd.com/Jake_Comito/rss/';
const LB_BASE = 'https://letterboxd.com/jake_comito/film/';
const LB_UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Films that have aged off the 50-entry RSS window. Ratings + reviews verified
// from Jake's Letterboxd film pages (2026-06-08).
const SUPPLEMENT = [
  { title: "Anora", year: 2024, rating: 5, link: "https://letterboxd.com/jake_comito/film/anora/",
    review: "One of my favorites of all time. I think about the scene where she rips into the mother on the plane a whole lot, and that's not only because I get served it on IG at least twice a week." },
  { title: "X", year: 2022, rating: 5, link: "https://letterboxd.com/jake_comito/film/x-2022/",
    review: "Absolutely everything about this movie landed for me. I especially loved the ordering of \"events,\" felt super intentional for a female-led slasher film. Mia Goth is a certified star and I can't wait to watch the next two." },
  { title: "Marty Supreme", year: 2025, rating: 4, link: "https://letterboxd.com/jake_comito/film/marty-supreme/",
    review: "I wanted a lot more Tyler and a little less whatdoyoumeanwhythefuckwouldtheydothat. But I did really enjoy Odessa's character being as bat-shit as Timmy's." },
  { title: "The Lord of the Rings: The Fellowship of the Ring", year: 2001, rating: 2, link: "https://letterboxd.com/jake_comito/film/the-lord-of-the-rings-the-fellowship-of-the-ring/",
    review: "My friends have yelled at me for not enjoying this movie. I watched it for the first time in 2026 at 31 and can't help but think that's why. Despite that, I'm still planning to watch the sequels. And I really loved Sean Astin." },
  { title: "Spy", year: 2015, rating: 5, link: "https://letterboxd.com/jake_comito/film/spy/",
    review: "I can watch Melissa McCarthy in increasingly bizarre wigs having dinner with increasingly bizarre people any night of the week." },
  { title: "Notting Hill", year: 1999, rating: 5, link: "https://letterboxd.com/jake_comito/film/notting-hill/",
    review: "I can't rave about this film enough. The leads. The love. The ensemble. The beautiful wit. The iconic \"I'm just a girl\" line. This movie is for those of us who like melting into our sofas." },
  { title: "Stranger Than Fiction", year: 2006, rating: 5, link: "https://letterboxd.com/jake_comito/film/stranger-than-fiction-2006/",
    review: "\"I just figured if I was going to make the world a better place, I would do it with cookies.\" <--- this really smacked me." },
  { title: "The Others", year: 2001, rating: 5, link: "https://letterboxd.com/jake_comito/film/the-others/",
    review: "Truly one of the best endings of any horror movie ever. Also, Nicole Kidman." },
  { title: "Leaving Las Vegas", year: 1995, rating: 4, link: "https://letterboxd.com/jake_comito/film/leaving-las-vegas/",
    review: "I've never loved something this unsettling. But this movie hits it's one note incredibly well." },
  { title: "Now You See Me", year: 2013, rating: 3, link: "https://letterboxd.com/jake_comito/film/now-you-see-me/",
    review: "I always get annoyed thinking back to this movie because it has one of the best set-ups and one of the worst pay-offs. Still conflicted on whether I'll watch the sequels or not." },
  { title: "Blue Jasmine", year: 2013, rating: 2, link: "https://letterboxd.com/jake_comito/film/blue-jasmine/",
    review: "This movie proved that spectacular acting is not enough for me to thoroughly enjoy a movie." },
  { title: "Before Sunrise", year: 1995, rating: 5, link: "https://letterboxd.com/jake_comito/film/before-sunrise/",
    review: "One of the best movies of all time. While watching I was transported back into my early 20s and loved every single second. There's truly no better screenplay." },
  // Aged off the RSS window by 2026-07-01. Ratings + reviews verified from
  // Jake's Letterboxd film pages (JSON-LD ratingValue + reviewBody).
  { title: "Amélie", year: 2001, rating: 5, link: "https://letterboxd.com/jake_comito/film/amelie/",
    review: "Jake likes: this movie. Jake dislikes: when this movie was over. Some of the best writing in a film. The set-up is captivating, and the reward is sweet." },
  { title: "Bugonia", year: 2025, rating: 5, link: "https://letterboxd.com/jake_comito/film/bugonia/",
    review: "In the beginning, I found myself trying to rationalize what Jesse Plemons was saying. Half-way, I found myself trying to rationalize why I was trying to rationalize what Jesse Plemons was saying. Rating bias-alert: I will never not love every Emma Stone movie." },
  { title: "One Battle After Another", year: 2025, rating: 4.5, link: "https://letterboxd.com/jake_comito/film/one-battle-after-another/",
    review: "Only criticism is that it needed more Teyana Taylor. The Christmas dude-club bit really got me." },
  { title: "Inglourious Basterds", year: 2009, rating: 4, link: "https://letterboxd.com/jake_comito/film/inglourious-basterds/",
    review: "Obviously a classic, but I'm forever somewhat disappointed in how randomly the two main stories seemed to come together at the end." },
  { title: "Love Actually", year: 2003, rating: 4, link: "https://letterboxd.com/jake_comito/film/love-actually/",
    review: "This movie is like a warm hug that halfway through you start wondering, “Why am I being hugged?” But I still love being hugged." },
  { title: "Shutter Island", year: 2010, rating: 3.5, link: "https://letterboxd.com/jake_comito/film/shutter-island/",
    review: "I think the hype got to me before the movie did. Everyone raves about the ending, but I thought it was… fine? Still gripping, still fun. Still a huge Leo and Mark R. fan." },
  { title: "The Roses", year: 2025, rating: 3.5, link: "https://letterboxd.com/jake_comito/film/the-roses-2025/",
    review: "A+ acting but this is not a movie that makes you feel nice." },
  { title: "Steel Magnolias", year: 1989, rating: 3.5, link: "https://letterboxd.com/jake_comito/film/steel-magnolias/",
    review: "Zinger after zinger after zinger. I felt like I was living in this movie rather than watching it. The end is a gut-punch; Sally Field really delivers." },
  { title: "A Fish Called Wanda", year: 1988, rating: 3, link: "https://letterboxd.com/jake_comito/film/a-fish-called-wanda/",
    review: "It's hard for me to love a movie where everyone sucks but at least it's fun and Kevin Kline gets what he deserves." },
  { title: "Frankenstein", year: 2025, rating: 3, link: "https://letterboxd.com/jake_comito/film/frankenstein-2025/",
    review: "So much of the cinematography felt fake which is a damn shame for a story all about life. Also: didn't like how unlikable Victor was, but loved Jacob Elordi's \"creature.\"" },
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
// Decode HTML entities, including ALL numeric entities (&#39; &#039; &#x27; …).
// The old version only handled &#39; and missed &#039;, leaving raw entities in
// titles like "If I Had Legs I&#039;d Kick You" so they never matched a film.
function decode(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ');
}
function stripHtml(h) { return decode(h.replace(/<[^>]+>/g, ' ')).replace(/ +/g, ' ').trim(); }

// Fallback: fetch a review from Jake's Letterboxd film page for any future
// supplement entry left with an empty review. Uses the JSON-LD reviewBody /
// meta description — the reliable source. (The old body-text regex matched
// Letterboxd's "upgrade to Pro" promo box, leaking boilerplate into reviews.)
async function tryFetchReview(filmUrl) {
  try {
    const r = await fetch(filmUrl, {
      headers: { 'User-Agent': LB_UA, 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://letterboxd.com/' },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) return '';
    const html = await r.text();
    let m = html.match(/"reviewBody"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (m) { try { return stripHtml(JSON.parse('"' + m[1] + '"')).substring(0, 800); } catch(e) {} }
    m = html.match(/<meta name="description" content="([^"]+)"/);
    if (m) return stripHtml(m[1]).substring(0, 800);
    return '';
  } catch(e) { return ''; }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  try {
    const r = await fetch(LB_RSS, { headers: { 'User-Agent': LB_UA } });
    if (!r.ok) return { statusCode: 200, headers: CORS, body: JSON.stringify(SUPPLEMENT) };
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
    if (suppToFetch.length) {
      await Promise.all(suppToFetch.map(async entry => {
        const rev = await tryFetchReview(entry.link);
        if (rev) entry.review = rev;
      }));
    }
    return { statusCode: 200, headers: CORS, body: JSON.stringify(results) };
  } catch(e) {
    // On any failure, still return the supplement so older films keep their reviews.
    return { statusCode: 200, headers: CORS, body: JSON.stringify(SUPPLEMENT) };
  }
};
