// QaReport — pagina del report (JavaScript semplice, nessuna libreria).
//
// Dati: data/index.js imposta QA.index (esecuzioni, build, storico per test); il dettaglio di
// un'esecuzione arriva da data/runs/<id>.js, caricato su richiesta, che chiama QA.load(id, dati).
// Indirizzi con "#" (funzionano anche aperti da file o da una cartella di rete):
//   #/                         panoramica (ultima esecuzione, confronto con la build precedente)
//   #/builds                   build del sistema: regressioni e fix per build
//   #/run/<id>[?f=…&q=…]       esplora un'esecuzione (albero dei test + riepilogo)
//   #/run/<id>/test/<chiave>   dettaglio di un test
(function () {
  'use strict';

  const QA = (window.QA = window.QA || {});
  const idx = QA.index;
  const app = document.getElementById('app');

  // ================================================================== utilità

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, d) { try { const v = sessionStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* storage non disponibile */ } },
  };
  const pad = n => String(n).padStart(2, '0');
  const dt = s => { if (!s) return '—'; const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const dateShort = s => { if (!s) return '—'; const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`; };
  const dtShort = s => { if (!s) return '—'; const d = new Date(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const time = s => { if (!s) return '—'; const d = new Date(s); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`; };
  const dur = ms => ms == null ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
  const pct = (a, b) => b ? (100 * a / b).toFixed(1).replace('.', ',') + '%' : '—';
  const safe = id => String(id).replace(/[^A-Za-z0-9_-]/g, '_');
  const suiteOf = t => (t.className || '').split('.').pop() || '(senza classe)';

  // Icone SVG disegnate qui (tratto, 24×24).
  const P = {
    ok: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/>',
    ko: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
    skip: '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
    chevDown: '<path d="M6 9l6 6 6-6"/>',
    chevRight: '<path d="M9 6l6 6-6 6"/>',
    chevLeft: '<path d="M15 6l-6 6 6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
    up: '<path d="M7 17L17 7M9 7h8v8"/>',
    down: '<path d="M7 7l10 10M17 9v8H9"/>',
    repeat: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M20 4v5h-5M4 20v-5h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    zig: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    bug: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M9 8a3 3 0 0 1 6 0M4 13h3M17 13h3M5 19l2.5-2M19 19l-2.5-2M5 7l2.5 2M19 7l-2.5 2"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
    server: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><path d="M8 7.5h.01M8 16.5h.01"/>',
    db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
    pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
    stop: '<path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M9 12h6"/>',
    route: '<path d="M6 19V9a4 4 0 0 1 4-4h8"/><path d="M15 2l3 3-3 3"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
    grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    expand: '<path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4"/>',
    clip: '<path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.6 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7"/>',
    collapse: '<path d="M4 9h5V4M20 9h-5V4M4 15h5v5M20 15h-5v5"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-9 8.5"/>',
  };
  const ic = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
  const statusIcon = s => s === 'passed' ? ic('ok', 's-passed') : s === 'failed' ? ic('ko', 's-failed') : ic('skip', 's-' + s);
  const statusLabel = s => ({ passed: 'Superato', failed: 'Fallito', skipped: 'Saltato', inconclusive: 'Inconcludente' }[s] || s);

  // Cambiamenti rispetto alla build precedente.
  const CHANGES = {
    regression: { label: 'Regressione', plural: 'Regressioni', cls: 'c-reg', icon: 'up', count: 'reg' },
    fixed: { label: 'Corretto', plural: 'Corretti', cls: 'c-fix', icon: 'check', count: 'fix' },
    'still-failing': { label: 'Ancora fallito', plural: 'Ancora falliti', cls: 'c-still', icon: 'repeat', count: 'still' },
    new: { label: 'Nuovo', plural: 'Nuovi', cls: 'c-new', icon: 'plus', count: 'new' },
    flaky: { label: 'Instabile', plural: 'Instabili', cls: 'c-flaky', icon: 'zig', count: 'flaky' },
  };
  const changeBadge = c => {
    if (!c) return '';
    let s = '';
    const m = CHANGES[c.change];   // "stable" e "none" non hanno etichetta
    if (m) s += `<span class="badge ${m.cls}">${ic(m.icon)}${m.label}</span>`;
    if (c.flaky) s += `<span class="badge c-flaky">${ic('zig')}Instabile</span>`;
    return s;
  };

  function toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  // ================================================================== JSON e codice

  function tryJson(text) {
    const t = String(text).trim();
    if (t.length < 2 || !((t[0] === '{' && t.endsWith('}')) || (t[0] === '[' && t.endsWith(']')))) return null;
    try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return null; }
  }
  function highlight(json) {
    const re = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;
    let out = '', last = 0, m;
    while ((m = re.exec(json))) {
      out += esc(json.slice(last, m.index));
      if (m[1]) out += `<span class="${m[2] ? 'j-key' : 'j-str'}">${esc(m[1])}</span>${m[2] ? esc(m[2]) : ''}`;
      else out += `<span class="${m[3] ? 'j-lit' : 'j-num'}">${esc(m[0])}</span>`;
      last = re.lastIndex;
    }
    return out + esc(json.slice(last));
  }
  /** Testo con l'eventuale JSON (anche in coda: "500 Errore · {…}") indentato e colorato. */
  function renderText(text) {
    if (text == null) return '';
    const whole = tryJson(text);
    if (whole) return highlight(whole);
    for (const sep of [' · {', ' · [', ': {', ': [']) {
      const i = text.indexOf(sep);
      if (i >= 0) {
        const tail = tryJson(text.slice(i + sep.length - 1));
        if (tail) return esc(text.slice(0, i)) + '\n' + highlight(tail);
      }
    }
    return esc(text);
  }
  const code = (text, { label, tone, plain } = {}) =>
    `<div class="code ${tone || ''}">${label ? `<div class="code-label">${esc(label)}</div>` : ''}<button type="button" class="copy" title="Copia" aria-label="Copia">${ic('copy')}</button><pre>${plain ? esc(text) : renderText(text)}</pre></div>`;

  // ================================================================== dati delle esecuzioni

  const runs = idx ? idx.runs : [];
  const runById = id => runs.find(r => r.id === id);
  const latest = () => runs[runs.length - 1];
  const cache = {};
  const waiting = {};
  QA.load = (id, data) => {
    // Indici per il report: per chiave, gruppi di azioni.
    data.byKey = {};
    data.tests.forEach((x, i) => { x.i = i; data.byKey[x.test.key] = x; });
    cache[id] = data;
    (waiting[id] || []).forEach(f => f(data));
    delete waiting[id];
  };
  function loadRun(id) {
    if (cache[id]) return Promise.resolve(cache[id]);
    return new Promise((resolve, reject) => {
      (waiting[id] = waiting[id] || []).push(resolve);
      if (waiting[id].length > 1) return;
      const s = document.createElement('script');
      s.src = `data/runs/${safe(id)}.js`;
      s.onerror = () => reject(new Error('Dati dell\'esecuzione non trovati: ' + id));
      document.head.appendChild(s);
    });
  }

  // ================================================================== intestazione

  function initChrome() {
    document.getElementById('brand-title').textContent = idx.title || 'Report dei test';
    document.title = idx.title || 'Report dei test';
    document.getElementById('brand-sub').textContent =
      `${runs.length} esecuzion${runs.length === 1 ? 'e' : 'i'}${idx.masked ? ' · segreti mascherati' : ''}`;
    document.getElementById('brand-sub').title = 'Report generato il ' + dt(idx.generated);
    const picker = document.getElementById('run-picker');
    picker.innerHTML = runs.slice().reverse().map(r =>
      `<option value="${esc(r.id)}">${esc(dtShort(r.start))} · ${esc(r.build)} · ${r.counts.passed}/${r.counts.total}</option>`).join('');
    picker.addEventListener('change', () => { location.hash = `#/run/${encodeURIComponent(picker.value)}`; });
    const themeBtn = document.getElementById('theme-btn');
    const paintTheme = () => {
      const dark = document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      themeBtn.innerHTML = ic(dark ? 'sun' : 'moon');
    };
    themeBtn.addEventListener('click', () => {
      const dark = document.documentElement.dataset.theme === 'dark' ||
        (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.dataset.theme = dark ? 'light' : 'dark';
      try { localStorage.setItem('qa:theme', document.documentElement.dataset.theme); } catch { /* niente */ }
      paintTheme();
    });
    paintTheme();
  }

  function setNav(name, runId) {
    document.querySelectorAll('#topnav a').forEach(a => a.classList.toggle('active', a.dataset.nav === name));
    const runLink = document.querySelector('#topnav a[data-nav="run"]');
    runLink.href = `#/run/${encodeURIComponent(runId || latest().id)}`;
    document.getElementById('run-picker').value = runId || latest().id;
  }

  // ================================================================== componenti

  function donut(c) {
    const p1 = c.total ? 100 * c.passed / c.total : 0;
    const p2 = c.total ? 100 * (c.passed + c.failed) / c.total : 0;
    return `<div class="donut" style="--p1:${p1}%;--p2:${p2}%" role="img" aria-label="${c.passed} superati, ${c.failed} falliti su ${c.total}">
      <div class="donut-hole"><span class="donut-value">${pct(c.passed, c.total)}</span><span class="donut-label">superati</span></div></div>`;
  }

  function hero(run, linkBase) {
    const c = run.counts, ok = c.failed === 0;
    const sut = run.sut || {};
    const meta = [
      ['Build', run.build], ['Versione', sut.version], ['Commit', sut.commit && (sut.commit + (sut.branch ? '@' + sut.branch : ''))],
      ['Ambiente', sut.environment], ['Inizio', dt(run.start)], ['Durata', dur(run.durationMs)], ['Macchina', run.machine],
    ].filter(x => x[1]);
    return `<section class="card hero">
      ${donut(c)}
      <div class="break">
        <div class="hero-title ${ok ? 'ok' : 'ko'}">${ic(ok ? 'ok' : 'ko')}${ok ? 'Tutti i test superati' : `${c.failed} test falliti su ${c.total}`}</div>
        <div class="hero-meta">${meta.map(([k, v]) => `<span>${k} <b class="${k === 'Commit' || k === 'Build' ? 'mono' : ''}">${esc(v)}</b></span>`).join('')}</div>
        <div class="stats">
          <a class="stat" href="${linkBase}"><b>${c.total}</b><span>totali</span></a>
          <a class="stat ok" href="${linkBase}?f=passed"><b>${c.passed}</b><span>superati</span></a>
          <a class="stat ko" href="${linkBase}?f=failed"><b>${c.failed}</b><span>falliti</span></a>
          <div class="stat"><b>${c.defects}</b><span>difetti noti</span></div>
        </div>
      </div>
    </section>`;
  }

  function diffCard(run, linkBase) {
    const d = run.diff;
    if (!d.baselineRunId) {
      return `<section class="card"><h2 class="card-h">${ic('layers')}Confronto con la build precedente</h2>
        <div class="empty">Prima build del sistema nello storico: nessun confronto possibile. Dalla prossima build compariranno regressioni e fix.</div></section>`;
    }
    const base = runById(d.baselineRunId);
    const tile = (key, n) => {
      const m = CHANGES[key];
      return `<a class="tile ${m.cls} ${n ? '' : 'zero'}" href="${linkBase}?f=${key}"><b>${n}</b><span>${m.plural}</span></a>`;
    };
    return `<section class="card"><h2 class="card-h">${ic('layers')}Confronto con la build precedente</h2>
      <div class="diff-head">Build <b class="mono">${esc(run.build)}</b> rispetto a <b class="mono">${esc(d.baselineBuild)}</b>
        <span>(esecuzione del ${esc(dtShort(base && base.start))})</span>${d.removed ? `<span>· ${d.removed} test non più presenti</span>` : ''}</div>
      <div class="diff-tiles">${tile('regression', d.regressions)}${tile('fixed', d.fixed)}${tile('still-failing', d.stillFailing)}${tile('new', d.new)}${tile('flaky', d.flaky)}</div>
    </section>`;
  }

  /**
   * Istogramma delle esecuzioni: qui solo il segnaposto; lo disegna paintTrends alla larghezza
   * reale del contenitore (niente SVG stirato: testi e barre restano proporzionati).
   */
  const trends = [];
  function trendChart(list, currentId) {
    if (list.length === 0) return '<div class="empty">Nessuna esecuzione nel periodo scelto.</div>';
    trends.push({ list, currentId });
    return `<div class="trend" data-trend="${trends.length - 1}"></div>
      <div class="legend"><span><i style="background:var(--ok)"></i>Superati</span><span><i style="background:var(--ko)"></i>Falliti</span>
      <span><i style="background:var(--ko);border-radius:50%"></i>Build con regressioni</span><span><i style="background:var(--ok);border-radius:50%"></i>Build con fix</span>
      <span><i style="background:var(--surface-3)"></i>Fasce: build del sistema</span></div>`;
  }
  function paintTrends() {
    document.querySelectorAll('[data-trend]').forEach(el => {
      const t = trends[+el.dataset.trend];
      const W = Math.max(260, Math.floor(el.clientWidth));
      if (t && el.dataset.w !== String(W)) { el.dataset.w = W; el.innerHTML = trendSvg(t.list, t.currentId, W); }
    });
  }
  let resizeTimer = 0;
  const repaintSoon = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(paintTrends, 120); };
  window.addEventListener('resize', repaintSoon);
  // Anche quando cambia la larghezza del contenuto senza un resize della finestra (pannelli, zoom, iframe).
  if (window.ResizeObserver) new ResizeObserver(repaintSoon).observe(document.getElementById('app'));

  /** Istogramma delle esecuzioni, raggruppate per build del sistema (fasce alterne). */
  function trendSvg(list, currentId, W) {
    const H = 220, top = 38, bottom = 30, left = 34;
    const max = Math.max(1, ...list.map(r => r.counts.total));
    const n = list.length, slot = (W - left) / n, bw = Math.max(3, Math.min(34, slot * 0.62));
    const y = v => top + (H - top - bottom) * (1 - v / max);
    let bands = '', labels = '', cols = '', marks = '';
    // Fasce alterne: una per ogni gruppo di esecuzioni consecutive sulla stessa build.
    for (let i = 0, g = 0; i < n; g++) {
      let j = i;
      while (j + 1 < n && list[j + 1].build === list[i].build) j++;
      const x0 = left + i * slot, x1 = left + (j + 1) * slot;
      if (g % 2 === 0) bands += `<rect class="band" x="${x0}" y="${top - 34}" width="${x1 - x0}" height="${H - top - bottom + 34}" rx="6"/>`;
      const label = list[i].build.length > 16 ? list[i].build.slice(0, 15) + '…' : list[i].build;
      labels += `<text class="build-label" x="${(x0 + x1) / 2}" y="${top - 22}" text-anchor="middle"><title>${esc(list[i].build)}</title>${esc(x1 - x0 > 44 ? label : '')}</text>`;
      i = j + 1;
    }
    list.forEach((r, k) => {
      const cx = left + k * slot + slot / 2, x = cx - bw / 2, c = r.counts;
      const yOk = y(c.passed), yKo = y(c.passed + c.failed), ySkip = y(c.total);
      const tip = `${dt(r.start)} · build ${r.build}\n${c.passed} superati, ${c.failed} falliti su ${c.total}` +
        (r.diff.baselineRunId ? `\n${r.diff.regressions} regressioni, ${r.diff.fixed} corretti` : '');
      cols += `<a class="col ${r.id === currentId ? 'current' : ''}" href="#/run/${encodeURIComponent(r.id)}"><title>${esc(tip)}</title>
        <rect class="bar-ok" x="${x}" y="${yOk}" width="${bw}" height="${Math.max(0, y(0) - yOk)}" rx="2"/>
        <rect class="bar-ko" x="${x}" y="${yKo}" width="${bw}" height="${Math.max(0, yOk - yKo)}"/>
        <rect class="bar-skip" x="${x}" y="${ySkip}" width="${bw}" height="${Math.max(0, yKo - ySkip)}"/>
        <rect class="outline" x="${x - 2}" y="${ySkip - 2}" width="${bw + 4}" height="${y(0) - ySkip + 4}" rx="3" fill="none"/></a>`;
      if (r.diff.regressions) marks += `<circle class="mark-reg" cx="${cx}" cy="${ySkip - 7}" r="3.5"><title>${r.diff.regressions} regressioni</title></circle>`;
      else if (r.diff.fixed) marks += `<circle class="mark-fix" cx="${cx}" cy="${ySkip - 7}" r="3.5"><title>${r.diff.fixed} corretti</title></circle>`;
    });
    const grid = [0, 0.5, 1].map(f => { const v = Math.round(max * f); return `<line class="grid-line" x1="${left}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${left - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`; }).join('');
    // Date sotto le barre (dd/MM/yy), diradate quando non c'è spazio (~60 px per etichetta).
    const every = Math.max(1, Math.ceil(60 / slot));
    const xl = list.map((r, k) => k % every === 0 ? `<text class="axis" x="${left + k * slot + slot / 2}" y="${H - 12}" text-anchor="middle">${esc(dateShort(r.start))}</text>` : '').join('');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Esito delle esecuzioni per build">${bands}${grid}${cols}${marks}${labels}${xl}</svg>`;
  }

  // ------------------------------------------------------------------ periodo

  /** Periodi per le build: uno sprint canonico dura 2 settimane. */
  const PERIODS = [['sprint', 'Ultimo sprint', 14], ['month', 'Ultimo mese', 30], ['year', 'Ultimo anno', 365], ['all', 'Massimo', 0]];
  const currentPeriod = () => { const p = store.get('qa:period', 'sprint'); return PERIODS.some(x => x[0] === p) ? p : 'sprint'; };
  const periodRuns = () => {
    const days = PERIODS.find(x => x[0] === currentPeriod())[2];
    if (!days) return runs;
    const from = Date.now() - days * 864e5;
    return runs.filter(r => new Date(r.start).getTime() >= from);
  };
  const periodLabel = () => PERIODS.find(x => x[0] === currentPeriod())[1].toLowerCase();
  const periodPicker = () => `<div class="period" role="group" aria-label="Periodo">${PERIODS.map(([k, l, d]) =>
    `<button type="button" class="period-btn ${k === currentPeriod() ? 'active' : ''}" data-period="${k}" ${d ? `title="Ultimi ${d} giorni"` : 'title="Tutto lo storico"'} aria-pressed="${k === currentPeriod()}">${l}</button>`).join('')}</div>`;

  function buildRows(limit, inPeriod) {
    // Una riga per build: stato all'ultima esecuzione di quella build (solo build con esecuzioni nel periodo).
    const ids = new Set((inPeriod || runs).map(r => r.id));
    const list = idx.builds.filter(b => b.runs.some(id => ids.has(id)));
    if (!list.length) return '<div class="empty">Nessuna build nel periodo scelto.</div>';
    const rows = list.slice().reverse().slice(0, limit || Infinity).map(b => {
      const last = runById(b.runs[b.runs.length - 1]);
      const first = runById(b.runs[0]);
      const d = last.diff;
      const cnt = (n, cls) => `<span class="count ${n ? cls : 'zero'}">${d.baselineRunId ? n : '—'}</span>`;
      return `<tr>
        <td><a class="mono" href="#/run/${encodeURIComponent(last.id)}">${esc(b.build)}</a><div class="muted" style="font-size:12px">${esc(b.version || '')}</div></td>
        <td class="col-md">${esc(dateShort(first.start))} ${esc(dtShort(first.start).split(' ')[1])}${b.runs.length > 1 ? ` → ${esc(dateShort(last.start))} ${esc(dtShort(last.start).split(' ')[1])}` : ''}</td>
        <td class="num col-sm">${b.runs.length}</td>
        <td class="num"><span class="count ${last.counts.failed ? 'ko' : 'ok'}">${last.counts.passed}/${last.counts.total}</span></td>
        <td class="num">${cnt(d.regressions, 'reg')}</td>
        <td class="num">${cnt(d.fixed, 'fix')}</td>
        <td class="num col-xs">${cnt(d.stillFailing, 'still')}</td>
        <td class="num col-xs">${cnt(d.flaky, 'flaky')}</td>
      </tr>`;
    }).join('');
    return `<table class="table"><thead><tr><th>Build</th><th class="col-md">Esecuzioni (date)</th><th class="num col-sm">N.</th><th class="num">Superati</th>
      <th class="num">Regressioni</th><th class="num">Corretti</th><th class="num col-xs">Ancora falliti</th><th class="num col-xs">Instabili</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function runRows(limit, inPeriod) {
    const list = inPeriod || runs;
    if (!list.length) return '<div class="empty">Nessuna esecuzione nel periodo scelto.</div>';
    const rows = list.slice().reverse().slice(0, limit || Infinity).map(r => `<tr>
      <td>${statusIcon(r.counts.failed ? 'failed' : 'passed')} <a href="#/run/${encodeURIComponent(r.id)}">${esc(dt(r.start))}</a></td>
      <td class="mono col-sm break">${esc(r.build)}</td>
      <td class="num"><span class="count ok">${r.counts.passed}</span> <span class="count ${r.counts.failed ? 'ko' : 'zero'}">${r.counts.failed}</span> <span class="muted">/ ${r.counts.total}</span></td>
      <td class="num col-xs">${r.diff.baselineRunId ? `<span class="count ${r.diff.regressions ? 'reg' : 'zero'}">${r.diff.regressions}</span>` : '—'}</td>
      <td class="num col-md">${esc(dur(r.durationMs))}</td></tr>`).join('');
    return `<table class="table"><thead><tr><th>Esecuzione</th><th class="col-sm">Build</th><th class="num">Esito</th><th class="num col-xs">Regressioni</th><th class="num col-md">Durata</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ================================================================== pagine

  function renderHome() {
    const run = latest();
    setNav('home', run.id);
    const base = `#/run/${encodeURIComponent(run.id)}`;
    const inPeriod = periodRuns();
    trends.length = 0;
    app.innerHTML = `
      <div class="page-head"><div><h1 class="page-title">Panoramica</h1>
        <div class="page-sub">Ultima esecuzione del ${esc(dt(run.start))} sulla build <span class="mono">${esc(run.build)}</span></div></div>
        ${periodPicker()}</div>
      <div class="stack">
      ${hero(run, base)}
      ${diffCard(run, base)}
      <div id="home-changes"></div>
      <section class="card"><h2 class="card-h">${ic('layers')}Andamento per build del sistema<span class="note">${periodLabel()} · ${inPeriod.length} esecuzion${inPeriod.length === 1 ? 'e' : 'i'}</span></h2>${trendChart(inPeriod.slice(-60), run.id)}</section>
      <section class="card"><h2 class="card-h">${ic('layers')}Regressioni e fix per build<a class="note" href="#/builds">tutte le build</a></h2>${buildRows(8, inPeriod)}</section>
      <section class="card"><h2 class="card-h">${ic('history')}Esecuzioni<span class="note">${periodLabel()} · ultime 10</span></h2>${runRows(10, inPeriod)}</section>
      </div>`;
    paintTrends();
    if (run.diff.regressions || run.diff.fixed) {
      loadRun(run.id).then(data => {
        const el = document.getElementById('home-changes');
        if (!el) return;
        el.innerHTML = changeLists(data, run, ['regression', 'fixed'], 8);
      }).catch(() => { });
    }
  }

  function renderBuilds() {
    setNav('builds');
    const inPeriod = periodRuns();
    const nBuilds = new Set(inPeriod.map(r => r.build)).size;
    trends.length = 0;
    app.innerHTML = `
      <div class="page-head"><div><h1 class="page-title">Build del sistema</h1>
        <div class="page-sub">Per ogni build, l'ultima esecuzione confrontata con l'ultima della build precedente. Chi fa QA segna regressioni e fix; la correzione spetta ai dev.</div></div>
        ${periodPicker()}</div>
      <div class="stack">
      <section class="card"><h2 class="card-h">${ic('layers')}Andamento<span class="note">${periodLabel()} · ${inPeriod.length} esecuzion${inPeriod.length === 1 ? 'e' : 'i'}</span></h2>${trendChart(inPeriod, null)}</section>
      <section class="card"><h2 class="card-h">${ic('layers')}Regressioni e fix per build<span class="note">${periodLabel()} · ${nBuilds} build</span></h2>${buildRows(0, inPeriod)}</section>
      </div>`;
    paintTrends();
  }

  /** Elenchi dei test cambiati (regressioni, corretti, …) di un'esecuzione. */
  function changeLists(data, run, kinds, limit) {
    return kinds.map(kind => {
      const m = CHANGES[kind];
      const items = data.tests.filter(x => kind === 'flaky' ? x.change && x.change.flaky : x.change && x.change.change === kind);
      if (!items.length) return '';
      const shown = items.slice(0, limit || items.length);
      return `<section class="card"><h2 class="card-h ${m.cls}">${ic(m.icon)}${m.plural}<span class="note">${items.length}</span></h2>
        <div class="chg-list">${shown.map(x => {
          const t = x.test, c = x.change;
          const extra = kind === 'still-failing' && c.failingSinceBuild ? `fallisce dalla build ${c.failingSinceBuild}`
            : kind === 'regression' ? `passava sulla build ${run.diff.baselineBuild}` : kind === 'fixed' ? `falliva sulla build ${run.diff.baselineBuild}` : '';
          return `<a class="chg ${m.cls}" href="#/run/${encodeURIComponent(run.id)}/test/${encodeURIComponent(t.key)}">${statusIcon(t.status)}
            <span class="chg-main"><span class="chg-title">${esc(t.title)}</span>
            <span class="chg-meta">${esc(suiteOf(t))}${t.arguments ? ' · ' + esc(t.arguments) : ''}${extra ? ' · ' + esc(extra) : ''}${t.defect ? ' · ' + esc(t.defect.id) : ''}</span></span></a>`;
        }).join('')}${items.length > shown.length ? `<a class="link-btn" href="#/run/${encodeURIComponent(run.id)}?f=${kind}">tutti i ${items.length}</a>` : ''}</div></section>`;
    }).join('');
  }

  // ------------------------------------------------------------------ esploratore

  const FILTERS = [
    ['all', 'Tutti', x => true, ''],
    ['failed', 'Falliti', x => x.test.status === 'failed', 'var(--ko-text)'],
    ['passed', 'Superati', x => x.test.status === 'passed', 'var(--ok-text)'],
    ['regression', 'Regressioni', x => x.change && x.change.change === 'regression', 'var(--ko-text)'],
    ['fixed', 'Corretti', x => x.change && x.change.change === 'fixed', 'var(--ok-text)'],
    ['still-failing', 'Ancora falliti', x => x.change && x.change.change === 'still-failing', 'var(--warn-text)'],
    ['new', 'Nuovi', x => x.change && x.change.change === 'new', 'var(--info-text)'],
    ['flaky', 'Instabili', x => x.change && x.change.flaky, 'var(--flaky-text)'],
    ['defect', 'Difetti noti', x => !!x.test.defect, 'var(--flaky-text)'],
  ];
  const RANK = { regression: 0, 'still-failing': 1, new: 2 };

  async function renderRun(runId, testKey, params) {
    const run = runById(runId);
    if (!run) { app.innerHTML = `<div class="empty">Esecuzione non trovata: ${esc(runId)}. <a href="#/">Torna alla panoramica</a></div>`; return; }
    setNav('run', run.id);
    app.innerHTML = '<div class="loading">Caricamento dell\'esecuzione…</div>';
    let data;
    try { data = await loadRun(run.id); } catch (e) { app.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    const sel = testKey ? data.byKey[testKey] : null;

    const key = 'qa:tree:' + run.id;
    const state = Object.assign({ f: 'all', q: '', sort: 'status', size: 50, page: 1, collapsed: [] }, store.get(key, {}));
    if (params.has('f')) { state.f = params.get('f'); state.page = 1; }
    if (params.has('q')) { state.q = params.get('q'); state.page = 1; }

    const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, data.tests.filter(fn).length]));
    const suites = {};
    data.tests.forEach(x => (suites[suiteOf(x.test)] = suites[suiteOf(x.test)] || []).push(x));
    const suiteNames = Object.keys(suites).sort((a, b) => a.localeCompare(b, 'it'));

    const crumbs = `<div class="crumbs"><a href="#/">Panoramica</a>${ic('chevRight')}<a href="#/run/${encodeURIComponent(run.id)}">Esecuzione del ${esc(dtShort(run.start))}</a>${sel ? ic('chevRight') + esc(suiteOf(sel.test)) : ''}</div>`;
    app.innerHTML = `
      <div class="page-head"><div>${crumbs}<h1 class="page-title">Esecuzione del ${esc(dt(run.start))}</h1>
        <div class="page-sub">Build <span class="mono">${esc(run.build)}</span>${run.sut && run.sut.version ? ' · versione ' + esc(run.sut.version) : ''} · ${run.counts.passed}/${run.counts.total} superati · ${esc(dur(run.durationMs))}</div></div>
        <div class="page-actions">${runStepper(run, sel)}<span id="run-admin"></span></div></div>
      <div class="split ${sel ? 'has-test' : ''}">
        <aside class="tree" aria-label="Test">
          <div class="tree-tools">
            <label class="search">${ic('search')}<input type="search" id="q" placeholder="Cerca test, metodo, suite, difetto…" autocomplete="off" aria-label="Cerca" value="${esc(state.q)}"><kbd>/</kbd></label>
            <div class="chips" role="group" aria-label="Filtra">${FILTERS.filter(([k]) => ['all', 'failed', 'passed'].includes(k) || counts[k] > 0).map(([k, label, , color]) =>
              `<button type="button" class="chip" data-f="${k}" style="${color ? '--c-text:' + color : ''}">${label} <b>${counts[k]}</b></button>`).join('')}</div>
            <div class="tree-bar">
              <select id="sort" aria-label="Ordina"><option value="status">Prima regressioni e falliti</option><option value="name">Per nome</option><option value="duration">Più lenti prima</option></select>
              <button type="button" class="icon-btn" id="expand" title="Espandi le suite">${ic('expand')}</button>
              <button type="button" class="icon-btn" id="collapse" title="Comprimi le suite">${ic('collapse')}</button>
            </div>
          </div>
          <div class="tree-list" id="tree-list">
            ${suiteNames.map(sn => `<section class="suite" data-suite="${esc(sn)}">
              <button type="button" class="suite-h" aria-expanded="true">${ic('chevDown', 'chev')}<span class="suite-name">${esc(sn)}</span><span class="suite-counts"></span></button>
              <ul class="leaves">${suites[sn].map(x => leaf(run, x, sel)).join('')}</ul></section>`).join('')}
            <div class="empty" id="tree-empty" hidden>Nessun test corrisponde ai filtri.</div>
          </div>
          <nav class="pager" aria-label="Pagine">
            <span class="pager-range" id="range"></span>
            <select id="size" aria-label="Test per pagina"><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="0">tutti</option></select>
            <button type="button" class="icon-btn" id="prev" title="Precedente">${ic('chevLeft')}</button>
            <span class="pager-page" id="page"></span>
            <button type="button" class="icon-btn" id="next" title="Successiva">${ic('chevRight')}</button>
          </nav>
        </aside>
        <div class="detail" id="detail">${sel ? testDetail(run, data, sel) : runOverview(run, data)}</div>
      </div>`;

    initTree(run, data, state, key, sel);
    serverInfo.then(info => {
      const el = document.getElementById('run-admin');
      if (el && info && info.canDelete)
        el.innerHTML = `<button type="button" class="btn danger-ghost" data-delete-run="${esc(run.id)}" title="Elimina questa esecuzione dallo storico">${ic('trash')}Elimina</button>`;
    });
    const detailEl = document.getElementById('detail');
    if (sel) { initTabs(detailEl, 'qa:testtab', 'overview'); initTestNav(); }
    else {
      // ?tab=… e ?seg=… nell'indirizzo aprono una scheda e un elenco (link condivisibili).
      if (params.has('tab')) store.set('qa:ovtab', params.get('tab'));
      if (params.has('seg')) store.set('qa:seg', params.get('seg'));
      initTabs(detailEl, 'qa:ovtab', 'changes');
      initSegments(detailEl.querySelector('.overview'));
    }
    window.scrollTo(0, 0);
  }

  function leaf(run, x, sel) {
    const t = x.test, c = x.change || {};
    const search = [t.title, t.method, suiteOf(t), t.arguments, t.defect && t.defect.id, t.defect && t.defect.title, c.change].join(' ').toLowerCase();
    const sub = changeBadge(c) + (t.defect ? `<span class="badge defect">${esc(t.defect.id)}</span>` : '') + (t.arguments ? `<span class="mono">${esc(t.arguments)}</span>` : '');
    return `<li class="leaf ${sel && sel.test.key === t.key ? 'selected' : ''}" data-i="${x.i}" data-search="${esc(search)}" data-name="${esc(t.title.toLowerCase())}"
        data-dur="${t.durationMs}" data-rank="${t.status === 'failed' ? (RANK[c.change] ?? 1) : c.change === 'fixed' ? 3 : 4}">
      <a href="#/run/${encodeURIComponent(run.id)}/test/${encodeURIComponent(t.key)}">${statusIcon(t.status)}
        <span class="leaf-t"><span class="leaf-title">${esc(t.title)}</span>${sub ? `<span class="leaf-sub">${sub}</span>` : ''}</span>
        <span class="leaf-d">${esc(dur(t.durationMs))}</span></a></li>`;
  }

  function initTree(run, data, state, key, sel) {
    const list = document.getElementById('tree-list');
    const leaves = [...list.querySelectorAll('.leaf')];
    const suites = [...list.querySelectorAll('.suite')];
    const $ = id => document.getElementById(id);
    const q = $('q'), sort = $('sort'), size = $('size');
    sort.value = state.sort; size.value = String(state.size);
    const pass = li => {
      const x = data.tests[+li.dataset.i];
      const f = FILTERS.find(([k]) => k === state.f) || FILTERS[0];
      if (!f[2](x)) return false;
      const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      return words.every(w => li.dataset.search.includes(w));
    };
    const cmp = {
      status: (a, b) => (a.dataset.rank - b.dataset.rank) || (a.dataset.i - b.dataset.i),
      name: (a, b) => a.dataset.name.localeCompare(b.dataset.name, 'it'),
      duration: (a, b) => b.dataset.dur - a.dataset.dur,
    };
    function apply(jump) {
      suites.forEach(s => { const ul = s.querySelector('.leaves'); [...ul.children].sort(cmp[state.sort] || cmp.status).forEach(li => ul.appendChild(li)); });
      const visible = suites.flatMap(s => [...s.querySelectorAll('.leaf')].filter(pass));
      window.__qaOrder = visible;
      const per = state.size > 0 ? state.size : Math.max(1, visible.length);
      const pages = Math.max(1, Math.ceil(visible.length / per));
      if (jump) { const i = visible.findIndex(li => li.classList.contains('selected')); if (i >= 0) state.page = Math.floor(i / per) + 1; }
      state.page = Math.min(Math.max(1, state.page), pages);
      const from = (state.page - 1) * per, shown = new Set(visible.slice(from, from + per));
      leaves.forEach(li => { li.hidden = !shown.has(li); });
      suites.forEach(s => {
        const own = [...s.querySelectorAll('.leaf')];
        s.hidden = !own.some(li => shown.has(li));
        const match = own.filter(pass).map(li => data.tests[+li.dataset.i].test.status);
        const ko = match.filter(x => x === 'failed').length, ok = match.filter(x => x === 'passed').length;
        s.querySelector('.suite-counts').innerHTML = (ko ? `<span class="count ko">${ko}</span>` : '') + `<span class="count ok">${ok}</span>`;
        const collapsed = state.collapsed.includes(s.dataset.suite);
        s.classList.toggle('collapsed', collapsed);
        s.querySelector('.suite-h').setAttribute('aria-expanded', String(!collapsed));
      });
      $('tree-empty').hidden = visible.length > 0;
      $('range').textContent = visible.length ? `${from + 1}–${Math.min(from + per, visible.length)} di ${visible.length}` : '0 test';
      $('page').textContent = `${state.page}/${pages}`;
      $('prev').disabled = state.page <= 1;
      $('next').disabled = state.page >= pages;
      document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.f === state.f));
      store.set(key, state);
    }
    let timer;
    q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.q = q.value.trim(); state.page = 1; apply(); }, 120); });
    document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => { state.f = c.dataset.f; state.page = 1; apply(); }));
    sort.addEventListener('change', () => { state.sort = sort.value; apply(); });
    size.addEventListener('change', () => { state.size = +size.value; state.page = 1; apply(); });
    $('prev').addEventListener('click', () => { state.page--; apply(); list.scrollTop = 0; });
    $('next').addEventListener('click', () => { state.page++; apply(); list.scrollTop = 0; });
    $('expand').addEventListener('click', () => { state.collapsed = []; apply(); });
    $('collapse').addEventListener('click', () => { state.collapsed = suites.map(s => s.dataset.suite); apply(); });
    suites.forEach(s => s.querySelector('.suite-h').addEventListener('click', () => {
      const n = s.dataset.suite;
      state.collapsed = state.collapsed.includes(n) ? state.collapsed.filter(x => x !== n) : state.collapsed.concat(n);
      apply();
    }));
    const selected = list.querySelector('.leaf.selected');
    if (selected) state.collapsed = state.collapsed.filter(n => n !== selected.closest('.suite').dataset.suite);
    apply(!!selected);
    if (selected) selected.scrollIntoView({ block: 'nearest' });
    else list.scrollTop = store.get(key + ':scroll', 0);
    list.addEventListener('scroll', () => store.set(key + ':scroll', list.scrollTop), { passive: true });
  }

  // ------------------------------------------------------------------ riepilogo dell'esecuzione

  /** Differenza con segno per i numeri del confronto ("+3", "−2", "="). */
  function delta(now, before, { fmt = v => String(v), goodWhenUp = true, threshold = 0 } = {}) {
    if (before == null) return '';
    const d = now - before;
    if (Math.abs(d) <= threshold) return '<span class="delta same">=</span>';
    const good = goodWhenUp ? d > 0 : d < 0;
    return `<span class="delta ${good ? 'good' : 'bad'}">${d > 0 ? '+' : '−'}${esc(fmt(Math.abs(d)))}</span>`;
  }

  /** Intestazione dell'esecuzione: anello, numeri con la differenza rispetto alla build di confronto, dati dell'ambiente. */
  function runHeader(run, base) {
    const c = run.counts, ok = c.failed === 0, sut = run.sut || {};
    const cmp = run.diff.baselineRunId ? runById(run.diff.baselineRunId) : null;
    const b = cmp ? cmp.counts : null;
    const chips = [
      ['layers', 'Build', run.build, true], ['info', 'Versione', sut.version], ['route', 'Commit', sut.commit && (sut.commit + (sut.branch ? '@' + sut.branch : '')), true],
      ['server', 'Ambiente', sut.environment], ['clock', 'Inizio', dt(run.start)], ['grid', 'Macchina', run.machine],
    ].filter(x => x[2]);
    const kpi = (cls, value, label, d, href) => `<${href ? `a href="${href}"` : 'div'} class="kpi ${cls}"><span class="kpi-v">${value}${d}</span><span class="kpi-l">${label}</span></${href ? 'a' : 'div'}>`;
    return `<section class="card run-head ${ok ? 'ok' : 'ko'}">
      ${donut(c)}
      <div class="run-head-body">
        <div class="hero-title ${ok ? 'ok' : 'ko'}">${ic(ok ? 'ok' : 'ko')}${ok ? 'Tutti i test superati' : `${c.failed} test falliti su ${c.total}`}</div>
        <div class="kpis">
          ${kpi('', c.total, 'totali', delta(c.total, b && b.total), base + '?f=all')}
          ${kpi('ok', c.passed, 'superati', delta(c.passed, b && b.passed), base + '?f=passed')}
          ${kpi('ko', c.failed, 'falliti', delta(c.failed, b && b.failed, { goodWhenUp: false }), base + '?f=failed')}
          ${kpi('', pct(c.passed, c.total), 'tasso di successo', b ? delta(100 * c.passed / c.total, 100 * b.passed / b.total, { fmt: v => v.toFixed(1).replace('.', ',') + ' pt', threshold: 0.05 }) : '')}
          ${kpi('', esc(dur(run.durationMs)), 'durata', b ? delta(run.durationMs, cmp.durationMs, { fmt: dur, goodWhenUp: false, threshold: Math.max(200, cmp.durationMs * 0.05) }) : '')}
        </div>
        ${cmp ? `<div class="kpi-note">differenze rispetto alla build <span class="mono">${esc(cmp.build)}</span> (<a href="#/run/${encodeURIComponent(cmp.id)}">esecuzione del ${esc(dtShort(cmp.start))}</a>)</div>` : ''}
        <div class="env-chips">${chips.map(([icon, k, v, mono]) => `<span class="env-chip" title="${esc(k)}">${ic(icon)}<span class="muted">${esc(k)}</span> <b class="${mono ? 'mono' : ''}">${esc(v)}</b></span>`).join('')}</div>
      </div>
    </section>`;
  }

  /**
   * Categoria di un test fallito, per tipo di errore: eccezione del sistema (per tipo), status
   * HTTP per famiglia (accettato invece di rifiutato, rifiutato invece di accettato, codice
   * d'errore diverso…), valore diverso, errore fuori dalle verifiche. <c>detail</c> è il caso
   * preciso del test (es. "400 → 200"), mostrato sulla sua riga.
   */
  function failureCategory(x) {
    const t = x.test;
    const exc = allSteps(t.steps).find(s => s.kind === 'log' && detail(s, 'stack'));
    if (exc) {
      const h = exceptionHeadline(exc);
      const m = /^([\w.`]+(?:Exception|Error))\b/.exec(h);
      const name = m ? m[1].split('.').pop() : 'eccezione';
      return { key: 'exc:' + name, label: `Eccezione del sistema: ${name}`, icon: 'server', cls: 'c-reg', detail: h.length > 140 ? h.slice(0, 140) + '…' : h };
    }
    const ff = findFailure(t.steps);
    const fa = ff && { failed: ff.leaf };
    if (fa) {
      const e = detail(fa.failed, 'atteso') || '', g = detail(fa.failed, 'ottenuto') || '';
      const se = /^(\d)(\d\d)\s/.exec(e), sg = /^(\d)(\d\d)\s/.exec(g);
      if (se && sg) {
        const pair = `${e.split(' · ')[0]} → ${g.split(' · ')[0]}`;
        const fam = se[1] + 'xx>' + sg[1] + 'xx';
        const known = {
          '4xx>2xx': ['Accettato ciò che andava rifiutato', 'c-reg', 'up'],
          '4xx>3xx': ['Nessun errore dove serviva un rifiuto', 'c-still', 'route'],
          '2xx>4xx': ['Rifiutato ciò che andava accettato', 'c-reg', 'down'],
          '2xx>3xx': ['Nessuna modifica dove serviva l\'esito', 'c-still', 'route'],
          '4xx>4xx': ['Codice d\'errore diverso', 'c-still', 'repeat'],
          '4xx>5xx': ['Errore del server invece di un rifiuto', 'c-reg', 'server'],
          '2xx>5xx': ['Errore del server su una richiesta valida', 'c-reg', 'server'],
        }[fam] || [`Atteso ${se[1]}xx, ottenuto ${sg[1]}xx`, 'c-still', 'route'];
        return { key: 'http:' + fam, label: known[0], icon: known[2], cls: known[1], detail: pair };
      }
      return { key: 'val', label: 'Valore diverso dall\'atteso', icon: 'ko', cls: 'c-new', detail: `${fa.failed.text}${e || g ? ` (atteso ${e.slice(0, 40)}, ottenuto ${g.slice(0, 40)})` : ''}` };
    }
    return { key: 'other', label: 'Errore fuori dalle verifiche', icon: 'stop', cls: 'c-flaky', detail: (t.message || '').split('\n')[0].slice(0, 140) };
  }

  /** Riga compatta di un test in un elenco del riepilogo. */
  function testRow(run, t, extra) {
    return `<a class="trow" href="#/run/${encodeURIComponent(run.id)}/test/${encodeURIComponent(t.key)}">${statusIcon(t.status)}
      <span class="trow-main"><span class="trow-title">${esc(t.title)}</span>
        <span class="trow-meta">${esc(suiteOf(t))}${t.arguments ? ` · <span class="mono">${esc(t.arguments)}</span>` : ''}${extra ? ' · ' + extra : ''}</span></span>
      ${t.defect ? `<span class="badge defect">${esc(t.defect.id)}</span>` : ''}<span class="trow-d">${esc(dur(t.durationMs))}</span></a>`;
  }

  function runOverview(run, data) {
    const base = `#/run/${encodeURIComponent(run.id)}`;
    const d = run.diff;
    const tests = data.tests;

    // Cambiamenti rispetto alla build precedente: un elenco alla volta.
    const groups = [
      ['regression', x => x.change && x.change.change === 'regression', () => `passava sulla build <span class="mono">${esc(d.baselineBuild)}</span>`],
      ['fixed', x => x.change && x.change.change === 'fixed', () => `falliva sulla build <span class="mono">${esc(d.baselineBuild)}</span>`],
      ['still-failing', x => x.change && x.change.change === 'still-failing', x => x.change.failingSinceBuild ? `fallisce dalla build <span class="mono">${esc(x.change.failingSinceBuild)}</span>` : ''],
      ['new', x => x.change && x.change.change === 'new', x => x.test.status === 'failed' ? 'nuovo e già fallito' : 'nuovo'],
      ['flaky', x => x.change && x.change.flaky, () => `esiti diversi sulla build <span class="mono">${esc(run.build)}</span>`],
    ].map(([k, fn, extra]) => ({ k, m: CHANGES[k], items: tests.filter(fn), extra }));
    const removed = d.removedKeys || [];
    const firstNonEmpty = (groups.find(g => g.items.length) || {}).k || (removed.length ? 'removed' : 'regression');
    const changesPanel = !d.baselineRunId
      ? '<div class="empty">Prima build del sistema nello storico: nessun confronto, quindi nessun cambiamento da mostrare.</div>'
      : `<div class="diff-head">Build <b class="mono">${esc(run.build)}</b> rispetto a <b class="mono">${esc(d.baselineBuild)}</b>
          <span>(<a href="#/run/${encodeURIComponent(d.baselineRunId)}">esecuzione del ${esc(dtShort((runById(d.baselineRunId) || {}).start))}</a>)</span></div>
        <div class="seg" role="group" aria-label="Tipo di cambiamento">${groups.map(g =>
          `<button type="button" class="seg-btn ${g.m.cls}" data-seg="${g.k}" ${g.items.length ? '' : 'disabled'}>${ic(g.m.icon)}${g.m.plural}<b>${g.items.length}</b></button>`).join('')}
          <button type="button" class="seg-btn c-still" data-seg="removed" ${removed.length ? '' : 'disabled'}>${ic('down')}Rimossi<b>${removed.length}</b></button></div>
        ${groups.map(g => `<div class="seg-panel" data-seg-panel="${g.k}" hidden>${g.items.length
          ? `<div class="trows">${g.items.map(x => testRow(run, x.test, g.extra(x))).join('')}</div>` : `<div class="empty">Nessun test.</div>`}</div>`).join('')}
        <div class="seg-panel" data-seg-panel="removed" hidden>${removed.length ? `<div class="trows">${removed.map(k =>
          `<div class="trow">${ic('down', 'muted')}<span class="trow-main"><span class="trow-title">${esc((idx.tests[k] || {}).t || k)}</span><span class="trow-meta mono">${esc(k)}</span></span></div>`).join('')}</div>` : ''}</div>`;

    // Categorie di errore dei falliti.
    const failed = tests.filter(x => x.test.status === 'failed');
    const cats = {};
    failed.forEach(x => { const c = failureCategory(x); (cats[c.key] = cats[c.key] || { ...c, items: [] }).items.push(x); });
    const catList = Object.values(cats).sort((a, b) => b.items.length - a.items.length);
    const defects = {};
    failed.filter(x => x.test.defect).forEach(x => (defects[x.test.defect.id] = defects[x.test.defect.id] || { d: x.test.defect, n: 0 }).n++);
    const catPanel = failed.length === 0 ? '<div class="empty">Nessun test fallito.</div>' : `
      <div class="cats">${catList.map((c, i) => `<details class="cat ${c.cls}" ${i === 0 ? "open" : ""}>
        <summary>${ic(c.icon)}<span class="cat-label break">${esc(c.label)}</span>
          <span class="cat-bar"><span style="width:${100 * c.items.length / failed.length}%"></span></span><b>${c.items.length}</b>${ic('chevDown', 'chev')}</summary>
        <div class="trows">${c.items.map(x => testRow(run, x.test, `<span class="mono">${esc(failureCategory(x).detail)}</span>` + (x.change ? ' ' + changeBadge(x.change) : ''))).join('')}</div></details>`).join('')}</div>
      ${Object.keys(defects).length ? `<h3 class="sub-h">${ic('bug')}Per difetto noto</h3><div class="defects">${Object.values(defects).sort((a, b) => b.n - a.n).map(v =>
        `<a class="defect-chip" href="${base}?f=defect&q=${encodeURIComponent(v.d.id.toLowerCase())}"><b>${esc(v.d.id)}</b><span class="break">${esc(v.d.title)}</span><span class="count ko">${v.n}</span></a>`).join('')}</div>` : ''}`;

    // Suite.
    const suites = {};
    tests.forEach(x => (suites[suiteOf(x.test)] = suites[suiteOf(x.test)] || []).push(x));
    const suitePanel = `<table class="table"><thead><tr><th>Suite</th><th class="num">Test</th><th class="num">Falliti</th><th class="num col-xs">Regressioni</th><th class="num col-sm">Durata</th><th class="col-md">Esito</th></tr></thead><tbody>
      ${Object.keys(suites).sort((a, b) => a.localeCompare(b, 'it')).map(sn => {
        const xs = suites[sn], p = xs.filter(x => x.test.status === 'passed').length, f = xs.filter(x => x.test.status === 'failed').length;
        const r = xs.filter(x => x.change && x.change.change === 'regression').length, ms = xs.reduce((s, x) => s + x.test.durationMs, 0);
        return `<tr><td>${statusIcon(f ? 'failed' : 'passed')} <a href="${base}?f=all&q=${encodeURIComponent(sn.toLowerCase())}">${esc(sn)}</a></td>
          <td class="num">${xs.length}</td><td class="num"><span class="count ${f ? 'ko' : 'zero'}">${f}</span></td>
          <td class="num col-xs"><span class="count ${r ? 'reg' : 'zero'}">${d.baselineRunId ? r : '—'}</span></td><td class="num col-sm">${esc(dur(ms))}</td>
          <td class="col-md"><span class="hbar-track"><span class="seg-ok" style="width:${100 * p / xs.length}%"></span><span class="seg-ko" style="width:${100 * f / xs.length}%"></span></span></td></tr>`;
      }).join('')}</tbody></table>`;

    // Durate: istogramma per fasce e i più lenti.
    const bands = [[0, 5], [5, 10], [10, 25], [25, 50], [50, 100], [100, 250], [250, 500], [500, 1000], [1000, Infinity]];
    const hist = bands.map(([lo, hi]) => ({ lo, hi, xs: tests.filter(x => x.test.durationMs >= lo && x.test.durationMs < hi) }));
    const hmax = Math.max(1, ...hist.map(h => h.xs.length));
    const slow = tests.map(x => x.test).sort((a, b) => b.durationMs - a.durationMs).slice(0, 10);
    const total = tests.reduce((s, x) => s + x.test.durationMs, 0);
    const sorted = tests.map(x => x.test.durationMs).sort((a, b) => a - b);
    const q = f => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))] : 0;
    const durPanel = `
      <div class="kpis small">
        <div class="kpi"><span class="kpi-v">${esc(dur(total))}</span><span class="kpi-l">somma dei test</span></div>
        <div class="kpi"><span class="kpi-v">${esc(dur(q(0.5)))}</span><span class="kpi-l">mediana</span></div>
        <div class="kpi"><span class="kpi-v">${esc(dur(q(0.95)))}</span><span class="kpi-l">95° percentile</span></div>
        <div class="kpi"><span class="kpi-v">${esc(dur(sorted[sorted.length - 1] || 0))}</span><span class="kpi-l">massimo</span></div>
      </div>
      <div class="histo" role="img" aria-label="Distribuzione delle durate">${hist.map(h => `<div class="histo-col" title="${h.xs.length} test tra ${h.lo} e ${h.hi === Infinity ? '∞' : h.hi} ms">
        <span class="histo-n">${h.xs.length || ''}</span><span class="histo-bar ${h.xs.some(x => x.test.status === 'failed') ? 'has-ko' : ''}" style="height:${Math.max(h.xs.length ? 3 : 0, 100 * h.xs.length / hmax)}%"></span>
        <span class="histo-l">${h.hi === Infinity ? '≥ 1 s' : h.lo >= 1000 ? h.lo / 1000 + ' s' : `${h.lo}–${h.hi}`}</span></div>`).join('')}</div>
      <div class="histo-caption">millisecondi per test</div>
      <h3 class="sub-h">${ic('hourglass')}I più lenti</h3>
      ${slow.map(t => `<a class="hbar" href="${base}/test/${encodeURIComponent(t.key)}"><span class="hbar-label">${statusIcon(t.status)} ${esc(t.title)}</span>
        <span class="hbar-track"><span class="${t.status === 'failed' ? 'seg-ko' : 'seg-info'}" style="width:${100 * t.durationMs / Math.max(1, slow[0].durationMs)}%"></span></span><span class="hbar-n">${esc(dur(t.durationMs))}</span></a>`).join('')}`;

    // Ambiente.
    const sut = run.sut || {};
    const envRows = [
      ['Sistema', sut.name], ['Build', sut.build], ['Versione', sut.version], ['Commit', sut.commit], ['Branch', sut.branch], ['Data del commit', sut.commitDate],
      ['Ambiente', sut.environment], ...Object.entries(sut.extra || {}),
    ].filter(x => x[1]);
    const runRows2 = [['Esecuzione', run.id], ['Inizio', dt(run.start)], ['Fine', dt(run.end)], ['Durata', dur(run.durationMs)], ['Macchina', run.machine], ['Utente', run.user],
      ['Framework', run.framework], ...Object.entries(run.properties || {})].filter(x => x[1]);
    const dl = rows => `<dl class="dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="${/Build|Commit|Esecuzione|Branch/.test(k) ? 'mono' : ''}">${esc(v)}</dd>`).join('')}</dl>`;
    const envPanel = `<div class="grid grid-2"><div><h3 class="sub-h">${ic('server')}Sistema sotto test</h3>${dl(envRows)}</div><div><h3 class="sub-h">${ic('grid')}Esecuzione</h3>${dl(runRows2)}</div></div>`;

    const tabs = [
      ['changes', 'Cambiamenti', 'layers', d.baselineRunId ? d.regressions + d.fixed + d.stillFailing + d.new + d.flaky + removed.length : null],
      ['categories', 'Categorie di errore', 'bug', catList.length],
      ['suites', 'Suite', 'grid', Object.keys(suites).length],
      ['durations', 'Durate', 'hourglass', null],
      ['env', 'Ambiente', 'server', null],
    ];
    return `${runHeader(run, base)}
      <section class="card overview" data-default-seg="${firstNonEmpty}">
        <nav class="tabs" role="tablist">${tabs.map(([k, l, i, n], j) => `<button type="button" class="tab ${j === 0 ? 'active' : ''}" data-tab="${k}">${ic(i)}${l}${n != null ? `<span class="tab-badge">${n}</span>` : ''}</button>`).join('')}</nav>
        <div class="panel" data-panel="changes">${changesPanel}</div>
        <div class="panel" data-panel="categories" hidden>${catPanel}</div>
        <div class="panel" data-panel="suites" hidden>${suitePanel}</div>
        <div class="panel" data-panel="durations" hidden>${durPanel}</div>
        <div class="panel" data-panel="env" hidden>${envPanel}</div>
      </section>`;
  }

  /** Selettore dei cambiamenti nel riepilogo (un elenco alla volta, scelta ricordata). */
  function initSegments(root) {
    const btns = [...root.querySelectorAll('.seg-btn')];
    if (!btns.length) return;
    const show = k => {
      const b = btns.find(x => x.dataset.seg === k && !x.disabled) || btns.find(x => !x.disabled);
      if (!b) return;
      btns.forEach(x => x.classList.toggle('active', x === b));
      root.querySelectorAll('[data-seg-panel]').forEach(p => { p.hidden = p.dataset.segPanel !== b.dataset.seg; });
      store.set('qa:seg', b.dataset.seg);
    };
    btns.forEach(b => b.addEventListener('click', () => show(b.dataset.seg)));
    show(store.get('qa:seg', root.dataset.defaultSeg));
  }

  // ------------------------------------------------------------------ dettaglio del test

  /**
   * Passi piatti raggruppati in azioni: richiesta/azione + risposta, log, dati e verifiche fino
   * alla successiva. I passi con nome ("step", annidati) restano nodi a sé (vedi renderSteps).
   */
  function actionsOf(steps, failedTest) {
    const out = [];
    let cur = null, n = 0;
    for (const s of steps) {
      if (s.kind === 'step') { cur = null; out.push({ node: s }); continue; }
      if (s.kind === 'request' || s.kind === 'action') { cur = { n: ++n, head: s, steps: [] }; out.push(cur); continue; }
      if (!cur) { cur = { n: 0, head: null, steps: [] }; out.push(cur); }
      cur.steps.push(s);
    }
    out.filter(a => !a.node).forEach(a => {
      a.response = a.steps.find(s => s.kind === 'response');
      a.checks = a.steps.filter(s => s.kind === 'check');
      a.failed = a.checks.find(s => s.ok === false);
      a.logs = a.steps.filter(s => s.kind === 'log');
      a.other = a.steps.filter(s => s.kind === 'data' || s.kind === 'note');
    });
    const flat = out.filter(a => !a.node);
    if (failedTest && flat.length && !findFailure(steps) && !out.some(a => a.node && a.node.status === 'failed')) flat[flat.length - 1].crashed = true;
    return out;
  }
  const detail = (s, k) => { const d = s && s.details && s.details.find(x => x.key === k); return d ? d.value : null; };
  const headTitle = (a, nested) => {
    if (!a.head) return nested ? ['Verifiche', ''] : ['Preparazione', 'dati e controlli prima della prima azione'];
    const p = a.head.text.split(' · ');
    return [p[0], p.slice(1).join(' · ')];
  };
  const exceptionHeadline = s => {
    const m = /Unhandled exception on [^:]+: (.*)$/.exec(s.text);
    return m ? m[1] : s.text;
  };

  /** Tutti i passi, anche quelli annidati. */
  const allSteps = steps => (steps || []).flatMap(s => [s, ...allSteps(s.steps)]);

  /**
   * Il punto in cui il test ha fallito, anche dentro step annidati: la prima verifica fallita
   * (check) o lo step fallito più profondo, con il percorso degli step che lo contengono.
   */
  function findFailure(steps, path = []) {
    for (const s of steps || []) {
      if (s.kind === 'check' && s.ok === false) return { path, leaf: s };
      if (s.kind === 'step' && s.status === 'failed') return findFailure(s.steps, path.concat(s)) || { path, leaf: s };
    }
    return null;
  }

  /** Allegati del test: quelli veri (Allure) e i corpi di richiesta/risposta registrati da QaReport. */
  function attachmentsOf(t) {
    const out = (t.attachments || []).map(a => ({ ...a, where: 'test' }));
    const walk = (steps, where) => (steps || []).forEach(s => {
      (s.attachments || []).forEach(a => out.push({ ...a, where: where.concat(s.text).join(' › ') }));
      if (s.kind === 'request' && detail(s, 'corpo') != null) out.push({ name: 'Corpo della richiesta', content: detail(s, 'corpo'), where: where.concat(s.text.split(' · ')[0]).join(' › ') });
      if (s.kind === 'response' && detail(s, 'corpo') != null) out.push({ name: 'Corpo della risposta', content: detail(s, 'corpo'), where: where.concat(s.text.split(' · ')[0]).join(' › ') });
      if (s.kind === 'step') walk(s.steps, where.concat(s.text));
    });
    walk(t.steps, []);
    return out;
  }

  const size = b => b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1).replace('.', ',')} KB` : `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;

  // ------------------------------------------------------------------ allegati visivi

  const isImage = a => !!a.url && /^image\//i.test(a.type || '');
  const isVideo = a => !!a.url && /^video\//i.test(a.type || '');
  const isMedia = a => isImage(a) || isVideo(a);

  /** Miniatura di un'immagine o di un video: apre il visore a tutto schermo. */
  function mediaThumb(a) {
    const cap = a.name + (a.where && a.where !== 'test' ? ` · ${a.where}` : '');
    const inner = isImage(a)
      ? `<img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy" decoding="async">`
      : `<video src="${esc(a.url)}#t=0.1" preload="metadata" muted playsinline></video><span class="thumb-play">${ic('play')}</span>`;
    return `<figure class="thumb"><button type="button" class="thumb-btn" data-lb="${esc(a.url)}" data-lb-type="${isImage(a) ? 'image' : 'video'}" data-lb-cap="${esc(cap)}" title="Apri: ${esc(a.name)}">${inner}</button>
      <figcaption><span class="break">${esc(a.name)}</span>${a.sizeBytes ? `<span class="muted"> · ${esc(size(a.sizeBytes))}</span>` : ''}</figcaption></figure>`;
  }
  const mediaStrip = (list, cls = '') => list.length ? `<div class="thumbs ${cls}">${list.map(mediaThumb).join('')}</div>` : '';

  /** Allegati di un elenco: immagini e video come miniature, gli altri come blocchi apribili. */
  const attachmentsHtml = list => {
    const media = list.filter(isMedia), other = list.filter(a => !isMedia(a));
    return mediaStrip(media) + (other.length ? `<div class="atts">${other.map(a => attachmentBlock(a, false)).join('')}</div>` : '');
  };

  function attachmentBlock(a, open) {
    const viewable = /html|xml|pdf|text|json|svg/i.test(a.type || '');
    const body = a.content != null ? code(a.content, { plain: !/json/i.test(a.type || '') && tryJson(a.content) == null })
      : a.url ? `<div class="att-file">${viewable ? `<a class="link-btn" href="${esc(a.url)}" target="_blank" rel="noopener">${ic('external')}Apri</a>` : ''}<a class="link-btn" href="${esc(a.url)}" download>${ic('download')}Scarica</a></div>`
      : `<div class="muted small">File non disponibile${a.type ? ` (${esc(a.type)}` : ''}${a.sizeBytes ? `, ${esc(size(a.sizeBytes))}` : ''}${a.type ? ')' : ''}: non è stato copiato nello storico.</div>`;
    return `<details class="att" ${open ? 'open' : ''}><summary>${ic('clip')}<span class="att-name break">${esc(a.name)}</span>
      ${a.where && a.where !== 'test' ? `<span class="att-where break">${esc(a.where)}</span>` : ''}<span class="att-meta">${esc(a.type || '')}${a.sizeBytes ? ' · ' + esc(size(a.sizeBytes)) : ''}</span>${ic('chevDown', 'chev')}</summary>${body}</details>`;
  }

  /** Albero dei passi: nodi con nome (step) e gruppi di azioni piatte, a qualunque livello. */
  function renderSteps(t, steps, depth) {
    const acts = actionsOf(steps, depth === 0 && t.status === 'failed');
    const flat = acts.filter(a => !a.node);
    return acts.map(a => a.node ? stepNode(t, a.node, depth) : stepCard(t, flat, a, flat.indexOf(a), depth > 0)).join('');
  }

  function stepNode(t, s, depth) {
    const kids = s.steps || [];
    const failed = s.status === 'failed';
    const nSub = allSteps(kids).length, nAtt = allSteps([s]).reduce((n, x) => n + (x.attachments || []).length, 0);
    const params = (s.details || []).filter(d => !['atteso', 'ottenuto', 'messaggio', 'errore'].includes(d.key));
    const exp = detail(s, 'atteso'), got = detail(s, 'ottenuto'), msg = detail(s, 'messaggio') || detail(s, 'errore');
    let body = '';
    if (params.length) body += `<dl class="params">${params.map(d => `<dt>${esc(d.key)}</dt><dd class="break">${esc(d.value)}</dd>`).join('')}</dl>`;
    if (exp != null || got != null) body += `<div class="pair">${exp != null ? code(exp, { label: 'Atteso' }) : ''}${got != null ? code(got, { label: 'Ottenuto', tone: failed ? 'ko' : '' }) : ''}</div>`;
    if (failed && msg && !kids.some(k => k.status === 'failed' || k.ok === false)) body += code(msg, { label: 'Errore', tone: 'ko', plain: true });
    if ((s.attachments || []).length) body += attachmentsHtml(s.attachments);
    if (kids.length) body += `<div class="node-kids">${renderSteps(t, kids, depth + 1)}</div>`;
    const leafy = !body;
    return `<details class="node ${s.status || 'passed'} ${leafy ? 'leafy' : ''}" ${failed ? 'open' : ''}><summary>
      ${statusIcon(s.status || 'passed')}<span class="node-title break">${esc(s.text)}</span>
      <span class="node-meta">${nSub ? `<span title="passi al suo interno">${ic('route')}${nSub}</span>` : ''}${nAtt ? `<span title="allegati">${ic('clip')}${nAtt}</span>` : ''}${params.length || exp != null ? `<span title="parametri">${ic('list')}${params.length + (exp != null ? 1 : 0) + (got != null ? 1 : 0)}</span>` : ''}</span>
      <span class="step-time">${esc(dur(s.durationMs))}</span>${leafy ? '' : ic('chevDown', 'chev')}</summary>${body}</details>`;
  }

  function testDetail(run, data, x) {
    const t = x.test, c = x.change || {};
    const every = allSteps(t.steps);
    // Verifiche: i check di QaReport e, nei risultati di Allure, gli step foglia con "atteso".
    const isCheck = s => s.kind === 'check' || (s.kind === 'step' && !(s.steps || []).length && detail(s, 'atteso') != null);
    const nChecks = every.filter(isCheck).length;
    const nActions = every.filter(s => (s.kind === 'request' || s.kind === 'action' || s.kind === 'step') && !isCheck(s)).length;
    const hist = idx.tests[t.key];
    const runIdx = runs.findIndex(r => r.id === run.id);
    const atts = attachmentsOf(t);
    const cat = t.status === 'failed' ? failureCategory(x) : null;

    let callout = '';
    const baseBuild = run.diff.baselineBuild;
    if (c.change === 'regression') callout = co('c-reg', 'up', `<b>Regressione</b>: passava sulla build <span class="mono">${esc(baseBuild)}</span>, fallisce sulla <span class="mono">${esc(run.build)}</span>.`);
    else if (c.change === 'fixed') callout = co('c-fix', 'check', `<b>Corretto</b>: falliva sulla build <span class="mono">${esc(baseBuild)}</span>, passa sulla <span class="mono">${esc(run.build)}</span>.`);
    else if (c.change === 'still-failing') callout = co('c-still', 'repeat', `<b>Ancora fallito</b>: fallisce dalla build <span class="mono">${esc(c.failingSinceBuild)}</span>${c.failingSinceRun ? ` (esecuzione del ${esc(dtShort((runById(c.failingSinceRun) || {}).start))})` : ''}.`);
    else if (c.change === 'new') callout = co('c-new', 'plus', `<b>Test nuovo</b>: non c'era nell'esecuzione di confronto${t.status === 'failed' ? ' e fallisce già alla prima' : ''}.`);
    if (c.flaky) callout += co('c-flaky', 'zig', `<b>Instabile</b>: sulla build <span class="mono">${esc(run.build)}</span> ha dato esiti diversi tra un'esecuzione e l'altra.`);

    const labels = [...(t.categories || []).map(v => ['tag', v]), ...Object.entries(t.properties || {})];
    const tabs = [
      ['overview', 'Panoramica', 'list', null],
      ['history', 'Storico', 'history', hist ? hist.st.replace(/-/g, '').length : 0],
      ['attachments', 'Allegati', 'clip', atts.length],
      ['info', 'Dettagli', 'info', null],
    ];
    return `
      <header class="card t-head ${t.status}">
        <div class="t-head-bar">
          <span class="t-fullname mono break" title="${esc(t.key)}">${esc(t.key)}</span>
          <button type="button" class="icon-btn small" data-copy-text="${esc(t.key)}" title="Copia il nome completo">${ic('copy')}</button>
          <span class="t-nav" id="test-nav"></span>
        </div>
        <h2 class="t-title">${esc(t.title)}</h2>
        <div class="t-head-top"><span class="st ${t.status}">${statusIcon(t.status)}${statusLabel(t.status)}</span>${changeBadge(c)}
          ${t.defect ? `<span class="badge defect">${ic('bug')}difetto noto ${esc(t.defect.id)}</span>` : ''}
          ${cat ? `<span class="badge ${cat.cls}" title="Categoria di errore">${ic(cat.icon)}${esc(cat.label)}</span>` : ''}
          <span class="t-head-dur">${ic('clock')}${esc(dur(t.durationMs))}</span></div>
        <div class="t-path">${esc(suiteOf(t))}${ic('chevRight')}<span class="mono">${esc(t.method || '')}</span>${t.arguments ? `<span class="mono t-args">(${esc(t.arguments)})</span>` : ''}</div>
      </header>
      ${callout}
      <nav class="tabs" role="tablist">${tabs.map(([k, l, i, n], j) => `<button type="button" class="tab ${j === 0 ? 'active' : ''}" data-tab="${k}">${ic(i)}${l}${n != null ? `<span class="tab-badge">${n}</span>` : ''}</button>`).join('')}</nav>

      <section class="panel" data-panel="overview">
        ${t.status === 'failed' ? whereFailed(t) : ''}
        ${t.defect ? `<section class="card"><h2 class="card-h">${ic('bug')}Difetto noto ${esc(t.defect.id)}</h2>
          <p style="margin:0 0 8px;font-weight:600">${esc(t.defect.title)}</p>${t.defect.fix ? `<p class="muted" style="margin:0 0 8px">${esc(t.defect.fix)}</p>` : ''}
          ${t.defect.files && t.defect.files.length ? `<div class="mono muted break" style="font-size:12.5px">${t.defect.files.map(esc).join('<br>')}</div>` : ''}</section>` : ''}
        ${(t.parameters || []).length ? `<section class="card"><h2 class="card-h">${ic('list')}Parametri<span class="note">${t.parameters.length}</span></h2>
          <dl class="params wide">${t.parameters.map(p => `<dt>${esc(p.key)}</dt><dd class="mono break">${esc(p.value)}</dd>`).join('')}</dl></section>` : ''}
        ${labels.length ? `<section class="card"><h2 class="card-h">${ic('grid')}Etichette<span class="note">${labels.length}</span></h2>
          <dl class="params wide">${labels.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="break">${/^https?:\/\//.test(v) ? `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v)}</dd>`).join('')}</dl></section>` : ''}
        ${(t.attachments || []).length ? `<section class="card"><h2 class="card-h">${ic('clip')}Allegati del test<span class="note">${t.attachments.length}</span></h2>${attachmentsHtml(t.attachments)}</section>` : ''}
        <section class="card body-card">
          <div class="steps-bar"><h2 class="card-h" style="margin:0">${ic('route')}Corpo del test<span class="note">${nActions} passi · ${nChecks} verifiche</span></h2>
            <span><button type="button" class="link-btn" data-steps="open">${ic('expand')}Espandi</button><button type="button" class="link-btn" data-steps="close">${ic('collapse')}Comprimi</button></span></div>
          <div class="tree-steps">${renderSteps(t, t.steps, 0) || '<div class="empty">Il test non ha registrato passi.</div>'}</div>
        </section>
      </section>
      <section class="panel" data-panel="history" hidden>${historyPanel(t, hist, runIdx)}</section>
      <section class="panel" data-panel="attachments" hidden>${attachmentsPanel(atts)}</section>
      <section class="panel" data-panel="info" hidden>${infoPanel(t, run)}</section>`;
  }
  /** Scheda Allegati: prima la galleria di immagini e video, poi gli altri allegati. */
  function attachmentsPanel(atts) {
    if (!atts.length) return '<div class="empty">Nessun allegato.</div>';
    const media = atts.filter(isMedia), other = atts.filter(a => !isMedia(a));
    let html = '';
    if (media.length) html += `<h3 class="sub-h">${ic('image')}Immagini e video<span class="note">${media.length}</span></h3>${mediaStrip(media, 'gallery')}`;
    if (other.length) html += `${media.length ? `<h3 class="sub-h">${ic('clip')}Altri allegati<span class="note">${other.length}</span></h3>` : ''}<div class="atts">${other.map(a => attachmentBlock(a, false)).join('')}</div>`;
    return html;
  }
  const co = (cls, icon, html) => `<div class="callout ${cls}">${ic(icon)}<div>${html}</div></div>`;

  function whereFailed(t) {
    const f = findFailure(t.steps);
    const exc = allSteps(t.steps).find(s => s.kind === 'log' && detail(s, 'stack'));
    // Ultimo screenshot del test (di solito quello scattato al fallimento), accanto al punto di errore.
    const shot = attachmentsOf(t).filter(isImage).pop();
    let html = `<section class="card where ${shot ? 'has-shot' : ''}"><h3 class="where-h">${ic('pin')}Dove ha fallito</h3><div class="where-body"><div class="where-main">`;
    if (f) {
      // Percorso degli step fino al punto di fallimento, poi l'azione piatta che lo precede.
      const trail = f.path.map(s => s.text);
      const siblings = f.path.length ? f.path[f.path.length - 1].steps : t.steps;
      const acts = actionsOf(siblings || [], false).filter(a => !a.node);
      const act = acts.find(a => a.steps.includes(f.leaf));
      if (act && act.head) trail.push(headTitle(act)[0]);
      if (trail.length) html += `<div class="kv"><span>Dove</span><span class="trail break">${trail.map(x => `<span class="mono">${esc(x)}</span>`).join(ic('chevRight'))}</span></div>`;
      html += `<div class="kv"><span>${f.leaf.kind === 'check' ? 'Verifica' : 'Step'}</span><span class="mono break">${esc(f.leaf.text)}</span></div>`;
      const exp = detail(f.leaf, 'atteso'), got = detail(f.leaf, 'ottenuto'), msg = detail(f.leaf, 'messaggio');
      if (exp != null || got != null) html += `<div class="pair">${exp != null ? code(exp, { label: 'Atteso' }) : ''}${got != null ? code(got, { label: 'Ottenuto', tone: 'ko' }) : ''}</div>`;
      else if (msg || t.message) html += code(msg || t.message, { label: 'Errore', tone: 'ko', plain: true });
      // Più verifiche fallite (Assert.Multiple): elencate tutte.
      const more = allSteps(t.steps).filter(s => (s.kind === 'check' && s.ok === false) || (s.kind === 'step' && s.status === 'failed' && !(s.steps || []).length)).filter(s => s !== f.leaf);
      if (more.length) html += `<div class="more-fails"><div class="label">Altre verifiche fallite (${more.length})</div><ul class="checks">${more.map(s =>
        `<li class="ko">${ic('ko')}<span>${esc(s.text)}${detail(s, 'ottenuto') != null ? ` <span class="muted">→ ${esc(String(detail(s, 'ottenuto')).slice(0, 120))}</span>` : ''}</span></li>`).join('')}</ul></div>`;
    } else if (t.message) {
      html += code(t.message, { label: 'Errore', tone: 'ko', plain: true });
    }
    if (exc) {
      html += `<div class="exc"><div class="exc-h">${ic('server')}Eccezione del sistema sotto test</div><div class="exc-msg mono break">${esc(exceptionHeadline(exc))}</div>
        <details><summary>Stack trace</summary>${code(detail(exc, 'stack'), { plain: true })}</details></div>`;
    }
    html += '</div>';
    if (shot) html += `<aside class="where-shot"><div class="label">Ultimo screenshot</div>${mediaThumb(shot)}</aside>`;
    return html + '</div></section>';
  }

  function stepCard(t, acts, a, i, nested) {
    const [title, sub] = headTitle(a, nested);
    const start = a.head ? a.head.elapsedMs : (a.steps[0] ? a.steps[0].elapsedMs : 0);
    const nextHead = acts[i + 1] && acts[i + 1].head;
    const next = nextHead ? nextHead.elapsedMs : (i + 1 < acts.length ? start : (nested ? (a.steps.length ? a.steps[a.steps.length - 1].elapsedMs : start) : t.durationMs));
    const cls = a.failed || a.crashed ? 'failed' : a.checks.length ? 'passed' : 'info';
    const res = a.response;
    const status = res ? res.text.split(' ')[0] : null;
    let body = `<div class="ae"><div><div class="label">Atteso</div>${a.checks.length ? `<ul class="checks">${a.checks.map(c =>
      `<li class="${c.ok === false ? 'ko' : 'ok'}">${ic(c.ok === false ? 'ko' : 'ok')}<span>${esc(c.text)}</span></li>`).join('')}</ul>` : '<div class="muted">nessuna verifica</div>'}</div>
      <div><div class="label">Ottenuto</div>`;
    if (res) {
      const parts = res.text.split(' · ');
      body += `<div class="got"><span class="http s${esc(status[0])}">${esc(parts[0])}</span><span class="muted">${esc(parts.slice(1).join(' · '))}</span></div>`;
      const ep = detail(res, 'endpoint');
      if (ep) body += `<div class="log-line muted">${ic('route')}<span class="break">${esc(ep.split(' (')[0])}</span></div>`;
    }
    a.logs.forEach(s => { body += `<div class="log-line ${/ERROR|FATAL/i.test(s.level || '') ? 'error' : ''}">${ic('server')}<span class="break">${esc(exceptionHeadline(s))}</span></div>`; });
    a.other.forEach(s => { body += `<div class="log-line ${s.kind === 'data' ? 'data' : 'muted'}">${ic(s.kind === 'data' ? 'db' : 'info')}<span class="break">${esc(s.text)}</span></div>`; });
    if (!res && !a.logs.length && !a.other.length) body += '<div class="muted">—</div>';
    body += '</div></div>';
    const fails = a.checks.filter(c => c.ok === false);
    if (fails.length) {
      body += `<div class="step-fail">${fails.map(f => `${fails.length > 1 ? `<div class="label">${esc(f.text)}</div>` : ''}<div class="pair">${detail(f, 'atteso') != null ? code(detail(f, 'atteso'), { label: 'Atteso' }) : ''}${detail(f, 'ottenuto') != null ? code(detail(f, 'ottenuto'), { label: 'Ottenuto', tone: 'ko' }) : ''}</div>`).join('')}
        ${detail(fails[0], 'messaggio') ? `<details style="margin-top:8px"><summary class="muted" style="cursor:pointer;font-size:12.5px">Messaggio di NUnit</summary>${code(detail(fails[0], 'messaggio'), { plain: true })}</details>` : ''}
        <div class="stop">${ic('stop')}${fails.length > 1 ? `${fails.length} verifiche fallite in questo passo (Assert.Multiple): il test ha proseguito fino alla fine del blocco.` : 'Il test si è fermato qui.'}</div></div>`;
    } else if (a.crashed) {
      body += `<div class="step-fail">${code(t.message || '', { label: 'Errore del test', tone: 'ko', plain: true })}<div class="stop">${ic('stop')}Il test si è interrotto dopo questa azione, fuori da una verifica.</div></div>`;
    }
    if (a.head && a.head.kind === 'request') {
      const headers = [a.head.text.split(' · ')[0], ...a.head.details.filter(d => d.key !== 'corpo').map(d => `${d.key}: ${d.value}`)].join('\n');
      body += `<div class="io"><div>${code(headers, { label: 'Richiesta', plain: true })}${detail(a.head, 'corpo') != null ? code(detail(a.head, 'corpo'), { label: 'Corpo della richiesta' }) : ''}</div>
        <div>${res ? code([res.text, ...res.details.filter(d => d.key !== 'corpo').map(d => `${d.key}: ${d.value}`)].join('\n'), { label: 'Risposta', plain: true }) : ''}${res && detail(res, 'corpo') != null ? code(detail(res, 'corpo'), { label: 'Corpo della risposta' }) : ''}</div></div>`;
    }
    a.logs.filter(s => detail(s, 'stack')).forEach(s => { body += `<div class="io" style="grid-template-columns:minmax(0,1fr)"><div>${code(s.text + '\n' + detail(s, 'stack'), { label: 'Log del sistema', tone: 'ko', plain: true })}</div></div>`; });
    // Allegati dell'azione e dei suoi passi (es. lo screenshot dopo un tap, o al fallimento di una verifica).
    const atts = [a.head, ...a.steps].filter(Boolean).flatMap(s => s.attachments || []);
    if (atts.length) body += `<div class="step-atts">${attachmentsHtml(atts)}</div>`;
    return `<details class="step ${cls} ${a.head && a.head.kind === 'action' ? 'is-action' : ''} ${nested ? 'nested' : ''}" ${cls === 'failed' ? 'open' : ''}><summary>
      <span class="step-n">${a.head ? a.n : (nested ? '✓' : 0)}</span>
      <span class="step-t"><span class="step-title">${esc(title)}</span>${sub ? `<span class="step-sub">${esc(sub)}</span>` : ''}</span>
      ${status ? `<span class="http s${esc(status[0])}">${esc(status)}</span>` : ''}
      <span class="step-time" title="dall'inizio del test: +${Math.round(start)} ms">${esc(dur(Math.max(0, next - start)))}</span>${ic('chevDown', 'chev')}</summary>${body}</details>`;
  }

  function historyPanel(t, hist, runIdx) {
    if (!hist) return '<div class="empty">Nessuno storico per questo test.</div>';
    const cells = runs.map((r, k) => {
      const s = hist.st[k] || '-';
      const cls = s === '-' ? 'x' : s;
      const tip = `${dt(r.start)} · build ${r.build} · ${s === 'P' ? 'superato' : s === 'F' ? 'fallito' : s === '-' ? 'assente' : 'altro'}${hist.d[k] != null ? ' · ' + dur(hist.d[k]) : ''}`;
      return s === '-' ? `<span class="${cls}" title="${esc(tip)}"></span>`
        : `<a class="${cls} ${k === runIdx ? 'current' : ''}" href="#/run/${encodeURIComponent(r.id)}/test/${encodeURIComponent(t.key)}" title="${esc(tip)}"></a>`;
    }).join('');
    // Per build: esiti delle esecuzioni, dalla più recente.
    const groups = idx.builds.slice().reverse().map(b => {
      const rows = b.runs.slice().reverse().map(id => { const k = runs.findIndex(r => r.id === id); return { r: runs[k], k, s: hist.st[k] }; }).filter(x => x.s && x.s !== '-');
      if (!rows.length) return '';
      const p = rows.filter(x => x.s === 'P').length, f = rows.filter(x => x.s === 'F').length;
      const flaky = p && f;
      return `<div class="hist-build"><div class="hist-build-h">${ic('layers')}<b>${esc(b.build)}</b><span class="muted">${esc(b.version || '')}</span>
          <span style="margin-left:auto">${p ? `<span class="count ok">${p}</span> ` : ''}${f ? `<span class="count ko">${f}</span>` : ''}${flaky ? ' <span class="badge c-flaky">instabile</span>' : ''}</span></div>
        ${rows.map(x => `<a class="hist-row ${x.k === runIdx ? 'current' : ''}" href="#/run/${encodeURIComponent(x.r.id)}/test/${encodeURIComponent(t.key)}">
          ${statusIcon(x.s === 'P' ? 'passed' : x.s === 'F' ? 'failed' : 'skipped')}<span>${esc(dt(x.r.start))}</span><span class="muted">${esc(dur(hist.d[x.k]))}</span></a>`).join('')}</div>`;
    }).join('');
    return `<section class="card"><h3 class="card-h">${ic('history')}Esito nelle esecuzioni<span class="note">dalla più vecchia</span></h3><div class="strip">${cells}</div></section>
      <div class="hist">${groups}</div>`;
  }

  function infoPanel(t, run) {
    const rows = [['Chiave', t.key], ['Classe', t.className], ['Metodo', t.method], ['Argomenti', t.arguments], ['Inizio', dt(t.start)], ['Fine', dt(t.end)], ['Durata', dur(t.durationMs)]].filter(x => x[1]);
    const sut = run.sut || {};
    const env = [['Sistema', sut.name], ['Build', sut.build], ['Versione', sut.version], ['Commit', sut.commit], ['Ambiente', sut.environment], ['Macchina', run.machine], ['Framework', run.framework]].filter(x => x[1]);
    const dl = rs => `<dl class="dl">${rs.map(([k, v]) => `<dt>${esc(k)}</dt><dd class="${/Chiave|Classe|Metodo|Build|Commit/.test(k) ? 'mono' : ''}">${esc(v)}</dd>`).join('')}</dl>`;
    return `<div class="grid grid-2"><section class="card"><h3 class="card-h">${ic('info')}Test</h3>${dl(rows)}</section>
      <section class="card"><h3 class="card-h">${ic('server')}Ambiente</h3>${dl(env)}</section></div>
      ${t.message ? `<section class="card"><h3 class="card-h">${ic('ko')}Messaggio</h3>${code(t.message, { plain: true, tone: 'ko' })}</section>` : ''}
      ${t.stackTrace ? `<section class="card"><h3 class="card-h">${ic('list')}Stack trace del test</h3>${code(t.stackTrace, { plain: true })}</section>` : ''}`;
  }

  /** Schede dentro <paramref>root</paramref>; la scelta resta in sessionStorage sotto <paramref>key</paramref>. */
  function initTabs(root, key, def) {
    const tabs = [...root.querySelectorAll('.tab')];
    if (!tabs.length) return;
    const show = (k, remember) => {
      if (!tabs.some(t => t.dataset.tab === k)) k = tabs[0].dataset.tab;
      tabs.forEach(t => { t.classList.toggle('active', t.dataset.tab === k); t.setAttribute('aria-selected', String(t.dataset.tab === k)); });
      root.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== k; });
      if (remember) store.set(key, k);
    };
    tabs.forEach(t => t.addEventListener('click', () => show(t.dataset.tab, true)));
    show(store.get(key, def), false);
  }

  /** Test precedente/successivo nell'ordine dell'albero con i filtri attuali (tutte le pagine). */
  function initTestNav() {
    const el = document.getElementById('test-nav');
    const order = window.__qaOrder || [];
    const i = order.findIndex(li => li.classList.contains('selected'));
    if (!el || i < 0) return;
    const href = li => li ? li.querySelector('a').getAttribute('href') : null;
    const btn = (li, icon, label) => li ? `<a class="icon-btn small" href="${href(li)}" title="${label}">${ic(icon)}</a>` : `<span class="icon-btn small" aria-disabled="true" style="opacity:.35">${ic(icon)}</span>`;
    el.innerHTML = `${btn(order[i - 1], 'chevLeft', 'Test precedente (Alt+←)')}<span class="t-nav-pos">${i + 1}/${order.length}</span>${btn(order[i + 1], 'chevRight', 'Test successivo (Alt+→)')}`;
  }

  /** Frecce per l'esecuzione precedente e successiva (restando sullo stesso test, se c'è). */
  function runStepper(run, sel) {
    const i = runs.findIndex(r => r.id === run.id);
    const link = r => `#/run/${encodeURIComponent(r.id)}${sel ? '/test/' + encodeURIComponent(sel.test.key) : ''}`;
    const prev = runs[i - 1], next = runs[i + 1];
    const btn = (r, icon, label) => r
      ? `<a class="step-btn" href="${link(r)}" title="${esc(label)}: ${esc(dt(r.start))} · build ${esc(r.build)}">${icon === 'chevLeft' ? ic(icon) : ''}<span>${esc(label)}</span>${icon === 'chevRight' ? ic(icon) : ''}</a>`
      : `<span class="step-btn disabled">${icon === 'chevLeft' ? ic(icon) : ''}<span>${esc(label)}</span>${icon === 'chevRight' ? ic(icon) : ''}</span>`;
    return `<div class="stepper">${btn(prev, 'chevLeft', 'Precedente')}<span class="stepper-pos">${i + 1} di ${runs.length}</span>${btn(next, 'chevRight', 'Successiva')}</div>`;
  }

  // ================================================================== router e azioni globali

  function route() {
    if (!idx || !runs.length) { app.innerHTML = '<div class="empty">Nessuna esecuzione nello storico: lancia i test e rigenera il report.</div>'; return; }
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query] = raw.split('?');
    const params = new URLSearchParams(query || '');
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    // ?period=sprint|month|year|all nell'indirizzo: link condivisibile con il periodo scelto.
    if (params.has('period')) store.set('qa:period', params.get('period'));
    if (parts[0] === 'builds') return renderBuilds();
    if (parts[0] === 'run') return renderRun(parts[1] || latest().id, parts[2] === 'test' ? parts.slice(3).join('/') : null, params);
    renderHome();
  }

  document.addEventListener('click', async e => {
    const copy = e.target.closest('.copy');
    if (copy) {
      const pre = copy.parentElement.querySelector('pre');
      try { await navigator.clipboard.writeText(pre.innerText); copy.innerHTML = ic('check'); setTimeout(() => { copy.innerHTML = ic('copy'); }, 1200); }
      catch { toast('Copia non riuscita'); }
      return;
    }
    const copyText = e.target.closest('[data-copy-text]');
    if (copyText) {
      try { await navigator.clipboard.writeText(copyText.dataset.copyText); toast('Copiato'); } catch { toast('Copia non riuscita'); }
      return;
    }
    const per = e.target.closest('[data-period]');
    if (per) {
      store.set('qa:period', per.dataset.period);
      const path = (location.hash || '#/').split('?')[0];
      history.replaceState(null, '', `${location.pathname}${location.search}${path}?period=${per.dataset.period}`);
      route();
      return;
    }
    const del = e.target.closest('[data-delete-run]');
    if (del) { confirmDelete(runById(del.dataset.deleteRun)); return; }
    const thumb = e.target.closest('[data-lb]');
    if (thumb) { openViewer(thumb); return; }
    const steps = e.target.closest('[data-steps]');
    if (steps) document.querySelectorAll('.tree-steps details').forEach(d => { d.open = steps.dataset.steps === 'open'; });
  });
  // ------------------------------------------------------------------ eliminazione di un'esecuzione

  /**
   * Il pulsante c'è solo quando il report è servito da "qareport serve" (api/info risponde):
   * aperto da file, da IIS o da un Blob Storage il sito resta di sola lettura.
   */
  const serverInfo = location.protocol.startsWith('http')
    ? fetch('api/info', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    : Promise.resolve(null);

  function confirmDelete(run) {
    if (!run) return;
    serverInfo.then(info => {
      const only = runs.filter(r => r.build === run.build).length === 1;
      const back = document.activeElement;
      const el = document.createElement('div');
      el.className = 'modal-back';
      el.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="del-h" aria-describedby="del-d">
        <h2 class="modal-h" id="del-h">${ic('trash')}Eliminare l'esecuzione?</h2>
        <div id="del-d">
          <p>L'esecuzione del <b>${esc(dt(run.start))}</b> sulla build <b class="mono">${esc(run.build)}</b> (${run.counts.passed}/${run.counts.total} superati) viene tolta dallo storico insieme ai suoi allegati, e il report viene rigenerato.</p>
          ${only ? `<p>È l'unica esecuzione della build <b class="mono">${esc(run.build)}</b>: la build sparisce e la build successiva sarà confrontata con quella precedente.</p>` : ''}
          <p class="modal-warn">${ic('stop')}L'operazione non si può annullare.</p>
        </div>
        <label class="modal-field">Per confermare scrivi <b>ELIMINA</b><input id="del-confirm" autocomplete="off" spellcheck="false"></label>
        ${info && info.keyRequired ? '<label class="modal-field">Chiave di amministrazione del report<input id="del-key" type="password" autocomplete="off"></label>' : ''}
        <div class="modal-err" role="alert" hidden></div>
        <div class="modal-actions"><button type="button" class="btn" data-m="cancel">Annulla</button>
          <button type="button" class="btn danger" data-m="ok" disabled>${ic('trash')}Elimina definitivamente</button></div></div>`;
      const close = () => { el.remove(); document.removeEventListener('keydown', onKey, true); if (back && back.focus) back.focus(); };
      const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
      const input = el.querySelector('#del-confirm'), ok = el.querySelector('[data-m=ok]'), err = el.querySelector('.modal-err');
      input.addEventListener('input', () => { ok.disabled = input.value.trim() !== 'ELIMINA'; });
      el.addEventListener('click', async e => {
        if (e.target === el || e.target.closest('[data-m=cancel]')) return close();
        if (!e.target.closest('[data-m=ok]') || ok.disabled) return;
        ok.disabled = true;
        err.hidden = true;
        const key = el.querySelector('#del-key');
        try {
          const r = await fetch(`api/runs/${encodeURIComponent(run.id)}`, { method: 'DELETE', headers: key && key.value ? { 'X-QaReport-Key': key.value } : {} });
          if (!r.ok) throw new Error(r.status === 403 ? 'Non autorizzato: chiave mancante o errata.' : r.status === 404 ? 'Esecuzione non trovata nello storico.' : r.status === 409 ? 'È l\'unica esecuzione dello storico: non si può eliminare.' :`Errore ${r.status}`);
          location.hash = '#/';
          location.reload();
        } catch (ex) {
          err.textContent = ex.message;
          err.hidden = false;
          ok.disabled = input.value.trim() !== 'ELIMINA';
        }
      });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(el);
      input.focus();
    });
  }

  // ------------------------------------------------------------------ visore a tutto schermo

  let viewer = null;

  /** Immagini e video del pannello visibile, a tutto schermo, con ← → tra un allegato e l'altro. */
  function openViewer(btn) {
    const scope = btn.closest('.panel:not([hidden])') || btn.closest('.detail') || document;
    const items = [...scope.querySelectorAll('[data-lb]')].filter((b, i, all) => all.findIndex(x => x.dataset.lb === b.dataset.lb) === i);
    let i = Math.max(0, items.findIndex(b => b.dataset.lb === btn.dataset.lb));
    const back = document.activeElement;
    const el = document.createElement('div');
    el.className = 'viewer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Allegato');
    el.innerHTML = `<div class="viewer-bar"><span class="viewer-cap break"></span><span class="viewer-pos"></span>
        <a class="icon-btn small" data-v="open" target="_blank" rel="noopener" title="Apri in una nuova scheda">${ic('external')}</a>
        <a class="icon-btn small" data-v="dl" download title="Scarica">${ic('download')}</a>
        <button type="button" class="icon-btn small" data-v="close" title="Chiudi (Esc)">${ic('x')}</button></div>
      <div class="viewer-stage"></div>
      <button type="button" class="viewer-nav prev" data-v="prev" title="Precedente (←)">${ic('chevLeft')}</button>
      <button type="button" class="viewer-nav next" data-v="next" title="Successivo (→)">${ic('chevRight')}</button>`;
    const show = () => {
      const b = items[i], url = b.dataset.lb;
      el.querySelector('.viewer-stage').innerHTML = b.dataset.lbType === 'video'
        ? `<video src="${esc(url)}" controls autoplay playsinline></video>` : `<img src="${esc(url)}" alt="${esc(b.dataset.lbCap)}">`;
      el.querySelector('.viewer-cap').textContent = b.dataset.lbCap;
      el.querySelector('.viewer-pos').textContent = items.length > 1 ? `${i + 1}/${items.length}` : '';
      el.querySelector('[data-v=open]').href = url;
      el.querySelector('[data-v=dl]').href = url;
      el.querySelector('.prev').hidden = i === 0;
      el.querySelector('.next').hidden = i === items.length - 1;
    };
    const close = () => {
      el.remove();
      document.documentElement.classList.remove('viewer-open');
      viewer = null;
      if (back && back.focus) back.focus();
    };
    const go = d => { if (items[i + d]) { i += d; show(); } };
    el.addEventListener('click', e => {
      const v = e.target.closest('[data-v]');
      if (v && v.dataset.v === 'close') close();
      else if (v && v.dataset.v === 'prev') go(-1);
      else if (v && v.dataset.v === 'next') go(1);
      else if (e.target === el || e.target.classList.contains('viewer-stage')) close();
    });
    viewer = { close, go };
    document.body.appendChild(el);
    document.documentElement.classList.add('viewer-open');
    show();
    el.querySelector('[data-v=close]').focus();
  }

  document.addEventListener('keydown', e => {
    if (viewer) {
      if (e.key === 'Escape') { e.preventDefault(); viewer.close(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); viewer.go(e.key === 'ArrowLeft' ? -1 : 1); }
      return;
    }
    const typing = /INPUT|SELECT|TEXTAREA/.test((document.activeElement || {}).tagName || '');
    if (e.key === '/' && !typing) { const q = document.getElementById('q'); if (q) { e.preventDefault(); q.focus(); q.select(); } }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const nav = document.querySelectorAll('#test-nav a.icon-btn');
      const target = [...nav].find(a => a.title.startsWith(e.key === 'ArrowLeft' ? 'Test precedente' : 'Test successivo'));
      if (target) { e.preventDefault(); location.hash = target.getAttribute('href'); }
    }
  });

  if (idx) initChrome();
  window.addEventListener('hashchange', route);
  route();
})();
