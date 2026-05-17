#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function head(url, timeoutMs = 15000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-HK,en' },
    });
    clearTimeout(timer);
    return { status: res.status, finalUrl: res.url };
  } catch (err) {
    clearTimeout(timer);
    return { status: 0, error: err.message };
  }
}

const data = JSON.parse(await readFile('data.json', 'utf8'));

console.log('正在检查 official_url 健康状态...\n');
const pad = s => s.padEnd(28);

for (const p of data.programs) {
  const { status, finalUrl, error } = await head(p.official_url);
  const tag = status >= 200 && status < 300 ? '✅' : status === 0 ? '❌' : '⚠️';
  const code = status === 0 ? error : String(status);
  console.log(`${tag} ${pad(p.id)} ${code.padEnd(40)} ${finalUrl || p.official_url}`);
}
