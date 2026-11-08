// QaReport — scelta del piano di rilascio e della categoria, prima del report vero e proprio.
//
// Indirizzi (la scelta sta nella query, il report resta negli indirizzi con "#"):
//   ?                       i piani di rilascio
//   ?plan=<piano>           le categorie del piano
//   ?plan=<piano>&cat=<c>   il report di quel piano e categoria (app.js)
// Un indirizzo vecchio, senza piano (#/run/<id>/test/<chiave>), porta alla sua categoria: i link
// già scritti nelle issue continuano ad aprirsi.
(function () {
  'use strict';

  const QA = window.QA;
  const root = QA.plans;
  const app = document.getElementById('app');
  const crumbs = document.getElementById('scope-nav');
  const query = new URLSearchParams(location.search);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = s => { if (!s) return '—'; const d = new Date(s); return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleDateString('it-IT'); };
  const planBySlug = slug => root.plans.find(p => p.slug === slug);
  const planName = p => p.title || `Piano ${p.id}`;

  function setCrumbs(items) {
    crumbs.innerHTML = items.map(i => i.href ? `<a href="${esc(i.href)}">${esc(i.label)}</a>` : `<span aria-current="page">${esc(i.label)}</span>`)
      .join('<span class="scope-sep" aria-hidden="true">›</span>');
    crumbs.hidden = false;
  }

  if (QA.scope) {
    const plan = planBySlug(QA.scope.plan);
    const cat = plan && plan.categories.find(c => c.slug === QA.scope.cat);
    if (!QA.index || !cat) { location.replace(location.pathname + (plan ? `?plan=${plan.slug}` : '')); return; }
    setCrumbs([{ label: 'Piani', href: '?' }, { label: planName(plan), href: `?plan=${plan.slug}` }, { label: cat.label }]);
    return;
  }

  // ------------------------------------------------------------------ pagina di scelta

  QA.pickerMode = true;
  document.getElementById('topnav').style.display = 'none';
  document.querySelector('.run-picker').style.display = 'none';

  const loadIndex = (plan, cat) => new Promise(resolve => {
    const s = document.createElement('script');
    s.src = `data/scopes/${plan}/${cat}/index.js`;
    s.onload = () => resolve(QA.index);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });

  /** Un link senza piano: trova la categoria in cui il test stava in quell'esecuzione. */
  async function followOldLink() {
    const m = location.hash.match(/^#\/run\/([^/?]+)(?:\/test\/([^?]*))?/);
    const where = m && root.runScopes[decodeURIComponent(m[1])];
    if (!where || !where.categories.length) return false;
    const go = cat => { location.replace(`?plan=${where.plan}&cat=${cat}${location.hash}`); return true; };
    if (m[2]) {
      const key = decodeURIComponent(m[2]);
      const renamed = (root.renames || {})[key];
      for (const cat of where.categories) {
        const index = await loadIndex(where.plan, cat);
        const test = index && (index.tests[key] || index.tests[renamed]);
        const at = index ? index.runs.findIndex(r => r.id === decodeURIComponent(m[1])) : -1;
        if (test && at >= 0 && test.st[at] !== '-') return go(cat);
      }
    }
    return go(where.categories[0]);
  }

  function head(title, sub) {
    return `<div class="page-head"><div><h1 class="page-title">${esc(title)}</h1><div class="page-sub">${esc(sub)}</div></div></div>`;
  }

  function renderPlans() {
    crumbs.hidden = true;
    const card = p => {
      const range = p.versions.length > 1 ? `${p.versions[0]} – ${p.versions[p.versions.length - 1]}` : (p.versions[0] || '');
      const body = `<span class="scope-title">${esc(planName(p))}</span>
        ${p.state || p.due ? `<span class="scope-meta">${esc([p.state, p.due && 'scadenza ' + date(p.due)].filter(Boolean).join(' · '))}</span>` : ''}
        ${range ? `<span class="scope-meta mono">${esc(range)}</span>` : ''}
        <span class="scope-meta">${p.runs ? `${p.runs} esecuzion${p.runs === 1 ? 'e' : 'i'} · ultima il ${esc(date(p.last))}` : 'Nessuna esecuzione'}</span>`;
      return p.runs ? `<a class="card scope-card" href="?plan=${esc(p.slug)}">${body}</a>` : `<div class="card scope-card is-empty">${body}</div>`;
    };
    app.innerHTML = head('Piani di rilascio', 'Scegli il piano da leggere.') + `<div class="scope-grid">${root.plans.map(card).join('')}</div>`;
  }

  function renderCategories(plan) {
    setCrumbs([{ label: 'Piani', href: '?' }, { label: planName(plan) }]);
    const card = c => {
      if (!c.runs) return `<div class="card scope-card is-empty"><span class="scope-title">${esc(c.label)}</span><span class="scope-meta">Nessun test in questa categoria</span></div>`;
      const n = c.counts;
      const regressions = c.diff.baselineRunId ? `<span class="count ${c.diff.regressions ? 'reg' : 'zero'}">${c.diff.regressions}</span> possibili regressioni` : '';
      return `<a class="card scope-card" href="?plan=${esc(plan.slug)}&cat=${esc(c.slug)}">
        <span class="scope-title">${esc(c.label)}</span>
        <span class="scope-meta">${n.passed} superati su ${n.total}${n.failed ? ` · ${n.failed} falliti` : ''}${n.blocked ? ` · ${n.blocked} bloccati` : ''}</span>
        ${regressions ? `<span class="scope-meta">${regressions}</span>` : ''}
        <span class="scope-meta">${c.runs} esecuzion${c.runs === 1 ? 'e' : 'i'} · ultima il ${esc(date(c.lastStart))} · <span class="mono">${esc(c.lastVersion)}</span></span>
      </a>`;
    };
    app.innerHTML = head(planName(plan), 'Scegli la categoria da leggere.') + `<div class="scope-grid">${plan.categories.map(card).join('')}</div>`;
  }

  QA.renderPicker = async function () {
    if (await followOldLink()) return;
    document.getElementById('brand-sub').textContent = `${root.plans.length} pian${root.plans.length === 1 ? 'o' : 'i'}${root.masked ? ' · segreti mascherati' : ''}`;
    const plan = planBySlug(query.get('plan'));
    if (plan) renderCategories(plan); else renderPlans();
  };
})();
