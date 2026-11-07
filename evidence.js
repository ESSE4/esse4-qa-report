/*
 * Evidenza di un test: un unico file di testo (.txt) con tutto quello che il test ha fatto, in
 * ordine, da conservare come testimonianza. È lo stesso testo mostrato nella scheda "Allegati".
 *
 *   QAEvidence.build({ test, run, change, index })     restituisce il testo (Promise<string>)
 *   QAEvidence.download({ test, run, change, index })  costruisce il file e lo fa scaricare
 *   QAEvidence.fileName(test, run)                     nome del file proposto
 *
 * test   QaTest del modello (JSON camelCase)
 * run    elemento di QA.index.runs (id, start, version, sut, machine, framework…)
 * change cambiamento rispetto alla versione precedente (facoltativo)
 * index  QA.index (title, defectLinks)
 *
 * Gli allegati di testo (JSON, XML, log…) entrano per intero nel file: quelli con un file nel sito
 * (url) si leggono con fetch. Immagini, video e altri file binari non stanno in un testo: restano
 * nome, tipo, dimensione e percorso nel report. I dati arrivano già mascherati dal generatore.
 */
(function (root) {
  'use strict';

  /** Oltre questa dimensione un allegato di testo non si include (restano nome e dimensione). */
  const MAX_TEXT = 5 * 1024 * 1024;
  const WIDTH = 78;

  // ================================================================== utilità

  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const validDate = s => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; };
  const dt = s => { const d = validDate(s); return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` : '—'; };
  const clock = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
  const num = (v, dec = 0) => {
    const [i, f] = Math.abs(v).toFixed(dec).split('.');
    return (v < 0 ? '-' : '') + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (f ? ',' + f : '');
  };
  const dur = ms => ms == null ? '—' : ms < 1000 ? `${num(ms, ms < 10 ? 1 : 0)} ms` : ms < 60000 ? `${num(ms / 1000, 1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
  const size = b => b == null || b === '' ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${num(b / 1024, 1)} KB` : `${num(b / 1048576, 1)} MB`;
  const detail = (s, k) => { const d = s && s.details && s.details.find(x => x.key === k); return d ? d.value : null; };
  const allSteps = steps => (steps || []).flatMap(s => [s, ...allSteps(s.steps)]);
  const safeUrl = u => typeof u === 'string' && /^(https?:\/\/|mailto:)/i.test(u.trim()) ? u.trim() : null;
  const oneLine = s => String(s ?? '').replace(/\s*\r?\n\s*/g, ' ').trim();

  const STATUS = {
    passed: 'Superato', failed: 'Fallito', blocked: 'Bloccato', inconclusive: 'Inconcludente', ignored: 'Ignorato',
  };
  const statusOf = s => STATUS[s] ? s : s === 'skipped' ? 'ignored' : 'inconclusive';

  function tryJson(text) {
    const t = String(text).trim();
    if (t.length < 2 || !((t[0] === '{' && t.endsWith('}')) || (t[0] === '[' && t.endsWith(']')))) return null;
    try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return null; }
  }
  /** Testo con l'eventuale JSON (anche in coda: "500 Errore · {…}") indentato. */
  function pretty(text) {
    if (text == null) return '';
    text = String(text);
    const whole = tryJson(text);
    if (whole) return whole;
    for (const sep of [' · {', ' · [', ': {', ': [']) {
      const i = text.indexOf(sep);
      if (i >= 0) {
        const tail = tryJson(text.slice(i + sep.length - 1));
        if (tail) return text.slice(0, i) + '\n' + tail;
      }
    }
    return text;
  }

  /** Titolo di sezione sottolineato. */
  const section = title => {
    const i = title.indexOf(' (');   // "Cronologia (110 passi…)": maiuscolo solo il nome
    const t = i > 0 ? title.slice(0, i).toUpperCase() + title.slice(i) : title.toUpperCase();
    return `\n\n${t}\n${'='.repeat(Math.min(WIDTH, t.length))}\n`;
  };
  /** Righe "chiave: valore" allineate. */
  function kv(rows, indent = '') {
    rows = rows.filter(r => r && r[1] != null && r[1] !== '');
    if (!rows.length) return '';
    const w = Math.min(22, Math.max(...rows.map(r => String(r[0]).length)) + 1);
    return rows.map(([k, v]) => {
      const lines = String(v).split(/\r?\n/);
      const head = `${indent}${(k + ':').padEnd(w + 1)}`;
      return head + lines[0] + lines.slice(1).map(l => '\n' + ' '.repeat(head.length) + l).join('');
    }).join('\n') + '\n';
  }
  /** Blocco di testo (corpo, messaggio, stack) rientrato, con un'etichetta. */
  function block(label, text, indent, raw) {
    const body = (raw ? String(text) : pretty(text)).replace(/\r\n/g, '\n').split('\n');
    return `${indent}${label}:\n${body.map(l => `${indent}  | ${l}`).join('\n')}\n`;
  }

  // ================================================================== allegati

  const isText = a => /^text\/|json|xml|html|csv|yaml|javascript/i.test(a.type || '') && !/svg/i.test(a.type || '');
  const fromFile = () => { try { return root.location && root.location.protocol === 'file:'; } catch { return false; } };

  /** Contenuto di un allegato per il testo: { text } oppure { note } se non si include. */
  async function resolveAttachment(a, fetchFn) {
    if (a.content != null) return { text: String(a.content) };
    if (!isText(a)) return { note: `file binario, non incluso nel testo${a.url ? `: nel report in ${a.url}` : ''}` };
    if (!a.url) return { note: 'non incluso: il file non è stato copiato nello storico del report' };
    if (a.sizeBytes > MAX_TEXT) return { note: `non incluso: ${size(a.sizeBytes)}, oltre il limite di ${size(MAX_TEXT)}; nel report in ${a.url}` };
    if (typeof fetchFn !== 'function') return { note: `non incluso: il browser non permette di leggere il file (${a.url})` };
    try {
      const res = await fetchFn(a.url);
      if (!res || res.ok === false) throw new Error(`risposta ${res ? res.status : 'assente'}`);
      return { text: await res.text() };
    } catch (e) {
      return {
        note: `non incluso: il file non è leggibile da questa pagina (${e && e.message ? e.message : e})` +
          (fromFile() ? '; il report è aperto da file://, aprilo da un server web (anche locale)' : ''),
      };
    }
  }
  const attMeta = (a, r) => [a.type, size(a.sizeBytes || (r && r.text != null ? r.text.length : null))].filter(Boolean).join(', ');

  // ================================================================== cronologia

  const KIND = {
    step: 'STEP', action: 'AZIONE', request: 'RICHIESTA', response: 'RISPOSTA', check: 'VERIFICA',
    log: 'LOG', data: 'DATI', note: 'NOTA',
  };

  function when(ctx, ms) {
    if (ms == null) return '';
    return `+${dur(ms)}${ctx.t0 ? ` (${clock(new Date(ctx.t0.getTime() + ms))})` : ''}`;
  }
  function otherDetails(s, skip, indent) {
    return kv((s.details || []).filter(d => !skip.includes(d.key)).map(d => [d.key, d.value]), indent);
  }
  function stepAttachments(s, n, ctx, indent) {
    return (s.attachments || []).map(a => {
      const r = ctx.resolved.get(a) || { note: 'non incluso' };
      // Il corpo di richiesta o risposta allegato anche come file: è già scritto nel passo.
      const corpo = detail(s, 'corpo');
      const same = r.text != null && corpo != null && pretty(r.text).trim() === pretty(corpo).trim();
      ctx.atts.push({ a, r, where: n, same });
      return `${indent}Allegato: ${a.name}${attMeta(a, r) ? ` (${attMeta(a, r)})` : ''} -> vedi ALLEGATI n. ${ctx.atts.length}\n`;
    }).join('');
  }

  function entry(s, ctx, last, depth) {
    const n = ++ctx.n;
    const kind = s.kind || 'note';
    const ind = '  '.repeat(depth), body = ind + '     ';
    const t = when(ctx, s.elapsedMs);
    let head = '', out = '';

    if (kind === 'step') {
      const st = statusOf(s.status || 'passed');
      head = `${s.text} [${STATUS[st].toUpperCase()}${s.durationMs != null ? `, ${dur(s.durationMs)}` : ''}]`;
      const exp = detail(s, 'atteso'), got = detail(s, 'ottenuto'), msg = detail(s, 'messaggio') || detail(s, 'errore');
      out += otherDetails(s, ['atteso', 'ottenuto', 'messaggio', 'errore'], body);
      if (exp != null) out += block('Atteso', exp, body);
      if (got != null) out += block('Ottenuto', got, body);
      if (msg) out += block('Messaggio', msg, body, true);
    } else if (kind === 'request') {
      const parts = String(s.text || '').split(' · ');
      head = parts[0];
      if (parts.length > 1) out += `${body}${parts.slice(1).join(' · ')}\n`;
      out += otherDetails(s, ['corpo'], body);
      const corpo = detail(s, 'corpo');
      if (corpo != null) out += block('Corpo della richiesta', corpo, body);
      const req = { n, text: parts[0], response: null };
      ctx.requests.push(req);
      last.current = req;
    } else if (kind === 'response') {
      const parts = String(s.text || '').split(' · ');
      head = parts[0] + (parts.length > 1 ? ` · ${parts.slice(1).join(' · ')}` : '');
      const req = last.current;
      if (req && !req.response) { req.response = { n, status: parts[0], info: parts.slice(1).join(' · ') }; out += `${body}risposta alla richiesta ${pad(req.n, 3)}\n`; }
      out += otherDetails(s, ['corpo'], body);
      const corpo = detail(s, 'corpo');
      if (corpo != null) out += block('Corpo della risposta', corpo, body);
    } else if (kind === 'check') {
      const ok = s.ok !== false;
      ctx.checks[ok ? 'ok' : 'ko']++;
      head = `${ok ? '[OK]' : '[KO]'} ${s.text}`;
      const exp = detail(s, 'atteso'), got = detail(s, 'ottenuto'), msg = detail(s, 'messaggio');
      if (exp != null) out += block('Atteso', exp, body);
      if (got != null) out += block('Ottenuto', got, body);
      if (msg) out += block('Messaggio', msg, body, true);
      out += otherDetails(s, ['atteso', 'ottenuto', 'messaggio'], body);
    } else if (kind === 'log') {
      const lvl = String(s.level || '').toUpperCase();
      head = `${lvl ? `[${lvl}] ` : ''}${s.text}`;
      const stack = detail(s, 'stack');
      if (stack) out += block('Stack trace', stack, body, true);
      out += otherDetails(s, ['stack'], body);
    } else {
      head = String(s.text ?? '');
      out += otherDetails(s, [], body);
    }
    out += stepAttachments(s, n, ctx, body);
    const label = (KIND[kind] || kind.toUpperCase()).padEnd(9);
    const line = `${ind}${pad(n, 3)}  ${label} ${oneLine(head)}${t ? `   ${t}` : ''}\n`;
    const kids = (s.steps || []).length ? renderSteps(s.steps, ctx, depth + 1) : '';
    return line + out + kids;
  }

  function renderSteps(steps, ctx, depth = 0) {
    const last = { current: null };   // per abbinare la risposta alla sua richiesta
    return (steps || []).map(s => entry(s, ctx, last, depth)).join('');
  }

  // ================================================================== intestazione

  function defectLink(d, index) {
    if (!d) return null;
    const own = safeUrl(d.url);
    if (own) return own;
    const dl = index && index.defectLinks;
    if (!dl) return null;
    const issue = dl.issues && dl.issues[d.id];
    if (issue) return safeUrl(typeof issue === 'string' ? issue : issue.url);
    return dl.urlTemplate ? safeUrl(dl.urlTemplate.replace(/\{id\}/g, encodeURIComponent(d.id))) : null;
  }
  function defectText(title, d, index) {
    return section(`${title} ${d.id}`) + kv([
      ['Titolo', d.title], ['Correzione', d.fix], ['File', (d.files || []).join('\n')], ['Issue', defectLink(d, index)],
    ]);
  }

  function changeText(c, test, run) {
    if (!c) return null;
    const base = run && run.diff && run.diff.baselineVersion;
    const v = run && (run.version || (run.sut && run.sut.version));
    let s = '';
    switch (c.change) {
      case 'regression': s = `Possibile regressione: passava sulla versione ${base || 'precedente'}, fallisce sulla ${v || 'attuale'}.`; break;
      case 'fixed': s = `Corretto: falliva sulla versione ${base || 'precedente'}, passa sulla ${v || 'attuale'}.`; break;
      case 'still-failing': s = `Ancora fallito${c.failingSinceVersion ? `: fallisce dalla versione ${c.failingSinceVersion}` : ''}.`; break;
      case 'unverified': s = `Non più verificato: passava sulla versione ${base || 'precedente'}, sulla ${v || 'attuale'} è ${(STATUS[statusOf(test.status)] || '').toLowerCase()}: la funzionalità non è più verificata.`; break;
      case 'new': s = `Test nuovo: non c'era nell'esecuzione di confronto${statusOf(test.status) === 'failed' ? ' e fallisce già alla prima' : ''}.`; break;
      case 'stable': s = `Nessun cambiamento rispetto alla versione ${base || 'precedente'}.`; break;
      default: s = c.change && c.change !== 'none' ? String(c.change) : '';
    }
    if (c.flaky) s += `${s ? ' ' : ''}Instabile: sulla versione ${v || 'attuale'} ha dato esiti diversi tra un'esecuzione e l'altra.`;
    return s || null;
  }

  function outcome(t) {
    const st = statusOf(t.status);
    let h;
    if (st === 'passed') h = 'Il test è stato superato.';
    else if (st === 'failed') h = 'Il test è fallito.';
    else if (st === 'blocked') h = 'Il test è bloccato da un difetto noto già dimostrato da un altro test: non arriva a verificare la sua funzionalità e non conta tra i falliti.';
    else if (st === 'inconclusive') h = 'Il test non ha potuto concludere la verifica (Assert.Inconclusive o un\'assunzione non soddisfatta): non conta né tra i superati né tra i falliti.';
    else if ((t.steps || []).length) h = 'Il test ha eseguito dei passi (vedi la cronologia) ed è stato poi segnato come ignorato (Assert.Ignore): non conta né tra i superati né tra i falliti.';
    else h = 'Il test non è stato eseguito ([Ignore], Explicit o Assert.Ignore): non conta né tra i superati né tra i falliti.';
    h += '\n';
    if (t.message) h += block(st === 'failed' ? 'Messaggio d\'errore' : 'Motivo', t.message, '', true);
    if (t.stackTrace) h += block('Stack trace', t.stackTrace, '', true);
    return h;
  }

  // ================================================================== documento

  function fileName(test, run) {
    const t = test || {};
    let base = t.method || t.title || t.key || 'test';
    if (t.method && t.arguments) base += '_' + String(t.arguments).slice(0, 40);
    const clean = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const name = clean(base).slice(0, 90).replace(/_$/, '') || 'test';
    const id = clean((run && run.id) || '');
    return `evidenza_${name}${id ? '_' + id : ''}.txt`;
  }

  async function build({ test, run, change, index, fetch: fetchOpt } = {}) {
    if (!test) throw new Error('QAEvidence: manca il test.');
    const t = test, r = run || {}, sut = r.sut || {}, ix = index || {};
    const fetchFn = fetchOpt || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    const st = statusOf(t.status);

    // Allegati: tutti letti prima di scrivere (in parallelo, una volta per indirizzo).
    const every = allSteps(t.steps);
    const list = [...(t.attachments || []), ...every.flatMap(s => s.attachments || [])];
    const byUrl = new Map(), resolved = new Map();
    await Promise.all(list.map(async a => {
      let p;
      if (a.content == null && a.url) { p = byUrl.get(a.url); if (!p) { p = resolveAttachment(a, fetchFn); byUrl.set(a.url, p); } }
      else p = resolveAttachment(a, fetchFn);
      resolved.set(a, await p);
    }));

    const ctx = { n: 0, t0: validDate(t.start), resolved, atts: [], requests: [], checks: { ok: 0, ko: 0 } };
    const timeline = renderSteps(t.steps, ctx);
    (t.attachments || []).forEach(a => ctx.atts.push({ a, r: resolved.get(a) || {}, where: null }));
    const v = r.version || sut.version;

    const title = t.title || t.method || t.key;
    let out = `EVIDENZA DEL TEST\n${'#'.repeat(WIDTH)}\n${kv([
      ['Report', ix.title || 'Report dei test'],
      ['Test', title],
      ['Nome completo', t.key],
      ['Esito', STATUS[st].toUpperCase()],
      ['Versione', v || '—'],
      ['Durata', dur(t.durationMs)],
      ['Inizio', dt(t.start)],
      ['Fine', dt(t.end)],
      ['Classe', t.className],
      ['Metodo', t.method ? t.method + (t.arguments ? `(${t.arguments})` : '') : null],
      ['Categorie', (t.categories || []).join(', ')],
      ...Object.entries(t.properties || {}),
    ])}`;

    out += section('Sistema ed esecuzione') + kv([
      ['Sistema', sut.name || '—'], ['Versione', v || '—'], ['Branch', sut.branch],
      ...Object.entries(sut.extra || {}),
      ['Esecuzione', r.id ? r.id + (r.start ? ` (${dt(r.start)})` : '') : null],
      ['Framework', r.framework],
      ...Object.entries(r.properties || {}),
    ]);

    const ch = changeText(change, t, r);
    if (ch) out += section('Rispetto alla versione precedente') + ch + '\n';
    if (t.defect) out += defectText('Difetto noto', t.defect, ix);
    if (t.blockedBy) out += defectText(st === 'blocked' ? 'Bloccato da' : 'Non più bloccato da', t.blockedBy, ix);
    if ((t.parameters || []).length) out += section('Parametri') + kv(t.parameters.map(p => [p.key, p.value]));

    out += section('Esito') + outcome(t);

    if (ctx.n) {
      out += section('Riepilogo') + kv([
        ['Passi registrati', ctx.n],
        ['Richieste', ctx.requests.length],
        ['Verifiche', `${ctx.checks.ok + ctx.checks.ko}${ctx.checks.ko ? ` (${ctx.checks.ko} fallite)` : ''}`],
        ['Allegati', ctx.atts.length],
      ]);
    }
    if (ctx.requests.length) {
      out += section(`Richieste effettuate (${ctx.requests.length})`) + ctx.requests.map(q =>
        `${pad(q.n, 3)}  ${q.text}  ->  ${q.response ? `${q.response.status}${q.response.info ? ` · ${q.response.info}` : ''} (passo ${pad(q.response.n, 3)})` : 'nessuna risposta'}`).join('\n') + '\n';
    }
    if (timeline) out += section(`Cronologia (${ctx.n} passi, tempi dall'inizio del test)`) + timeline;

    if (ctx.atts.length) {
      out += section(`Allegati (${ctx.atts.length})`) + ctx.atts.map((x, i) => {
        const h = `${i + 1}. ${x.a.name}${attMeta(x.a, x.r) ? ` (${attMeta(x.a, x.r)})` : ''} · ${x.where ? `passo ${pad(x.where, 3)}` : 'del test'}\n`;
        if (x.same) return `${h}   uguale al corpo scritto nel passo ${pad(x.where, 3)}\n`;
        if (x.r && x.r.text != null) {
          const text = /json/i.test(x.a.type || '') || tryJson(x.r.text) ? pretty(x.r.text) : x.r.text;
          return `${h}----- inizio ${x.a.name} -----\n${text.replace(/\r\n/g, '\n').replace(/\n$/, '')}\n----- fine ${x.a.name} -----\n`;
        }
        return `${h}   ${(x.r && x.r.note) || 'non incluso'}\n`;
      }).join('\n');
    }

    out += `\n\n${'-'.repeat(WIDTH)}\nEvidenza generata da QaReport il ${dt(new Date())} dal report «${ix.title || 'Report dei test'}», esecuzione ${r.id || '—'}.\n`;
    return out;
  }

  /** Costruisce l'evidenza e la fa scaricare come file .txt. */
  async function download(args) {
    const text = await build(args);
    const name = fileName(args && args.test, args && args.run);
    const doc = root.document;
    // BOM: Blocco note e simili riconoscono subito l'UTF-8 (accenti).
    const blob = new root.Blob(['﻿', text], { type: 'text/plain;charset=utf-8' });
    const url = root.URL.createObjectURL(blob);
    const a = doc.createElement('a');
    a.href = url;
    a.download = name;
    a.style.display = 'none';
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => root.URL.revokeObjectURL(url), 60000);
    return name;
  }

  root.QAEvidence = { build, download, fileName };
})(typeof window !== 'undefined' ? window : globalThis);
