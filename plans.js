// QaReport — piano di rilascio e categoria del report.
//
// Indirizzi (la scelta sta nella query, il report resta negli indirizzi con "#"):
//   ?plan=<piano>&cat=<c>   il report di quel piano e categoria (app.js)
//   ?plan=<piano>           la prima categoria del piano con dei test
//   senza query             l'ultimo piano con delle esecuzioni
// Un indirizzo vecchio, senza piano (#/run/<id>/test/<chiave>), porta alla sua categoria: i link
// già scritti nelle issue continuano ad aprirsi.
(function () {
  'use strict';

  const QA = window.QA;
  const root = QA.plans;

  // Il loader copre il cambio di pagina: resta almeno LOADER_MIN_MS dal clic e, se i dati arrivano dopo,
  // finché non sono pronti. L'istante del clic passa alla pagina successiva in sessionStorage.
  const LOADER_MIN_MS = 500;
  const LOADER_KEY = 'qa:loader-from';
  QA.loader = (() => {
    const el = document.getElementById('page-loader');
    const remember = v => { try { if (v) sessionStorage.setItem(LOADER_KEY, String(v)); else sessionStorage.removeItem(LOADER_KEY); } catch { /* storage non disponibile */ } };
    let from = 0;
    try { from = Number(sessionStorage.getItem(LOADER_KEY)) || 0; } catch { /* storage non disponibile */ }
    let timer = 0;
    const finish = () => { el.classList.add('is-done'); from = 0; remember(0); };
    const api = {
      show() { clearTimeout(timer); from = Date.now(); remember(from); el.classList.remove('is-done'); },
      showIfHidden() { if (el.classList.contains('is-done')) api.show(); },
      hide() {
        if (QA.pickerMode || el.classList.contains('is-done')) return;
        clearTimeout(timer);
        timer = setTimeout(finish, from ? Math.max(0, LOADER_MIN_MS - (Date.now() - from)) : 0);
      },
    };
    // Tornando indietro il browser può ripristinare la pagina com'era, loader compreso.
    window.addEventListener('pageshow', e => { if (e.persisted) { clearTimeout(timer); finish(); } });
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // Una sezione già aperta non cambia indirizzo: niente hashchange, e il loader non si toglierebbe più.
      const section = e.target.closest('#topnav a');
      if (e.target.closest('#catnav a, #suitenav a') || (section && section.hash !== location.hash)) api.show();
    });
    return api;
  })();
  const query = new URLSearchParams(location.search);

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const planBySlug = slug => root.plans.find(p => p.slug === slug);
  const planName = p => p.title || (/^\d/.test(p.id) ? `Piano ${p.id}` : p.id);
  const firstCategory = p => p.categories.find(c => c.runs);

  // Sugli schermi stretti i selettori scorrono in orizzontale: la voce attiva deve restare in vista.
  QA.revealActive = nav => {
    const on = nav.querySelector('.active');
    if (on) nav.scrollLeft = on.offsetLeft - nav.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2;
  };

  // Le select di piano ed esecuzione: il valore resta nella <select> nascosta, il menu è nostro perché
  // l'elenco nativo si taglia alla larghezza del controllo e il suo aspetto non si può governare.
  const PICKER_VISIBLE = 4;
  const pickers = [];
  QA.syncPickers = () => pickers.forEach(update => update());
  function enhancePicker(select, placeholder) {
    const wrap = select.closest('.run-picker');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'picker-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', select.getAttribute('aria-label'));
    const menu = document.createElement('div');
    menu.className = 'picker-menu';
    menu.hidden = true;
    menu.innerHTML = `<input type="search" class="picker-search" placeholder="${esc(placeholder)}" aria-label="${esc(placeholder)}" autocomplete="off" />
      <div class="picker-list" role="listbox"></div><div class="picker-empty" hidden>Nessun risultato</div>`;
    wrap.append(btn, menu);
    const search = menu.querySelector('.picker-search');
    const list = menu.querySelector('.picker-list');
    const empty = menu.querySelector('.picker-empty');

    const update = () => { const o = select.selectedOptions[0]; btn.textContent = o ? o.textContent : ''; btn.title = btn.textContent; };
    const close = focus => { if (menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focus) btn.focus(); };
    const shown = () => [...list.children].filter(o => !o.hidden);

    // Al massimo PICKER_VISIBLE voci in vista a partire da "first", le altre scorrendo. L'altezza si misura
    // sulle voci mostrate (un titolo lungo può andare a capo), due volte perché la barra di scorrimento
    // può restringere il testo.
    const fitList = first => {
      list.style.maxHeight = '';
      const items = shown();
      if (items.length <= PICKER_VISIBLE) return;
      const last = items[first + PICKER_VISIBLE - 1];
      for (let pass = 0; pass < 2; pass++) list.style.maxHeight = `${last.offsetTop + last.offsetHeight - items[first].offsetTop}px`;
      list.scrollTop = items[first].offsetTop;
    };

    // Più parole si cercano insieme: "08/2026 2104" trova la data e la versione.
    const applyFilter = () => {
      const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      [...list.children].forEach(o => { o.hidden = !terms.every(t => o.dataset.search.includes(t)); });
      empty.hidden = shown().length > 0;
      fitList(0);
    };

    const open = () => {
      list.innerHTML = [...select.options].map((o, i) => `<button type="button" role="option" class="picker-opt${o.selected ? ' is-selected' : ''}" data-i="${i}" data-search="${esc((o.dataset.search || o.textContent).toLowerCase())}" aria-selected="${o.selected}"${o.disabled ? ' disabled' : ''}>${esc(o.textContent)}</button>`).join('');
      search.value = '';
      empty.hidden = true;
      Object.assign(menu.style, { left: '0', right: 'auto', width: '' });
      list.style.maxHeight = '';
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      // Prima sotto il controllo; se esce a destra si allinea al suo bordo destro; se non basta, dentro lo schermo.
      const fits = () => { const r = menu.getBoundingClientRect(); return r.left >= 8 && r.right <= innerWidth - 8; };
      if (!fits()) { menu.style.left = 'auto'; menu.style.right = '0'; }
      if (!fits()) { menu.style.right = 'auto'; menu.style.left = `${8 - wrap.getBoundingClientRect().left}px`; }
      // La larghezza resta quella dell'elenco completo: filtrando il menu non si restringe.
      menu.style.width = `${menu.getBoundingClientRect().width}px`;
      const items = [...list.children];
      const selected = Math.max(0, items.findIndex(o => o.classList.contains('is-selected')));
      fitList(Math.max(0, Math.min(selected - 1, items.length - PICKER_VISIBLE)));
      // Sui telefoni il cursore nella casella aprirebbe subito la tastiera sopra l'elenco.
      const target = matchMedia('(pointer: fine)').matches ? search : (list.querySelector('.is-selected') || btn);
      target.focus({ preventScroll: true });
    };

    const choose = opt => {
      if (Number(opt.dataset.i) === select.selectedIndex) { close(true); return; }
      QA.loader.show();
      select.selectedIndex = Number(opt.dataset.i);
      update();
      close(true);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    btn.addEventListener('click', () => { if (menu.hidden) open(); else close(true); });
    search.addEventListener('input', applyFilter);
    list.addEventListener('click', e => {
      const opt = e.target.closest('.picker-opt');
      if (opt && !opt.disabled) choose(opt);
    });
    menu.addEventListener('keydown', e => {
      const items = shown().filter(o => !o.disabled);
      const at = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') close(false);
      else if (e.key === 'Enter' && document.activeElement === search) { e.preventDefault(); if (items[0]) choose(items[0]); }
      else if (e.key === 'ArrowDown' && items[at + 1]) { e.preventDefault(); items[at + 1].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); (at > 0 ? items[at - 1] : search).focus(); }
    });
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(false); });
    pickers.push(update);
    update();
  }

  if (QA.scope) {
    const plan = planBySlug(QA.scope.plan);
    const current = plan && plan.categories.find(c => c.slug === QA.scope.cat);
    if (!QA.index || !current) { location.replace(location.pathname + (plan ? `?plan=${plan.slug}` : '')); return; }

    const asset = (root.nav || []).find(n => n.active);
    // Un nome che dice già "Rilascio" non lo ripete; un piano senza titolo si chiama con la sua versione.
    const release = /^rilascio\b/i.test(plan.title || '') ? plan.title : `Rilascio ${plan.title || plan.id}`;
    QA.heading = { title: `Esiti di ${current.label.toLowerCase()}`, detail: asset ? `${release} · ${asset.label}` : release };

    // Cambiando categoria si resta sulla stessa pagina, se l'esecuzione aperta c'è anche lì.
    const hashFor = cat => {
      const m = location.hash.match(/^#\/run\/([^/?]+)/);
      if (!m) return location.hash;
      const where = root.runScopes[decodeURIComponent(m[1])];
      return where && where.plan === plan.slug && where.categories.includes(cat.slug) ? location.hash : '';
    };
    const categories = document.getElementById('catnav');
    const categoryItem = c => {
      if (c.slug === current.slug) return `<span class="active" aria-current="page">${esc(c.label)}</span>`;
      if (!c.runs) return `<span class="disabled" aria-disabled="true" title="Nessun test in questa categoria per questo piano">${esc(c.label)}</span>`;
      return `<a href="?plan=${esc(plan.slug)}&cat=${esc(c.slug)}${esc(hashFor(c))}">${esc(c.label)}</a>`;
    };
    const paint = () => { categories.innerHTML = plan.categories.map(categoryItem).join(''); QA.revealActive(categories); };

    const option = p => `<option value="${esc(p.slug)}" data-search="${esc(`${planName(p)} ${p.id}`)}"${p === plan ? ' selected' : ''}${p.runs ? '' : ' disabled'}>${esc(planName(p))}${p.runs ? '' : ' · nessuna esecuzione'}</option>`;
    const picker = document.getElementById('plan-picker');
    picker.innerHTML = root.plans.map(option).join('');
    picker.addEventListener('change', e => { QA.loader.show(); location.href = `${location.pathname}?plan=${e.target.value}`; });
    picker.closest('.run-picker').hidden = false;
    enhancePicker(picker, 'Cerca un piano');
    enhancePicker(document.getElementById('run-picker'), 'Cerca per data o versione');
    categories.hidden = false;
    paint();
    window.addEventListener('hashchange', paint);
    return;
  }

  // ------------------------------------------------------------------ nessuna scelta nell'indirizzo

  QA.pickerMode = true;
  document.getElementById('topnav').style.display = 'none';
  document.getElementById('run-picker').closest('.run-picker').style.display = 'none';

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

  QA.renderPicker = async function () {
    if (await followOldLink()) return;
    const plan = planBySlug(query.get('plan')) || root.plans.find(p => p.runs);
    location.replace(`?plan=${plan.slug}&cat=${firstCategory(plan).slug}`);
  };
})();
