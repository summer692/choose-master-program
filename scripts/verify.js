#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import 'dotenv/config';

import { fetchPage } from './lib/fetch-page.js';
import { cleanHtml } from './lib/clean-html.js';
import { extractFields, lowConfidenceCount } from './lib/extract-fields.js';
import { compareProgram } from './lib/compare-fields.js';
import { writeReport } from './lib/report.js';
import { getExtraction, setExtraction, htmlHash } from './lib/cache.js';

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { noCache: false, programIds: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--no-cache') out.noCache = true;
    else if (a === '--program') {
      out.programIds = [argv[++i]];
    }
  }
  return out;
}

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || 'gpt-4o';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 20000;
const CACHE_TTL_HOURS = Number(process.env.CACHE_TTL_HOURS) || 24;

// rough pricing (USD per 1K tokens) — adjust as model prices change
const PRICING = {
  'gpt-4o-mini':       { input: 0.000150, output: 0.000600 },
  'gpt-4o':            { input: 0.0025,   output: 0.010 },
  'gpt-4-turbo':       { input: 0.010,    output: 0.030 },
};

function estimateCost(usage, model) {
  const p = PRICING[model];
  if (!p || !usage) return 0;
  return (usage.prompt_tokens / 1000) * p.input + (usage.completion_tokens / 1000) * p.output;
}

function schoolName(data, schoolId) {
  return data.schools.find(s => s.id === schoolId)?.name_zh || schoolId;
}
function directionName(data, dirId) {
  return data.directions.find(d => d.id === dirId)?.name_zh || dirId;
}

async function verifyOne(program, data, apiKey) {
  const fetchRes = await fetchPage(program.official_url, {
    useCache: !args.noCache,
    timeoutMs: REQUEST_TIMEOUT_MS,
  });

  if (!fetchRes.ok) {
    return {
      program,
      error: {
        code: fetchRes.status === 0 ? 'FETCH_FAILED' :
              fetchRes.status === 404 ? 'BROKEN_URL' :
              fetchRes.status === 403 ? 'BLOCKED' :
              `HTTP_${fetchRes.status}`,
        message: fetchRes.error || `HTTP ${fetchRes.status}`,
      },
      usage: { prompt_tokens: 0, completion_tokens: 0 },
      cost: 0,
      model: null,
    };
  }

  const cleanText = cleanHtml(fetchRes.html);
  const hash = htmlHash(fetchRes.html);

  let extraction, usage, model;
  if (!args.noCache) {
    const cached = await getExtraction(program.id, hash);
    if (cached) {
      extraction = cached;
      usage = { prompt_tokens: 0, completion_tokens: 0 };
      model = '(cached)';
    }
  }

  if (!extraction) {
    const meta = {
      school_name: schoolName(data, program.school_id),
      name_zh: program.name_zh,
      direction: directionName(data, program.direction_id),
    };

    try {
      let res = await extractFields({ programMeta: meta, cleanText, apiKey, model: MODEL });
      // fallback if any low-confidence
      if (lowConfidenceCount(res.extraction) > 0 && FALLBACK_MODEL !== MODEL) {
        try {
          const res2 = await extractFields({ programMeta: meta, cleanText, apiKey, model: FALLBACK_MODEL });
          res = { extraction: res2.extraction, usage: addUsage(res.usage, res2.usage), model: FALLBACK_MODEL };
        } catch {
          /* keep mini result */
        }
      }
      extraction = res.extraction;
      usage = res.usage;
      model = res.model;
      await setExtraction(program.id, hash, extraction);
    } catch (err) {
      return {
        program,
        fetch: fetchRes,
        error: { code: 'EXTRACTION_FAILED', message: err.message || String(err) },
        usage: { prompt_tokens: 0, completion_tokens: 0 },
        cost: 0,
        model: null,
      };
    }
  }

  const compare = compareProgram(program, extraction);
  return {
    program,
    fetch: fetchRes,
    compare,
    usage,
    cost: estimateCost(usage, model),
    model,
    pricingNote: fetchRes.pdfLinks && fetchRes.pdfLinks.length
      ? `检测到 ${fetchRes.pdfLinks.length} 个 PDF 链接：${fetchRes.pdfLinks.slice(0, 3).join(', ')}`
      : null,
  };
}

function addUsage(a, b) {
  return {
    prompt_tokens: (a?.prompt_tokens || 0) + (b?.prompt_tokens || 0),
    completion_tokens: (a?.completion_tokens || 0) + (b?.completion_tokens || 0),
  };
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ 环境变量 OPENAI_API_KEY 未设置。');
    console.error('   请复制 .env.example 为 .env 并填入你的 OpenAI key。');
    process.exit(1);
  }

  const data = JSON.parse(await readFile('data.json', 'utf8'));
  const targets = args.programIds
    ? data.programs.filter(p => args.programIds.includes(p.id))
    : data.programs;

  if (targets.length === 0) {
    console.error('❌ 没匹配到任何项目。检查 --program 参数。');
    process.exit(1);
  }

  console.log(`开始核校 ${targets.length} 个项目（模型：${MODEL}，缓存：${args.noCache ? '关闭' : `${CACHE_TTL_HOURS}h`}）`);
  console.log('');

  const entries = [];
  const totals = { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };
  let lastSchool = null;

  for (const program of targets) {
    if (lastSchool && program.school_id !== lastSchool) {
      await new Promise(r => setTimeout(r, 2000));
    }
    process.stdout.write(`  ${program.id} ... `);
    const entry = await verifyOne(program, data, process.env.OPENAI_API_KEY);
    entries.push(entry);

    totals.inputTokens += entry.usage?.prompt_tokens || 0;
    totals.outputTokens += entry.usage?.completion_tokens || 0;
    totals.estimatedUsd += entry.cost || 0;
    lastSchool = program.school_id;

    if (entry.error) {
      console.log(`❌ ${entry.error.code}`);
    } else {
      const counts = Object.values(entry.compare).reduce((acc, r) => {
        acc[r.status] = (acc[r.status] || 0) + 1;
        return acc;
      }, {});
      console.log(`✅ OK ${counts.OK || 0} DIFF ${counts.DIFF || 0} MISS ${counts.MISSING_ON_SITE || 0} MANUAL ${counts.NEEDS_MANUAL || 0}`);
    }
  }

  const reportPath = await writeReport({ entries, totals });
  console.log('');
  console.log(`📄 报告：${reportPath}`);
  console.log(`💰 估算 OpenAI 费用：约 $${totals.estimatedUsd.toFixed(4)}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
