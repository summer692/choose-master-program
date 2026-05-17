import { mkdir, writeFile } from 'node:fs/promises';
import { summarize } from './compare-fields.js';

const REPORTS_DIR = 'reports';

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function fmtValue(v) {
  if (v == null) return '_(空)_';
  if (Array.isArray(v)) return v.map(x => `\`${x}\``).join(', ');
  const s = String(v);
  return s.length > 200 ? s.slice(0, 200) + '…' : s;
}

function fmtQuote(q) {
  if (!q) return '—';
  const s = String(q).replace(/\s+/g, ' ').trim();
  return '"' + (s.length > 240 ? s.slice(0, 240) + '…' : s) + '"';
}

function programSection(programEntry) {
  const { program, fetch, compare, error, pricingNote } = programEntry;
  const lines = [];
  lines.push(`## ${program.id} — ${program.name_zh}`);
  lines.push('');

  if (error) {
    lines.push(`> **状态：${error.code}** — ${error.message}`);
    lines.push(`> 官网：${program.official_url}`);
    lines.push('');
    return lines.join('\n');
  }

  const counts = summarize(compare);
  lines.push(`官网：${fetch.finalUrl}${fetch.fromCache ? '（缓存）' : ''}`);
  lines.push('');
  lines.push(`OK ${counts.OK} · DIFF ${counts.DIFF || 0} · MISSING ${counts.MISSING_ON_SITE || 0} · NEEDS_MANUAL ${counts.NEEDS_MANUAL || 0}`);
  lines.push('');

  const diffs = Object.entries(compare).filter(([, r]) => r.status === 'DIFF');
  const manuals = Object.entries(compare).filter(([, r]) => r.status === 'NEEDS_MANUAL');
  const missing = Object.entries(compare).filter(([, r]) => r.status === 'MISSING_ON_SITE');

  if (diffs.length > 0) {
    lines.push(`### 需要审查的差异（DIFF）`);
    lines.push('');
    lines.push('| 字段 | 当前 data.json | 官网抽出 | 原文出处 | 置信度 |');
    lines.push('|---|---|---|---|---|');
    for (const [k, r] of diffs) {
      lines.push(`| \`${k}\` | ${fmtValue(r.current)} | ${fmtValue(r.extracted)} | ${fmtQuote(r.source_quote)} | ${r.confidence} |`);
    }
    lines.push('');
  }

  if (manuals.length > 0) {
    lines.push(`### 需要人工查 PDF 的字段`);
    lines.push('');
    for (const [k, r] of manuals) {
      lines.push(`- \`${k}\`：${fmtQuote(r.source_quote)}`);
    }
    lines.push('');
  }

  if (missing.length > 0) {
    lines.push(`### 官网上找不到的字段（可能在其它页面，需要人工补）`);
    lines.push('');
    for (const [k] of missing) {
      lines.push(`- \`${k}\``);
    }
    lines.push('');
  }

  const okKeys = Object.entries(compare).filter(([, r]) => r.status === 'OK').map(([k]) => k);
  if (okKeys.length > 0) {
    lines.push(`OK 字段（与官网一致）：${okKeys.map(k => `\`${k}\``).join(', ')}`);
    lines.push('');
  }

  if (pricingNote) {
    lines.push(`> ${pricingNote}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  return lines.join('\n');
}

export async function writeReport({ entries, totals }) {
  await mkdir(REPORTS_DIR, { recursive: true });
  const ymd = todayYmd();
  const path = `${REPORTS_DIR}/verification-${ymd}.md`;

  const brokenEntries = entries.filter(e => e.error);
  const goodEntries = entries.filter(e => !e.error);

  const lines = [];
  lines.push(`# HK Master Program Data Verification — ${ymd}`);
  lines.push('');
  lines.push(`项目数：${entries.length}`);
  lines.push(`- BROKEN: ${brokenEntries.length}`);
  lines.push(`- 已抓取并对比: ${goodEntries.length}`);
  lines.push('');
  lines.push(`Token 用量：input ${totals.inputTokens}，output ${totals.outputTokens}`);
  lines.push(`OpenAI 估算费用：约 $${totals.estimatedUsd.toFixed(4)}`);
  lines.push('');

  if (brokenEntries.length > 0) {
    lines.push(`## ⚠️ 抓取失败的 URL（先修这些）`);
    lines.push('');
    lines.push('| 项目 | URL | 状态 | 错误 |');
    lines.push('|---|---|---|---|');
    for (const e of brokenEntries) {
      lines.push(`| \`${e.program.id}\` | ${e.program.official_url} | ${e.error.code} | ${e.error.message} |`);
    }
    lines.push('');
    lines.push(`处理：去官网搜项目名找新 URL → 更新 data.json 中对应的 \`official_url\` → 跑 \`npm run verify -- --program <id>\`。`);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  for (const entry of entries) {
    lines.push(programSection(entry));
  }

  await writeFile(path, lines.join('\n'));
  return path;
}
