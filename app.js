const state = {
  data: null,
  selectedSchools: new Set(),
  selectedDirection: null,
  includeRelated: false,
};

async function loadData() {
  const res = await fetch('data.json');
  state.data = await res.json();
}

function renderSchoolList() {
  const container = document.getElementById('school-list');
  container.innerHTML = state.data.schools.map(s => `
    <label>
      <input type="checkbox" value="${s.id}" data-school />
      <span>${s.name_zh} <small style="color:#9ca3af">${s.short}</small></span>
    </label>
  `).join('');
  container.querySelectorAll('[data-school]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) state.selectedSchools.add(cb.value);
      else state.selectedSchools.delete(cb.value);
    });
  });
}

function renderDirectionSelect() {
  const select = document.getElementById('direction-select');
  select.innerHTML = '<option value="">— 请选择 —</option>' +
    state.data.directions.map(d =>
      `<option value="${d.id}">${d.name_zh}</option>`
    ).join('');
  select.addEventListener('change', () => {
    state.selectedDirection = select.value || null;
  });
}

function filterPrograms() {
  if (state.selectedSchools.size === 0 || !state.selectedDirection) return [];

  const direction = state.data.directions.find(d => d.id === state.selectedDirection);
  const allowedDirections = new Set([state.selectedDirection]);
  if (state.includeRelated && direction?.related) {
    direction.related.forEach(r => allowedDirections.add(r));
  }

  return state.data.programs.filter(p =>
    state.selectedSchools.has(p.school_id) &&
    allowedDirections.has(p.direction_id)
  );
}

function schoolName(id) {
  return state.data.schools.find(s => s.id === id)?.name_zh || id;
}

function directionName(id) {
  return state.data.directions.find(d => d.id === id)?.name_zh || id;
}

function fmtTuition(hkd) {
  return `HK$ ${hkd.toLocaleString()}`;
}

function renderTable(programs) {
  const summary = document.getElementById('results-summary');
  const tableEl = document.getElementById('results-table');
  const emptyEl = document.getElementById('results-empty');

  if (programs.length === 0) {
    tableEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    summary.textContent = '';
    return;
  }
  emptyEl.classList.add('hidden');
  summary.textContent = `共匹配到 ${programs.length} 个项目`;

  const rows = [
    {
      label: '项目',
      render: p => `
        <div class="school-tag">${schoolName(p.school_id)} · ${directionName(p.direction_id)}</div>
        <div class="program-name">${p.name_zh}</div>
        <div class="program-name-en">${p.name_en}</div>
        <a class="official-link" href="${p.official_url}" target="_blank" rel="noopener">查看官网 ↗</a>
      `,
    },
    { label: '学制',       render: p => p.duration },
    { label: '学费',       render: p => fmtTuition(p.tuition_hkd) },
    { label: '雅思',       render: p => p.ielts },
    { label: '托福',       render: p => p.toefl },
    { label: 'GMAT/GRE',   render: p => p.gmat_gre },
    { label: '背景要求',   render: p => p.background },
    {
      label: '核心课程',
      render: p => `<ul class="course-list">${p.core_courses.map(c => `<li>${c}</li>`).join('')}</ul>`,
    },
    {
      label: '选修课程',
      render: p => `<ul class="course-list">${p.elective_courses.map(c => `<li>${c}</li>`).join('')}</ul>`,
    },
    {
      label: '就业方向',
      render: p => `<div class="career-tags">${p.career_outcomes.map(c => `<span>${c}</span>`).join('')}</div>`,
    },
    {
      label: '数据更新',
      render: p => `<span style="color:#9ca3af;font-size:12px">${p.source_updated}</span>`,
    },
  ];

  const headHtml = `
    <tr>
      <th class="row-label">字段</th>
      ${programs.map(() => `<th class="program-header"></th>`).join('')}
    </tr>
  `;

  const bodyHtml = rows.map(r => `
    <tr>
      <th class="row-label">${r.label}</th>
      ${programs.map(p => `<td${r.label === '项目' ? ' class="program-header"' : ''}>${r.render(p)}</td>`).join('')}
    </tr>
  `).join('');

  tableEl.innerHTML = `<table class="compare"><thead>${headHtml}</thead><tbody>${bodyHtml}</tbody></table>`;
}

function applyFilters() {
  const programs = filterPrograms();
  renderTable(programs);
  syncStateToUrl();
}

function syncStateToUrl() {
  const params = new URLSearchParams();
  if (state.selectedSchools.size > 0) {
    params.set('schools', [...state.selectedSchools].join(','));
  }
  if (state.selectedDirection) {
    params.set('direction', state.selectedDirection);
  }
  if (state.includeRelated) {
    params.set('related', '1');
  }
  const qs = params.toString();
  const url = qs ? `${location.pathname}?${qs}` : location.pathname;
  history.replaceState(null, '', url);
}

function restoreStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const schools = params.get('schools');
  const direction = params.get('direction');
  const related = params.get('related') === '1';

  if (schools) {
    schools.split(',').filter(Boolean).forEach(id => {
      const cb = document.querySelector(`[data-school][value="${id}"]`);
      if (cb) { cb.checked = true; state.selectedSchools.add(id); }
    });
  }
  if (direction) {
    const select = document.getElementById('direction-select');
    if ([...select.options].some(o => o.value === direction)) {
      select.value = direction;
      state.selectedDirection = direction;
    }
  }
  if (related) {
    document.getElementById('include-related').checked = true;
    state.includeRelated = true;
  }

  if (state.selectedSchools.size > 0 && state.selectedDirection) {
    applyFilters();
  }
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 1800);
}

async function copyShareLink() {
  syncStateToUrl();
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    showToast('链接已复制');
  } catch {
    showToast('复制失败，请手动复制地址栏');
  }
}

function resetFilters() {
  state.selectedSchools.clear();
  state.selectedDirection = null;
  state.includeRelated = false;
  document.querySelectorAll('[data-school]').forEach(cb => cb.checked = false);
  document.getElementById('direction-select').value = '';
  document.getElementById('include-related').checked = false;
  document.getElementById('results-summary').textContent = '';
  document.getElementById('results-table').innerHTML = '';
  document.getElementById('results-empty').classList.add('hidden');
  history.replaceState(null, '', location.pathname);
}

async function init() {
  await loadData();
  renderSchoolList();
  renderDirectionSelect();

  document.getElementById('include-related').addEventListener('change', e => {
    state.includeRelated = e.target.checked;
  });
  document.getElementById('btn-apply').addEventListener('click', applyFilters);
  document.getElementById('btn-reset').addEventListener('click', resetFilters);
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-share').addEventListener('click', copyShareLink);

  restoreStateFromUrl();
}

init();
