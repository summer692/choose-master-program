const SCALAR_KEYS = [
  'name_en', 'intro', 'duration', 'tuition_hkd', 'ielts', 'toefl', 'cet',
  'gmat_gre', 'background', 'work_experience', 'deadline',
];
const LIST_KEYS = ['core_courses', 'elective_courses', 'career_outcomes'];

function normString(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function setEqual(a, b) {
  if (a.length !== b.length) return false;
  const A = new Set(a.map(normString));
  const B = new Set(b.map(normString));
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

function scalarStatus(current, ext) {
  if (ext.confidence === 'missing') return 'MISSING_ON_SITE';
  if (ext.confidence === 'needs_manual_pdf_review') return 'NEEDS_MANUAL';
  if (ext.value == null) return 'MISSING_ON_SITE';

  // tuition_hkd: compare as number
  const a = String(current ?? '').replace(/[, ]/g, '');
  const b = String(ext.value ?? '').replace(/[, ]/g, '');
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    return Number(a) === Number(b) ? 'OK' : 'DIFF';
  }
  return normString(current) === normString(ext.value) ? 'OK' : 'DIFF';
}

function listStatus(current, ext) {
  if (ext.confidence === 'needs_manual_pdf_review') return 'NEEDS_MANUAL';
  if (ext.confidence === 'missing' || !Array.isArray(ext.value)) return 'MISSING_ON_SITE';
  const cur = Array.isArray(current) ? current : [];
  return setEqual(cur, ext.value) ? 'OK' : 'DIFF';
}

export function compareProgram(currentProgram, extraction) {
  const results = {};
  for (const k of SCALAR_KEYS) {
    results[k] = {
      status: scalarStatus(currentProgram[k], extraction[k]),
      current: currentProgram[k],
      extracted: extraction[k].value,
      source_quote: extraction[k].source_quote,
      confidence: extraction[k].confidence,
    };
  }
  for (const k of LIST_KEYS) {
    results[k] = {
      status: listStatus(currentProgram[k], extraction[k]),
      current: currentProgram[k],
      extracted: extraction[k].value,
      source_quote: extraction[k].source_quote,
      confidence: extraction[k].confidence,
    };
  }
  return results;
}

export function summarize(compareResults) {
  const counts = { OK: 0, DIFF: 0, MISSING_ON_SITE: 0, NEEDS_MANUAL: 0 };
  for (const r of Object.values(compareResults)) {
    counts[r.status] = (counts[r.status] || 0) + 1;
  }
  return counts;
}
