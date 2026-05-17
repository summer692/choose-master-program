import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

const CACHE_ROOT = '.cache';
const HTML_DIR = `${CACHE_ROOT}/html`;
const EXTRACT_DIR = `${CACHE_ROOT}/extractions`;
const DEFAULT_TTL_HOURS = 24;

function sha1(s) {
  return createHash('sha1').update(s).digest('hex');
}

async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

function isFresh(mtimeMs, ttlHours) {
  return Date.now() - mtimeMs < ttlHours * 3600 * 1000;
}

export async function getHtml(url, { ttlHours = DEFAULT_TTL_HOURS } = {}) {
  const path = `${HTML_DIR}/${sha1(url)}.html`;
  if (!existsSync(path)) return null;
  const st = await stat(path);
  if (!isFresh(st.mtimeMs, ttlHours)) return null;
  return readFile(path, 'utf8');
}

export async function setHtml(url, html) {
  await ensureDir(HTML_DIR);
  await writeFile(`${HTML_DIR}/${sha1(url)}.html`, html);
}

export function htmlHash(html) {
  return sha1(html);
}

export async function getExtraction(programId, htmlHash) {
  const path = `${EXTRACT_DIR}/${programId}.json`;
  if (!existsSync(path)) return null;
  const raw = await readFile(path, 'utf8');
  const obj = JSON.parse(raw);
  return obj.htmlHash === htmlHash ? obj.extraction : null;
}

export async function setExtraction(programId, htmlHash, extraction) {
  await ensureDir(EXTRACT_DIR);
  await writeFile(
    `${EXTRACT_DIR}/${programId}.json`,
    JSON.stringify({ htmlHash, extraction, savedAt: new Date().toISOString() }, null, 2)
  );
}
