import * as cheerio from 'cheerio';

const MAX_CHARS = 40000;

export function cleanHtml(html) {
  const $ = cheerio.load(html);

  $('script, style, noscript, nav, footer, header, iframe, svg, form').remove();
  $('[role="navigation"], [role="banner"], [role="contentinfo"]').remove();
  $('.nav, .navbar, .menu, .footer, .header, .sidebar, .cookie, .breadcrumb').remove();

  const lines = [];
  const $body = $('body').length ? $('body') : $.root();

  $body.find('h1, h2, h3, h4, h5, h6, p, li, td, th, dt, dd').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (/^h[1-6]$/.test(tag)) {
      lines.push(`\n## ${text}`);
    } else if (tag === 'li') {
      lines.push(`- ${text}`);
    } else {
      lines.push(text);
    }
  });

  let out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS) + '\n\n[…truncated for token budget…]';
  }
  return out;
}
