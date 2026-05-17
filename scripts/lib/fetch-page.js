import * as cheerio from 'cheerio';
import { getHtml, setHtml } from './cache.js';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export async function fetchPage(url, { useCache = true, timeoutMs = 20000 } = {}) {
  if (useCache) {
    const cached = await getHtml(url);
    if (cached) {
      return { ok: true, status: 200, finalUrl: url, html: cached, fromCache: true, pdfLinks: extractPdfLinks(cached, url) };
    }
  }

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ac.signal,
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-HK,zh;q=0.9,en;q=0.8',
      },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { ok: false, status: res.status, finalUrl: res.url, error: `HTTP ${res.status}` };
    }

    const html = await res.text();
    await setHtml(url, html);
    return { ok: true, status: res.status, finalUrl: res.url, html, fromCache: false, pdfLinks: extractPdfLinks(html, url) };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: 0, finalUrl: url, error: err.message || String(err) };
  }
}

function extractPdfLinks(html, baseUrl) {
  try {
    const $ = cheerio.load(html);
    const links = new Set();
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      if (/\.pdf(\?|$)/i.test(href)) {
        try {
          links.add(new URL(href, baseUrl).href);
        } catch {
          /* ignore invalid URL */
        }
      }
    });
    return [...links];
  } catch {
    return [];
  }
}
