import fetch from 'node-fetch';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'hr,sr,bs;q=0.9,en;q=0.8'
};

function normalizeForSearch(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/đ/g, 'dj')
    .replace(/ž/g, 'z')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch verified full lyrics from Tekstovi.net
 */
export async function fetchVerifiedLyricsFromTekstoviNet(artistName, songTitle) {
  try {
    const q = `${artistName} ${songTitle}`.trim();
    const searchUrl = `https://tekstovi.net/2,0,0.html?q=${encodeURIComponent(q)}`;
    
    const res = await fetch(searchUrl, { headers: HEADERS, timeout: 8000 });
    if (!res.ok) return null;
    const html = await res.text();

    // Look for search result links: <a href="2,xxx,xxx.html">Title</a>
    const linkRegex = /<a\s+[^>]*href=["'](2,\d+,\d+\.html)["'][^>]*>(.*?)<\/a>/gi;
    let match;
    let targetLink = null;
    const normTitle = normalizeForSearch(songTitle);

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const text = normalizeForSearch(match[2].replace(/<[^>]+>/g, ''));
      if (text.includes(normTitle) || normTitle.includes(text)) {
        targetLink = `https://tekstovi.net/${href}`;
        break;
      }
    }

    if (!targetLink) {
      // Fallback: take the first song link from results
      const firstMatch = /<a\s+[^>]*href=["'](2,\d+,\d+\.html)["']/i.exec(html);
      if (firstMatch) {
        targetLink = `https://tekstovi.net/${firstMatch[1]}`;
      }
    }

    if (!targetLink) return null;

    const pageRes = await fetch(targetLink, { headers: HEADERS, timeout: 8000 });
    if (!pageRes.ok) return null;
    const pageHtml = await pageRes.text();

    // Extract <section class="lyrics" id="php-lyrics">...</section>
    const lyricsMatch = pageHtml.match(/<section[^>]*class=["']lyrics["'][^>]*>([\s\S]*?)<\/section>/i);
    if (!lyricsMatch) return null;

    let cleanLyrics = lyricsMatch[1]
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .trim();

    return cleanLyrics;
  } catch (err) {
    return null;
  }
}
