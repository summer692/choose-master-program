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

function schoolById(id) { return state.data.schools.find(s => s.id === id); }
function directionById(id) { return state.data.directions.find(d => d.id === id); }
function schoolName(id) { return schoolById(id)?.name_zh || id; }
function directionName(id) { return directionById(id)?.name_zh || id; }
function fmtTuition(hkd) { return `HK$ ${hkd.toLocaleString()}`; }

/* -------- Filter UI: pill groups -------- */

function renderSchoolPills() {
  const container = document.getElementById('school-pills');
  container.innerHTML = state.data.schools.map(s => `
    <button class="pill" data-school="${s.id}">
      ${s.name_zh}<span class="pill-meta">${s.short}</span>
    </button>
  `).join('');
  container.querySelectorAll('[data-school]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.school;
      if (state.selectedSchools.has(id)) {
        state.selectedSchools.delete(id);
        btn.classList.remove('active');
      } else {
        state.selectedSchools.add(id);
        btn.classList.add('active');
      }
      onFilterChange();
    });
  });
}

function renderDirectionPills() {
  const container = document.getElementById('direction-pills');
  container.innerHTML = state.data.directions.map(d => `
    <button class="pill" data-direction="${d.id}">${d.name_zh}</button>
  `).join('');
  container.querySelectorAll('[data-direction]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.direction;
      container.querySelectorAll('[data-direction]').forEach(b => b.classList.remove('active'));
      if (state.selectedDirection === id) {
        state.selectedDirection = null;
      } else {
        state.selectedDirection = id;
        btn.classList.add('active');
      }
      onFilterChange();
    });
  });
}

/* -------- Filtering -------- */

function filterPrograms() {
  if (state.selectedSchools.size === 0 || !state.selectedDirection) return [];
  const direction = directionById(state.selectedDirection);
  const allowed = new Set([state.selectedDirection]);
  if (state.includeRelated && direction?.related) {
    direction.related.forEach(r => allowed.add(r));
  }
  return state.data.programs.filter(p =>
    state.selectedSchools.has(p.school_id) && allowed.has(p.direction_id)
  );
}

/* -------- Compare table render (Apple Compare style) -------- */

const SECTIONS = [
  {
    title: '概览',
    rows: [
      {
        label: '专业介绍及特点',
        render: p => `<div class="intro-text">${p.intro || '—'}</div>`,
      },
      { label: '学制', render: p => p.duration },
      {
        label: '学费',
        render: p => `<div class="tuition-big">${fmtTuition(p.tuition_hkd)}</div>`,
      },
    ],
  },
  {
    title: '课程',
    rows: [
      {
        label: '核心课程',
        render: p => `<ul class="course-list">${p.core_courses.map(c => `<li>${c}</li>`).join('')}</ul>`,
      },
      {
        label: '选修课程',
        render: p => `<ul class="course-list">${(p.elective_courses || []).map(c => `<li>${c}</li>`).join('')}</ul>`,
      },
    ],
  },
  {
    title: '申请要求',
    rows: [
      { label: '雅思',         render: p => p.ielts },
      { label: '托福',         render: p => p.toefl },
      { label: '四六级',       render: p => p.cet || '—' },
      { label: 'GMAT / GRE',   render: p => p.gmat_gre },
      { label: '申请背景要求', render: p => p.background },
      { label: '工作经验要求', render: p => p.work_experience || '—' },
      { label: '申请截止时间', render: p => p.deadline || '—' },
    ],
  },
  {
    title: '就业',
    rows: [
      {
        label: '就业方向',
        render: p => `<div class="career-tags">${(p.career_outcomes || []).map(c => `<span>${c}</span>`).join('')}</div>`,
      },
    ],
  },
];

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
  summary.textContent = `匹配到 ${programs.length} 个项目`;

  const totalCols = programs.length + 1;
  const colgroup = `
    <colgroup>
      <col class="col-label">
      ${programs.map(() => '<col class="col-program">').join('')}
    </colgroup>
  `;

  const headHtml = `
    <thead>
      <tr>
        <th class="col-label-head"></th>
        ${programs.map(p => `
          <th>
            <div class="program-header-card">
              <div class="program-monogram">${schoolById(p.school_id)?.short || ''} · ${directionName(p.direction_id)}</div>
              <div class="program-name">${p.name_zh}</div>
              <div class="program-name-en">${p.name_en}</div>
              <a class="official-link" href="${p.official_url}" target="_blank" rel="noopener">查看官网 →</a>
            </div>
          </th>
        `).join('')}
      </tr>
    </thead>
  `;

  const bodyHtml = SECTIONS.map(section => {
    const sectionRow = `
      <tr class="section-row">
        <td colspan="${totalCols}">${section.title}</td>
      </tr>
    `;
    const rowsHtml = section.rows.map(r => `
      <tr>
        <td class="row-label">${r.label}</td>
        ${programs.map(p => `<td>${r.render(p)}</td>`).join('')}
      </tr>
    `).join('');
    return sectionRow + rowsHtml;
  }).join('');

  const metaRow = `
    <tr>
      <td class="row-label">数据更新</td>
      ${programs.map(p => `<td><span class="meta-text">${p.source_updated}</span></td>`).join('')}
    </tr>
  `;

  tableEl.innerHTML = `
    <table class="compare">
      ${colgroup}
      ${headHtml}
      <tbody>${bodyHtml}${metaRow}</tbody>
    </table>
  `;
}

/* -------- State sync (URL + apply) -------- */

function onFilterChange() {
  renderTable(filterPrograms());
  syncStateToUrl();
}

function syncStateToUrl() {
  const params = new URLSearchParams();
  if (state.selectedSchools.size > 0) params.set('schools', [...state.selectedSchools].join(','));
  if (state.selectedDirection) params.set('direction', state.selectedDirection);
  if (state.includeRelated) params.set('related', '1');
  const qs = params.toString();
  history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}

function restoreStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const schools = params.get('schools');
  const direction = params.get('direction');
  const related = params.get('related') === '1';

  if (schools) {
    schools.split(',').filter(Boolean).forEach(id => {
      const btn = document.querySelector(`[data-school="${id}"]`);
      if (btn) { btn.classList.add('active'); state.selectedSchools.add(id); }
    });
  }
  if (direction) {
    const btn = document.querySelector(`[data-direction="${direction}"]`);
    if (btn) { btn.classList.add('active'); state.selectedDirection = direction; }
  }
  if (related) {
    document.getElementById('include-related').checked = true;
    state.includeRelated = true;
  }
  if (state.selectedSchools.size > 0 && state.selectedDirection) {
    renderTable(filterPrograms());
  }
}

function resetFilters() {
  state.selectedSchools.clear();
  state.selectedDirection = null;
  state.includeRelated = false;
  document.querySelectorAll('.pill.active').forEach(b => b.classList.remove('active'));
  document.getElementById('include-related').checked = false;
  document.getElementById('results-summary').textContent = '';
  document.getElementById('results-table').innerHTML = '';
  document.getElementById('results-empty').classList.remove('hidden');
  history.replaceState(null, '', location.pathname);
}

/* -------- Share / Toast -------- */

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
  try {
    await navigator.clipboard.writeText(location.href);
    showToast('链接已复制');
  } catch {
    showToast('复制失败，请手动复制地址栏');
  }
}

/* -------- Init -------- */

async function init() {
  await loadData();
  renderSchoolPills();
  renderDirectionPills();

  document.getElementById('include-related').addEventListener('change', e => {
    state.includeRelated = e.target.checked;
    onFilterChange();
  });
  document.getElementById('btn-reset').addEventListener('click', resetFilters);
  document.getElementById('btn-print').addEventListener('click', () => window.print());
  document.getElementById('btn-share').addEventListener('click', copyShareLink);

  restoreStateFromUrl();
}

init();
