/*
 * Holds shared UI state, folds the packet and ledger into a view model, and renders evidence.
 * It provides tracing, source-document adapters, and reusable controls for the view modules.
 * Loaded after core.js and before the route-specific views.
 */
const CLOCKS = [
  ...P.timeline.map((t) => ({
    at: t.at,
    label: `${dshort(t.at)} ${t.event.replace(/_/g, ' ')}`,
    id: t.id
  }))
].sort((a, b) => (a.at < b.at ? -1 : 1));
const UI = {
  actor: localStorage.getItem('wp.actor') || 'st-01',
  clock: localStorage.getItem('wp.clock') || '2026-07-01T17:00:00Z',
  route: location.hash.slice(1) || 'overview',
  drawer: null,
  sel: new Set(),
  filters: { kind: 'open' },
  salesFilter: { box: 'all', q: '', flag: 'all', page: 0 },
  revealed: new Set(),
  sandbox: new Set(),
  search: ''
};
function setActor(a) {
  UI.actor = a;
  localStorage.setItem('wp.actor', a);
  if (PERSON[a].role === 'client' && !UI.route.startsWith('client')) go('client');
  else if (PERSON[a].role !== 'client' && UI.route.startsWith('client')) go('overview');
  render();
}
function setClock(c) {
  UI.clock = c;
  localStorage.setItem('wp.clock', c);
  render();
}
const docVisible = (id) => !!IDX.doc[id] && IDX.doc[id].received_at <= UI.clock;
function versionAt() {
  let v = 'v1';
  for (const r of P.return_versions) if (r.computed_at <= UI.clock) v = r.version;
  return v;
}
function go(r) {
  location.hash = r;
}
window.addEventListener('hashchange', () => {
  UI.route = location.hash.slice(1) || 'overview';
  UI.sel.clear();
  render();
  $('main')?.scrollTo(0, 0);
});

/* The model: everything a view needs, derived fresh from packet + ledger */
function model() {
  const vk = versionAt(),
    V = IDX.versions[vk],
    L = IDX.lines[vk];
  const S = derive();
  const std = S.standards || P.firm.starter_standards;
  const checks = runChecks(vk);
  const adjs = Object.values(S.adj);
  const live = adjs.filter((a) => a.status === 'active');
  const byLine = {};
  adjs.filter((a) => a.status !== 'reversed').forEach((a) => (byLine[a.line] ||= []).push(a));
  const fx = live.reduce(
    (t, a) => {
      const e = effect(a, vk);
      t.fed += e.fed;
      t.ca += e.ca;
      t.fedPay += e.fedPay;
      t.caPay += e.caPay;
      return t;
    },
    { fed: 0, ca: 0, fedPay: 0, caPay: 0 }
  );
  const fs = V.summary.federal,
    cs = V.summary.california;
  const wp = {
    fed: {
      total_tax: fs.total_tax + fx.fed,
      payments: fs.payments + fx.fedPay,
      balance_due: fs.balance_due + fx.fed - fx.fedPay,
      agi: fs.agi,
      penalty: fs.penalty
    },
    ca: {
      total_tax: cs.total_tax + fx.ca,
      payments: cs.payments + fx.caPay,
      balance_due: cs.balance_due + fx.ca - fx.caPay
    }
  };
  checks.forEach((f) => {
    const mine = adjs.filter((a) => a.findingId === f.id && a.status !== 'reversed');
    f.status =
      f.kind === 'pass'
        ? 'pass'
        : mine.length
          ? mine.some((a) => a.status === 'pending_partner')
            ? 'pending'
            : 'accepted'
          : S.dismissed[f.id]
            ? 'dismissed'
            : S.judgments['j-' + f.id]
              ? 'decided'
              : 'open';
    f.eff = f.adj.reduce(
      (t, a) => {
        const e = effect(a, vk);
        t.fed += e.fed;
        t.ca += e.ca;
        t.fedPay += e.fedPay;
        t.caPay += e.caPay;
        return t;
      },
      { fed: 0, ca: 0, fedPay: 0, caPay: 0 }
    );
  });
  // auto tick marks from passing recomputations
  const autoV = {};
  checks
    .filter((f) => f.autoVerify)
    .forEach((f) =>
      (autoV[f.autoVerify.line] ||= []).push({
        method: f.autoVerify.method,
        note: f.title,
        by: 'system',
        auto: true,
        ts: V.computed_at
      })
    );
  return { vk, V, L, S, std, checks, adjs, live, byLine, fx, wp, autoV };
}
let M = null;

function lineValue(k) {
  const l = M.L[k];
  if (!l) return null;
  if (typeof l.value !== 'number') return l.value;
  const a = (M.byLine[k] || []).filter((x) => x.status === 'active');
  return (
    l.value +
    a.reduce(
      (s, x) =>
        s +
        (x.lineDelta ??
          (x.kind === 'payment' ? x.fedPay || x.caPay || 0 : x.kind === 'rate' ? x.amount : 0)),
      0
    )
  );
}
function verifs(k) {
  return [...(M.autoV[k] || []), ...(M.S.verify[k] || [])];
}
function tickFor(k) {
  const v = verifs(k),
    f = M.checks.find((c) => c.lines.includes(k) && c.kind === 'error' && c.status === 'open');
  if (f) return `<span class="tick fail" title="Open finding: ${esc(f.title)}">!</span>`;
  if (!v.length) return `<span class="tick none" title="Not yet verified"></span>`;
  const latest = v[v.length - 1],
    m = METHODS[latest.method] || METHODS.recalculated;
  const stale = latest.valueAt !== undefined && latest.valueAt !== lineValue(k);
  return `<span class="tick ${m.c}" title="${esc(m.label)}${latest.by !== 'system' ? ' by ' + esc(PERSON[latest.by]?.name) : ' (independent check)'}${stale ? ' (value changed since: re-verify)' : ''}" ${stale ? 'style="opacity:.45"' : ''}>${m.g}</span>`;
}
function num(k, opts = {}) {
  const l = M.L[k];
  if (!l) return `<span class="faint">${esc(k)}</span>`;
  const v = lineValue(k),
    changed = typeof l.value === 'number' && v !== l.value;
  return `<span class="num ${changed ? 'chg' : ''}" data-trace="${esc(k)}" title="${changed ? 'Engine ' + fmt(l.value) + '; adjusted' : ''}">${typeof v === 'number' ? money(v) : esc(v)}</span>${opts.noTick ? '' : tickFor(k)}`;
}
function who(id) {
  const p = PERSON[id];
  if (!p) return id === 'system' ? '<span class="pill">independent check</span>' : esc(id || '');
  return `<span class="who"><span class="av" style="background:${COLORS[id] || '#555'}">${esc(
    p.name
      .split(' ')
      .map((x) => x[0])
      .join('')
  )}</span>${esc(p.name)}</span>`;
}
const ago = (ts) => {
  const d = (Date.now() - new Date(ts)) / 1000;
  return d < 60
    ? 'just now'
    : d < 3600
      ? Math.round(d / 60) + ' min ago'
      : d < 86400
        ? Math.round(d / 3600) + ' h ago'
        : dshort(ts);
};

/* sensitive values: masked unless cleared AND revealed (each reveal logged) */
function sens(val, field) {
  if (!val) return '';
  const p = PERSON[UI.actor];
  const key = field + ':' + val;
  if (p.role === 'client' || (p.clear && UI.revealed.has(key))) return `<span>${esc(val)}</span>`;
  const masked = String(val).replace(/[0-9](?=[0-9\- ]{4})/g, '•');
  return `<span class="mask">${esc(masked)}</span>${p.clear ? `<button class="btn sm reveal" data-reveal="${esc(key)}" data-field="${esc(field)}">Show</button>` : `<span class="pill" title="${esc(p.note || 'No sensitive-data clearance')}">masked</span>`}`;
}

/* ---------- reference resolver: every ref type in the packet ---------- */
function refLabel(r) {
  if (IDX.ev[r]) {
    const e = IDX.ev[r];
    return `${e.document_id} p${e.page} ${e.label}`;
  }
  if (r.startsWith('doc:')) return r.slice(4).replace('#page', ' p');
  if (IDX.qa[r]) return `${r} questionnaire`;
  if (IDX.msg[r]) return `${r} message`;
  if (IDX.call[r]) return `${r} call notes`;
  if (r.startsWith('py:')) return '2024 ' + r.slice(4);
  if (r.startsWith('agency:')) return 'Agency ' + r.slice(8);
  if (r.startsWith('asset:')) return 'Asset ' + r.slice(6);
  if (r.startsWith('ref:')) return 'Engine ' + r.slice(4);
  if (r.startsWith('household:')) return 'Household ' + r.slice(10);
  if (r.startsWith('timeline:')) return 'Timeline ' + r.slice(9);
  if (IDX.doc[r]) return r + ' ' + IDX.doc[r].title.slice(0, 40);
  if (M?.L[r]) return r;
  return r;
}
const chip = (r) => `<span class="srcchip" data-ref="${esc(r)}">${esc(refLabel(r))}</span>`;
function jsonPtr(obj, ptr) {
  return ptr
    .split('/')
    .slice(1)
    .reduce((o, k) => (o == null ? o : o[k.replace(/~1/g, '/').replace(/~0/g, '~')]), obj);
}

/*
 * Maps packet documents and extracted values to the page and field shown by the trace drawer.
 * pages(docId) returns page records; locate(evId) returns the source page and field position.
 * The adapter keeps tracing independent of whether source pages are text or images.
 */
// Keeps source-page rendering and field location behind a stable interface.
const SourceAdapter = {
  pages(id) {
    return (IDX.doc[id]?.pages || []).map((p) => ({
      page: p.page,
      kind: 'text',
      content: p.printed_content
    }));
  },
  locate(evId) {
    const e = IDX.ev[evId];
    if (!e) return null;
    return {
      docId: e.document_id,
      page: e.page,
      bbox: e.position,
      text: e.text_as_read,
      value: e.value
    };
  }
};
function highlightText(text, needle, value) {
  let t = esc(text);
  const cands = [];
  if (needle) cands.push(needle);
  if (typeof value === 'number') {
    cands.push(
      value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
    cands.push(value.toLocaleString('en-US'));
  }
  if (typeof needle === 'string' && /^\d\d\/\d\d\/\d{4}$/.test(needle)) {
    const [m, d, y] = needle.split('/');
    cands.push(`${y}-${m}-${d}`);
  }
  for (const c of cands) {
    const ce = esc(c);
    const i = t.indexOf(ce);
    if (c && i >= 0)
      return {
        html: t.slice(0, i) + '<mark id="hlmark">' + ce + '</mark>' + t.slice(i + ce.length),
        found: true
      };
  }
  return { html: t, found: false };
}
function docView(id, opts = {}) {
  const d = IDX.doc[id];
  if (!d) return '<p>Unknown document.</p>';
  const pages = SourceAdapter.pages(id);
  const loc = opts.ev ? SourceAdapter.locate(opts.ev) : null;
  const pg = opts.page || loc?.page || 1;
  const p = pages.find((x) => x.page === pg) || pages[0];
  if (!docVisible(id))
    return `<div class="panel"><b>${esc(d.title)}</b><p class="muted">Not received as of the season clock (arrives ${dshort(d.received_at)}).</p></div>`;
  let hl =
    loc && p.page === loc.page
      ? highlightText(p.content, loc.text, loc.value)
      : { html: esc(p.content), found: false };
  if (!PERSON[UI.actor].clear) hl = { ...hl, html: maskText(hl.html) };
  const bb =
    loc && p.page === loc.page && loc.bbox
      ? `<div class="pagemap" title="Field position on the page (synthetic coordinates from extraction; real page images use the same box)"><div class="bbox" style="left:${loc.bbox.x0 * 100}%;top:${loc.bbox.y0 * 100}%;width:${Math.max(4, (loc.bbox.x1 - loc.bbox.x0) * 100)}%;height:${Math.max(3, (loc.bbox.y1 - loc.bbox.y0) * 100)}%"></div></div>`
      : '';
  const evs = (IDX.evByDoc[id] || []).filter((e) => e.page === p.page);
  const e = loc ? IDX.ev[opts.ev] : null;
  return `<div class="docview">
    <div class="row" style="justify-content:space-between;align-items:center"><div><b>${esc(d.id)} ${esc(d.title)}</b><div class="small muted">${esc(d.issuer || '')} ${esc(d.file_name)} received ${dshort(d.received_at)} by ${esc(d.uploaded_by)}${d.marked_corrected ? ' <span class="pill amb">CORRECTED</span>' : ''} extraction ${esc(d.extraction.status)}${d.extraction.reason ? ': ' + esc(d.extraction.reason) : ''}</div></div></div>
    ${pages.length > 1 ? `<div class="pages-thumbs">${pages.map((x) => `<button class="btn sm ${x.page === p.page ? 'pri' : ''}" data-docpage="${id}|${x.page}${opts.ev ? '|' + opts.ev : ''}">${x.page}</button>`).join('')}</div>` : ''}
    ${e ? `<div class="panel tight small"><b>${esc(e.label)}</b> (${esc(e.field)}) read as <b>${esc(e.text_as_read || '(blank)')}</b>, value <b>${esc(typeof e.value === 'number' ? fmt(e.value, 2) : String(e.value))}</b>, <span class="conf ${e.confidence < 0.9 ? 'low' : ''}">confidence ${e.confidence}</span>${hl.found ? '' : ' <span class="pill red">read text not found on page</span>'}</div>` : ''}
    <div class="pagewrap"><div class="page"><div class="ph"><span>${esc(d.document_type)} page ${p.page} of ${d.page_count}</span><span>Simulated from printed content</span></div>${hl.html}</div>${bb}</div>
    ${
      evs.length
        ? `<details ${opts.openVals ? 'open' : ''}><summary class="small">${evs.length} values extracted from this page</summary><div class="tbl-wrap"><table class="evlist"><tr><th>Value id</th><th>Field</th><th class="n">Value</th><th>Conf.</th><th>Landed in</th></tr>${evs
            .slice(0, 80)
            .map(
              (x) =>
                `<tr><td><span class="srcchip" data-ref="${x.id}">${x.id}</span></td><td>${esc(x.label)}</td><td class="n">${esc(typeof x.value === 'number' ? fmt(x.value, 2) : String(x.value ?? ''))}</td><td class="conf ${x.confidence < 0.9 ? 'low' : ''}">${x.confidence}</td><td>${(IDX.citedBy[M.vk][x.id] || []).map((k) => `<span class="srcchip" data-trace="${k}">${k}</span>`).join('') || '<span class="faint">not used</span>'}</td></tr>`
            )
            .join('')}</table></div></details>`
        : ''
    }
  </div>`;
}

/* ---------- drawer: trace any number / open any reference ---------- */
function openDrawer(kind, id, extra = {}) {
  UI.drawer = { kind, id, ...extra };
  renderDrawer();
}
function closeDrawer() {
  UI.drawer = null;
  renderDrawer();
}
function renderDrawer() {
  const el = $('#drawer');
  if (!UI.drawer) {
    el.classList.remove('open');
    return;
  }
  el.classList.add('open');
  const { kind, id } = UI.drawer;
  let title = '',
    body = '';
  if (kind === 'line') {
    title = id;
    body = traceLine(id);
  } else {
    title = refLabel(id);
    body = refBody(id, UI.drawer);
  }
  el.innerHTML = `<div class="dh"><button class="btn sm" data-close>Close</button><b style="flex:1">${esc(title)}</b>${UI.drawer.back ? `<button class="btn sm" data-back>Back</button>` : ''}</div><div class="db">${body}</div>`;
  const mk = $('#hlmark', el);
  if (mk) mk.scrollIntoView({ block: 'center' });
}
function refBody(r, opts) {
  if (IDX.ev[r]) {
    const e = IDX.ev[r];
    return docView(e.document_id, { ev: r, page: opts.page }) + landedIn(r);
  }
  if (r.startsWith('doc:')) {
    const [d, pg] = r.slice(4).split('#page');
    return docView(d, { page: +pg || 1, openVals: true });
  }
  if (IDX.doc[r]) return docView(r, { page: opts.page || 1, openVals: true }) + docLanding(r);
  if (IDX.qa[r]) {
    const q = IDX.qa[r];
    return `<div class="panel"><div class="small muted">Client questionnaire, answered by ${esc(q.answered_by)} ${dshort(q.answered_at)}</div><h3>${esc(q.question)}</h3><p>${esc(q.answer)}</p></div>${usedAsEvidence(r)}`;
  }
  if (IDX.msg[r]) {
    const m = IDX.msg[r];
    return `<div class="panel"><div class="small muted">Message from ${esc(m.from)} ${dshort(m.sent_at)}</div><p>${esc(m.text)}</p></div>${usedAsEvidence(r)}`;
  }
  if (IDX.call[r]) {
    const c = IDX.call[r];
    return `<div class="panel"><div class="small muted">Call ${dshort(c.date)} with ${esc(c.participants.join(', '))}</div><ul>${c.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></div>${usedAsEvidence(r)}`;
  }
  if (r.startsWith('py:')) {
    const v = jsonPtr(P.prior_years, r.slice(3));
    return `<div class="panel"><div class="small muted">Prior-year record (from D06 / D07)</div><pre style="white-space:pre-wrap;font-size:12.5px">${esc(JSON.stringify(v, null, 2))}</pre></div>`;
  }
  if (r.startsWith('agency:')) {
    const v = jsonPtr(P.tax_agency_records, r.slice(7));
    return `<div class="panel"><div class="small muted">Third-party agency record</div><pre style="white-space:pre-wrap;font-size:12.5px">${esc(JSON.stringify(v, null, 2))}</pre></div>`;
  }
  if (r.startsWith('asset:')) {
    const id = r.slice(6);
    const a =
      M.V.assets.find((x) => x.asset_id === id) ||
      P.prior_years.asset_records.find((x) => x.asset_id === id);
    return `<div class="panel"><pre style="white-space:pre-wrap;font-size:12.5px">${esc(JSON.stringify(a, null, 2))}</pre></div>`;
  }
  if (r.startsWith('ref:')) {
    const path = r.slice(4);
    const v = path.startsWith('param.')
      ? P.engine_reference.parameters[path.slice(6)]
      : path.startsWith('fx.')
        ? P.engine_reference.parameters.fx.SEK[path.split('.')[2]]
        : path;
    return `<div class="panel"><div class="small muted">Engine reference parameter</div><pre>${esc(JSON.stringify(v, null, 2))}</pre></div>`;
  }
  if (r.startsWith('household:')) {
    const k = r.slice(10);
    const p = P.household.people.find((x) => x.id === k);
    const v = p || P.household[k] || P.household;
    const p2 = p ? { ...p, ssn: undefined, ip_pin: undefined } : v;
    return `<div class="panel">${p ? `<div class="kv"><b>SSN</b><div>${sens(p.ssn, 'ssn:' + p.id)}</div>${p.ip_pin ? `<b>IP PIN</b><div>${sens(p.ip_pin, 'ippin:' + p.id)}</div>` : ''}</div>` : ''}<pre style="white-space:pre-wrap;font-size:12.5px">${esc(JSON.stringify(p2, null, 2))}</pre></div>`;
  }
  if (r.startsWith('timeline:')) {
    const t = P.timeline.find((x) => x.id === r.slice(9));
    return `<div class="panel"><pre>${esc(JSON.stringify(t, null, 2))}</pre></div>`;
  }
  if (M.L[r]) return traceLine(r);
  return `<p class="muted">No record for ${esc(r)}.</p>`;
}
function landedIn(evId) {
  const ks = IDX.citedBy[M.vk][evId] || [];
  return `<h3>Where this value landed</h3>${ks.length ? ks.map((k) => `<span class="srcchip" data-trace="${k}">${k} ${esc(M.L[k].label.slice(0, 50))}</span>`).join('') : '<p class="muted small">Not used by any return line in ' + M.vk + '.</p>'}`;
}
function usedAsEvidence(r) {
  const ks = IDX.citedBy[M.vk][r] || [];
  const fs = M.checks.filter((f) => f.refs.includes(r));
  return `<h3>Used as evidence</h3>${ks.map((k) => `<span class="srcchip" data-trace="${k}">${k}</span>`).join('')}${fs.map((f) => `<span class="srcchip" data-go="findings">${esc(f.title)}</span>`).join('') || (!ks.length ? '<p class="muted small">Not cited yet.</p>' : '')}`;
}
function docLanding(d) {
  const ks = [...(IDX.docLines[M.vk][d] || [])];
  const disp = M.S.disp[d];
  return `<h3>Where this document landed</h3>${ks.length ? ks.map((k) => `<span class="srcchip" data-trace="${k}">${k}</span>`).join('') : `<p class="small muted">${esc(docReason(d))}</p>`}${disp ? `<p class="small">Disposition: <b>${esc(disp.disp)}</b> ${esc(disp.reason || '')} (${who(disp.by)})</p>` : ''}`;
}

/* ---------- the trace: how a number was built, where it came from, who checked it ---------- */
function traceLine(k) {
  const l = M.L[k];
  if (!l) return `<p>No line ${esc(k)} in ${M.vk}.</p>`;
  const v = lineValue(k),
    rule = P.engine_reference.rules[l.rule];
  const py = P.prior_years.return_2024.lines[k];
  const usedBy = Object.values(M.L)
    .filter((x) => (x.inputs || []).includes(k))
    .map((x) => x.key);
  const adjs = M.byLine[k] || [];
  const vs = verifs(k);
  const notes = Object.values(M.S.notes).filter((n) => n.target === k);
  const fs = M.checks.filter((f) => f.lines.includes(k) || f.refs.includes(k));
  const prevV = ['v1', 'v2', 'v3'].map((x) => IDX.lines[x][k]?.value);
  const tree = (key, depth, seen) => {
    const x = M.L[key];
    if (!x) return `<li><span class="faint">${esc(key)}</span></li>`;
    if (seen.has(key) || depth > 5)
      return `<li><div class="node"><span class="k">${esc(key)}</span>${num(key)}</div></li>`;
    seen.add(key);
    return `<li><div class="node"><span class="k">${esc(key)}</span><span>${esc(x.label)}</span>${num(key)}<span class="faint small">${esc(x.rule)}</span></div>
      ${(x.sources || []).length ? `<div>${x.sources.map(chip).join('')}</div>` : ''}
      ${(x.inputs || []).length ? `<ul class="tree">${x.inputs.map((i) => tree(i, depth + 1, seen)).join('')}</ul>` : ''}</li>`;
  };
  const varFlag = typeof py === 'number' && typeof v === 'number' ? variance(py, v) : null;
  return `
    <div class="small muted">${esc(l.form)} line ${esc(l.line)} ${esc(l.jurisdiction)}</div>
    <h2 style="margin-top:2px">${esc(l.label)}</h2>
    <div class="sumgrid" style="margin:8px 0 12px">
      <div><div class="l">Workpaper value</div><div class="v">${typeof v === 'number' ? money(v) : esc(v)}</div>${v !== l.value ? `<div class="d chg">engine ${money(l.value)}</div>` : ''}</div>
      <div><div class="l">2024 as filed</div><div class="v">${py !== undefined ? money(py) : '<span class="faint">none</span>'}</div>${varFlag?.flag ? `<div class="d amb">variance ${sgn(varFlag.diff)} (${varFlag.pct}%)</div>` : ''}</div>
      <div><div class="l">Engine v1 / v2 / v3</div><div class="d">${prevV.map((x) => (x === undefined ? '-' : money(x))).join(' / ')}</div></div>
    </div>
    ${l.note ? `<p class="panel tight small"><b>Engine note:</b> ${esc(l.note)}</p>` : ''}
    <p class="small"><b>${esc(l.rule)}</b>: ${esc(rule || '')}</p>
    <h3>How it was built</h3><ul class="tree" style="border:0;padding:0">${tree(k, 0, new Set())}</ul>
    ${usedBy.length ? `<h3>Flows into</h3>${usedBy.map((x) => `<span class="srcchip" data-trace="${x}">${x} ${esc(M.L[x].label.slice(0, 40))}</span>`).join('')}` : ''}
    ${fs.length ? `<h3>Findings that touch this number</h3>${fs.map((f) => `<div class="finding ${f.kind}" style="margin:6px 0"><b>${esc(f.title)}</b> <span class="pill ${f.status === 'open' ? 'red' : f.status === 'pass' ? 'grn' : ''}">${f.status}</span><div class="small muted">${esc(f.evidence)}</div></div>`).join('')}` : ''}
    <h3>Verification</h3>
    ${vs.length ? `<table>${vs.map((x) => `<tr><td>${tickFor_m(x.method)}</td><td>${esc(METHODS[x.method]?.label)}</td><td>${who(x.by)}</td><td class="small">${esc(x.note || '')} ${(x.evidence || []).map(chip).join('')}</td><td class="small faint">${dshort(x.ts)}</td></tr>`).join('')}</table>` : '<p class="small muted">Not verified yet.</p>'}
    ${can(UI.actor, 'prepare') && !M.S.filing.frozen ? `<div class="panel tight"><div class="form-row"><select id="vmethod">${(M.std.verification_types || Object.keys(METHODS)).map((m) => `<option value="${m}">${esc(METHODS[m]?.label || m)}</option>`).join('')}</select><input type="text" id="vnote" placeholder="What you checked (optional)"></div><div class="form-row"><input type="text" id="vevid" placeholder="Evidence refs, comma separated (ev-0016, qa-25, msg-07)" value="${esc((l.sources || []).join(', '))}"><button class="btn ok" data-verify="${esc(k)}">Record verification</button></div></div>` : ''}
    <h3>Adjustments</h3>
    ${adjs.length ? adjs.map((a) => adjRow(a)).join('') : '<p class="small muted">None. The engine value stands.</p>'}
    ${can(UI.actor, 'prepare') && typeof l.value === 'number' ? manualAdjForm(k) : ''}
    <h3>Review notes</h3>
    ${notes.map(noteCard).join('') || '<p class="small muted">No notes on this line.</p>'}
    ${can(UI.actor, 'note') ? `<div class="form-row"><input type="text" id="notetext" placeholder="Write a review note on ${esc(k)}"><label class="small"><input type="checkbox" id="noteblock" checked> blocks filing</label><button class="btn" data-addnote="${esc(k)}">Add note</button></div>` : ''}
    <h3>History</h3>${histFor(k)}`;
}
const tickFor_m = (m) => {
  const x = METHODS[m] || METHODS.recalculated;
  return `<span class="tick ${x.c}">${x.g}</span>`;
};
function variance(a, b) {
  const diff = b - a,
    pct = a ? Math.round((diff / Math.abs(a)) * 100) : 100;
  const vr = M.std.variance_review;
  return {
    diff,
    pct,
    flag: Math.abs(diff) > vr.and_over_amount && Math.abs(pct) > vr.flag_if_change_over_percent
  };
}
function adjRow(a) {
  const e = effect(a, M.vk);
  const st = {
    active: '<span class="pill grn">in workpaper</span>',
    pending_partner: '<span class="pill amb">awaiting partner</span>',
    reversed: '<span class="pill">reversed</span>'
  }[a.status];
  return `<div class="panel tight small"><div class="row" style="justify-content:space-between"><div><b>${esc(a.label)}</b> ${st} ${a.amendment ? '<span class="pill ind">amendment</span>' : ''}</div><div>federal ${sgn(e.fed - e.fedPay)} California ${sgn(e.ca - e.caPay)} (balance effect)</div></div>
    <div class="muted">${a.kind === 'payment' ? 'payment change' : a.kind === 'data' ? 'data correction' : a.kind === 'fixed' ? 'engine what-if result' : `${fmt(a.amount)} at ${esc(a.cat)} rate`} . Why: ${esc(a.reason || '')} ${a.authority ? '. Authority: ' + esc(a.authority) : ''}</div>
    <div class="muted">Original engine value kept. Proposed by ${who(a.by)} ${dshort(a.ts)}${a.approvedBy ? ', approved by ' + who(a.approvedBy) : ''}</div>
    <div class="row" style="margin-top:4px">${a.status === 'pending_partner' && can(UI.actor, 'partner') && a.by !== UI.actor ? `<button class="btn sm ok" data-approve="${a.id}">Approve as partner</button>` : ''}${a.status !== 'reversed' && can(UI.actor, 'prepare') && !M.S.filing.frozen ? `<button class="btn sm bad" data-reverse="${a.id}">Reverse</button>` : ''}</div></div>`;
}
function manualAdjForm(k) {
  const cats = Object.keys(M.V.tax_effect_rates);
  return `<details class="panel tight"><summary class="small">Propose a manual adjustment to ${esc(k)}</summary>
   <div class="form-row"><input type="number" id="madj-amt" placeholder="Change in dollars (e.g. -1500)"><select id="madj-cat">${cats.map((c) => `<option>${c}</option>`).join('')}<option value="payment-fed">federal payment</option><option value="payment-ca">California payment</option></select></div>
   <div class="form-row"><input type="text" id="madj-why" placeholder="Why (required)"><input type="text" id="madj-auth" placeholder="Authority relied on"></div>
   <button class="btn" data-madj="${esc(k)}">Propose adjustment</button></details>`;
}
function noteCard(n) {
  return `<div class="panel tight small"><div class="row" style="justify-content:space-between"><div>${who(n.by)} on <span class="srcchip" data-ref="${esc(n.target)}">${esc(n.target)}</span> ${n.blocking ? '<span class="pill red">blocks filing</span>' : ''} <span class="pill ${n.status === 'open' ? 'amb' : 'grn'}">${n.status}</span></div><span class="faint">${dshort(n.ts)}</span></div>
   <p style="margin:6px 0">${esc(n.text)}</p>${n.thread.map((t) => `<div style="border-left:2px solid var(--rule);padding-left:8px;margin:4px 0">${who(t.by)}: ${esc(t.text)}</div>`).join('')}
   <div class="form-row noprint">${can(UI.actor, 'note') || can(UI.actor, 'prepare') ? `<input type="text" data-replyfor="${n.id}" placeholder="Reply">` : ''}${n.status === 'open' && (n.by === UI.actor || can(UI.actor, 'partner')) ? `<button class="btn sm ok" data-resolve="${n.id}">Clear note</button>` : ''}${n.status !== 'open' && can(UI.actor, 'review') ? `<button class="btn sm" data-reopen="${n.id}">Reopen</button>` : ''}</div></div>`;
}
function histFor(target) {
  const h = M.S.log.filter(
    (e) =>
      [e.target, e.line, e.adj?.line, e.key, e.doc, e.area].includes(target) ||
      (e.type === 'adj.add' && e.adj?.line === target)
  );
  return h.length
    ? `<ul class="tl">${h.map((e) => `<li><span class="small">${who(e.actor)} ${esc(describe(e))}</span> <span class="faint small">${ago(e.ts)}</span></li>`).join('')}</ul>`
    : '<p class="small muted">No workpaper activity yet.</p>';
}
function describe(e) {
  const m = {
    'adj.add': `proposed adjustment: ${e.adj?.label} (${e.adj?.line})`,
    'adj.approve': 'approved an adjustment',
    'adj.reverse': `reversed an adjustment: ${e.reason || ''}`,
    'finding.dismiss': `dismissed finding ${e.findingId}: ${e.reason}`,
    verify: `verified ${e.target} (${METHODS[e.method]?.label})`,
    'note.add': `wrote a review note on ${e.target}: ${e.text}`,
    'note.reply': `replied: ${e.text}`,
    'note.resolve': 'cleared a review note',
    'note.reopen': 'reopened a review note',
    'q.ask': `asked ${PERSON[e.to]?.name || e.to}: ${e.text}`,
    'q.answer': `answered: ${e.text}`,
    signoff: `signed off ${AREA[e.area]?.name || e.area} as ${e.level}`,
    'signoff.revoke': `withdrew ${e.level} sign-off on ${e.area}`,
    'doc.disp': `set ${e.doc} disposition: ${e.disp}`,
    'variance.explain': `explained variance on ${e.key}`,
    judgment: `recorded judgment: ${e.topic}`,
    step: `${e.done === false ? 'reopened' : 'completed'} step: ${e.step}`,
    assign: `assigned ${AREA[e.area]?.name || e.area} to ${PERSON[e.who]?.name}`,
    time: `logged ${e.hours} h on ${e.area}`,
    standards: 'changed firm standards',
    filing: `filing: ${Object.keys(e.patch || {}).join(', ')}`,
    undo: `undid ${e.ids?.length} change(s)`,
    reveal: `viewed unmasked ${e.field}`,
    notice: 'updated notice response'
  };
  return m[e.type] || e.type;
}
let toastTimer;
function toast(msg, undoIds) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${undoIds ? `<button data-undo="${undoIds.join(',')}">Undo</button>` : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), undoIds ? 9000 : 3500);
}
function docReason(d) {
  const doc = IDX.doc[d];
  if (!doc) return '';
  if (!docVisible(d)) return `Not yet received (arrives ${dshort(doc.received_at)}).`;
  if (M.V.documents_superseded.includes(d)) return 'Superseded by the corrected version.';
  if (d === 'D10') return 'Duplicate image of D09: matched and counted once.';
  if (doc.extraction.status === 'not_extracted') return doc.extraction.reason;
  if (!M.V.documents_used.includes(d))
    return 'Received after this engine run: not in the computed return.';
  const informational = {
    D01: 'Engagement evidence',
    D02: 'Consent evidence',
    D04: 'Identity verified',
    D05: 'Identity verified',
    D03: 'IP PIN for e-file',
    D07: 'Prior preparer file (reviewed)',
    D12: 'ISO facts used in AMT',
    D13: 'ESPP facts used via D11',
    D22: 'Equipment cost for depreciation',
    D24: 'Home office measurements',
    D25: 'Premiums (deduction disallowed)',
    D27: 'Contractor payments evidence',
    D47: 'HVAC invoice',
    D49: 'Property tax detail',
    D52: 'Sale proceeds evidence',
    D54: 'Purchase facts and points',
    D56: 'Payoff interest (in D55)',
    D60: 'Scholarship terms',
    D69: 'Payments agreed to transcript',
    D70: 'Prior notice resolved',
    D71: 'Dependent SSN'
  };
  return informational[d]
    ? `${informational[d]}; values used through other lines or as supporting evidence.`
    : 'Used as supporting evidence.';
}

function maskText(h) {
  return h
    .replace(/\b\d{3}-\d\d-(\d{4})\b/g, '•••-••-$1')
    .replace(/SE\d\d[ \d]{10,}(\d{4})/g, 'SE•• •••• $1')
    .replace(/\b(PIN[^0-9]{0,40})\d{6}\b/g, '$1••••••')
    .replace(/\b\d{6}(\d{4})\b/g, '••••••$1');
}
