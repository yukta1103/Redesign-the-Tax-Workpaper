/*
 * Renders shared navigation, filing readiness, sign-off state, and primary return views.
 * Views read the model built from immutable packet evidence and the append-only ledger.
 * Loaded after ui-shared.js and before the record and filing views.
 */
function gate() {
  const b = [];
  if (M.S.filing.frozen) return b;
  const openErr = M.checks.filter((f) => f.kind === 'error' && f.status === 'open');
  openErr.forEach((f) => b.push({ t: `Unresolved finding: ${f.title}`, go: 'findings' }));
  M.checks
    .filter((f) => f.kind === 'judgment' && f.status === 'open')
    .forEach((f) => b.push({ t: `Judgment not recorded: ${f.title}`, go: 'findings' }));
  Object.values(M.S.notes)
    .filter((n) => n.status === 'open' && n.blocking)
    .forEach((n) => b.push({ t: `Open review note on ${n.target}`, go: 'review' }));
  M.adjs
    .filter((a) => a.status === 'pending_partner')
    .forEach((a) => b.push({ t: `Partner approval needed: ${a.label}`, go: 'review' }));
  AREAS.forEach((a) => {
    ['preparer', 'reviewer'].forEach((lv) => {
      const s = signState(a.id, lv);
      if (s.state !== 'signed')
        b.push({ t: `${a.name}: ${lv} sign-off ${s.state}`, go: 'area/' + a.id });
    });
  });
  if (signState('return', 'partner').state !== 'signed')
    b.push({ t: 'Partner sign-off on the whole return', go: 'review' });
  const unexpl = variances().filter((v) => v.flag && !M.S.variance[v.k]);
  if (unexpl.length)
    b.push({ t: `${unexpl.length} prior-year variances not explained`, go: 'variance' });
  const undisp = docIndex().filter((d) => d.state === 'needs disposition');
  if (undisp.length)
    b.push({ t: `${undisp.length} documents without a disposition`, go: 'documents' });
  stepsState()
    .filter(
      (s) =>
        !s.done &&
        s.step !== 'Client approval and e-file authorization' &&
        s.step !== 'Reviewer sign-off' &&
        s.step !== 'Partner sign-off'
    )
    .forEach((s) => b.push({ t: `Required step: ${s.step}`, go: 'filing' }));
  return b;
}
// Hashes the covered return lines and adjustments so later changes reopen a sign-off.
function areaHash(areaId) {
  const keys =
    areaId === 'return'
      ? Object.keys(M.L)
      : Object.keys(M.L).filter((k) => areaOfLine(k) === areaId);
  const parts = keys.map((k) => k + '=' + lineValue(k)).join('|');
  const adj = M.adjs
    .filter(
      (a) =>
        areaId === 'return' ||
        areaOfLine(a.line) === areaId ||
        M.checks.find((f) => f.id === a.findingId)?.area === areaId
    )
    .map((a) => a.id + a.status)
    .join(',');
  return hash(M.vk + '|' + parts + '|' + adj);
}
// Compares a stored sign-off hash with current work to determine whether it remains valid.
function signState(areaId, level) {
  const s = M.S.signoffs[areaId + '|' + level];
  if (!s) return { state: 'missing' };
  if (s.hash !== areaHash(areaId)) return { state: 'reopened', s };
  return { state: 'signed', s };
}
function preparedBy(areaId) {
  return new Set(
    M.S.log
      .filter(
        (e) =>
          ['adj.add', 'verify', 'doc.disp', 'variance.explain', 'judgment'].includes(e.type) &&
          (e.area === areaId ||
            areaOfLine(e.adj?.line || e.target || e.key || '') === areaId ||
            areaOfDoc(e.doc) === areaId)
      )
      .map((e) => e.actor)
  );
}
function variances() {
  const py = P.prior_years.return_2024.lines,
    out = [];
  for (const k of Object.keys(py)) {
    const l = M.L[k];
    if (!l || typeof py[k] !== 'number' || typeof l.value !== 'number') continue;
    const v = variance(py[k], lineValue(k));
    out.push({ k, label: l.label, py: py[k], cy: lineValue(k), ...v });
  }
  return out;
}
function docIndex() {
  return P.documents.map((d) => {
    const lines = [...(IDX.docLines[M.vk][d.id] || [])];
    const disp = M.S.disp[d.id];
    let state = !docVisible(d.id)
      ? 'not received'
      : M.V.documents_superseded.includes(d.id)
        ? 'superseded'
        : lines.length
          ? 'landed'
          : disp
            ? 'accounted'
            : d.extraction.status === 'not_extracted' || d.id === 'D10'
              ? 'accounted'
              : 'needs disposition';
    if (lines.length === 0 && disp) state = 'accounted';
    return { d, lines, state, disp, area: areaOfDoc(d.id) };
  });
}
function stepsState() {
  const auto = {
    'Engagement letter and consents signed': docVisible('D01') && docVisible('D02'),
    'Identity verified': !!M.S.verify['household:identity'] || !!M.S.steps['Identity verified'],
    'All documents accounted for': docIndex().every((x) => x.state !== 'needs disposition'),
    'Prior-year variances explained': variances()
      .filter((v) => v.flag)
      .every((v) => M.S.variance[v.k]),
    'Diagnostics resolved': M.checks
      .filter((f) => f.kind !== 'pass' && f.kind !== 'info')
      .every((f) => f.status !== 'open'),
    'Reviewer sign-off': AREAS.every((a) => signState(a.id, 'reviewer').state === 'signed'),
    'Partner sign-off': signState('return', 'partner').state === 'signed',
    'Client approval and e-file authorization': !!M.S.filing.clientSigned,
    'Due diligence completed': !!M.S.judgments['j-8867'],
    'Estimated payments agreed to IRS and FTB records': ['fed-est', 'ca-est'].every(
      (id) => M.checks.find((f) => f.id === id)?.status !== 'open'
    ),
    'Carryovers agreed to prior year': !!M.S.steps['Carryovers agreed to prior year'],
    'Prior-year return reviewed': !!M.S.steps['Prior-year return reviewed']
  };
  return (M.std.required_steps || []).map((s) => ({
    step: s,
    done: auto[s] ?? !!M.S.steps[s]?.done,
    manual: ![
      'Engagement letter and consents signed',
      'All documents accounted for',
      'Prior-year variances explained',
      'Diagnostics resolved',
      'Reviewer sign-off',
      'Partner sign-off',
      'Client approval and e-file authorization',
      'Estimated payments agreed to IRS and FTB records',
      'Due diligence completed'
    ].includes(s)
  }));
}

function chrome() {
  const me = PERSON[UI.actor];
  const g = gate();
  const frozen = M.S.filing.frozen;
  const others = Object.values(Store.peers).filter(
    (p) => p.tab !== Store.tab && Date.now() - p.t < 15000
  );
  const sinceSeen = M.S.seen[UI.actor]
    ? M.S.log.filter((e) => e.ts > M.S.seen[UI.actor] && e.actor !== UI.actor).length
    : M.S.log.filter((e) => e.actor !== UI.actor).length;
  $('header.top').innerHTML = `
    <button class="btn sm menu-btn" data-menu>Menu</button>
    <div class="brand">Okafor-Lindqvist 2025<small>Miraflores workpaper CL-20417 . engine ${M.vk} . ${Store.mode === 'shared' ? 'shared ledger, live' : 'saved on this device, live across tabs'}</small></div>
    <span class="spacer"></span>
    ${me.role !== 'client' ? `<input class="searchbox" type="text" id="gsearch" placeholder="Search lines, documents, notes" value="${esc(UI.search)}">` : ''}
    <label class="ctl">Season clock <select id="clock">${CLOCKS.map((c) => `<option value="${c.at}" ${c.at === UI.clock ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}${CLOCKS.some((c) => c.at === UI.clock) ? '' : `<option selected value="${UI.clock}">${dshort(UI.clock)}</option>`}</select></label>
    <label class="ctl">Acting as <select id="actor">${PEOPLE.map((p) => `<option value="${p.id}" ${p.id === UI.actor ? 'selected' : ''}>${esc(p.name)} (${esc(p.role.replace('_', ' '))}${p.clear === false ? ', masked' : ''})</option>`).join('')}</select></label>
    ${others.length ? `<span class="ctl" title="Open in other tabs">${others.map((o) => who(o.actor)).join(' ')}</span>` : ''}
    ${me.role !== 'client' ? `<button class="gate ${frozen ? 'frozen' : g.length ? 'blocked' : 'ready'}" data-go="${frozen ? 'filing' : 'gate'}">${frozen ? 'Filed and frozen' : g.length ? `${g.length} items block filing` : 'Ready to file'}</button>` : ''}
    ${sinceSeen && me.role !== 'client' ? `<button class="btn sm" data-go="changes">${sinceSeen} new since you looked</button>` : ''}`;
  const n = (r, label, ct, red) =>
    `<a href="#${r}" class="${UI.route === r || UI.route.startsWith(r + '/') ? 'on' : ''}">${esc(label)}${ct !== undefined && ct !== '' ? `<span class="ct ${red ? 'r' : ''}">${ct}</span>` : ''}</a>`;
  if (me.role === 'client') {
    $('nav.rail').innerHTML =
      `<div class="grp">Your 2025 return</div>${n('client', 'Home')}${n('client/questions', 'Questions for you', Object.values(M.S.questions).filter((q) => q.to.startsWith('cu-') && q.status === 'open').length)}${n('client/copy', 'Your copy')}`;
    return;
  }
  const open = M.checks.filter((f) => f.status === 'open' && f.kind !== 'pass').length;
  const notes = Object.values(M.S.notes).filter((x) => x.status === 'open').length;
  $('nav.rail').innerHTML = `
    <div class="grp">Prove the return</div>
    ${n('overview', 'Overview')}${n('findings', 'Findings', open, open > 0)}${n('gate', 'Filing gate', g.length, g.length > 0)}
    ${n('review', 'Review & sign-off', notes, notes > 0)}${n('changes', 'Changes & versions')}
    <div class="grp">Areas</div>${AREAS.map((a) => {
      const st = ['preparer', 'reviewer'].map((l) => signState(a.id, l).state);
      const fo = M.checks.filter(
        (f) => f.area === a.id && f.status === 'open' && f.kind !== 'pass'
      ).length;
      return n('area/' + a.id, a.name, fo || (st.every((s) => s === 'signed') ? '✓' : ''), fo > 0);
    }).join('')}
    <div class="grp">Records</div>
    ${n('return', 'Return summary vs 2024')}${n('documents', 'Document index')}${n('sales', 'Sales detail')}${n('depreciation', 'Depreciation by asset')}${n('books', 'Books to tax')}${n('rentals', 'Rentals & passive')}${n('state', 'State split')}${n('k1', 'K-1 lines & basis')}${n('carry', 'Carryovers & basis by year')}${n('variance', 'Variance vs 2024')}${n('prior', 'Prior preparer vs us')}
    <div class="grp">People</div>${n('comms', 'Questions & messages', Object.values(M.S.questions).filter((q) => q.status === 'open').length)}${n('judgments', 'Judgments & elections')}
    <div class="grp">Filing and after</div>${n('whatif', 'What-ifs')}${n('filing', 'Filing, e-file, freeze')}${n('notice', 'Notice response')}${n('nextyear', 'Next year')}
    <div class="grp">Firm</div>${n('firm', 'Standards, access, time')}${n('about', 'Core idea & errors found')}`;
}

/* =====================================================================
   VIEWS
   ===================================================================== */
const V = {};
V.overview = () => {
  const fs = M.V.summary.federal,
    cs = M.V.summary.california,
    py = P.prior_years.return_2024.lines;
  const cell = (l, engine, wp, pyv) =>
    `<div><div class="l">${l}</div><div class="v">${money(/Refund/.test(l) ? -wp : wp)}</div><div class="d">${wp !== engine ? `<span class="chg">engine ${money(engine)}</span> ` : ''}${pyv !== undefined ? `<span class="faint">2024 ${money(pyv)}</span>` : ''}</div></div>`;
  const open = M.checks.filter((f) => f.status === 'open' && f.kind !== 'pass');
  const since = M.S.seen[UI.actor];
  return `<h1>Is this return right?</h1>
  <p class="lede">Every number below carries its proof: where it came from, how it was built, who checked it, and what is still open. Click any number to trace it to the page it was read from. Workpaper totals are the engine's ${M.vk} plus the firm's adjustments, estimated at ${M.vk}'s marginal rates until the engine recomputes.</p>
  <div class="legend">${Object.values(METHODS)
    .map((m) => `<span><span class="tick ${m.c}">${m.g}</span> ${esc(m.label)}</span>`)
    .join(
      ''
    )}<span><span class="tick none"></span> not yet verified</span><span><span class="tick fail">!</span> open finding</span></div>
  <h2>Federal</h2><div class="sumgrid">${cell('AGI (engine)', fs.agi, fs.agi, py['F1040.11'])}${cell('Total tax', fs.total_tax, M.wp.fed.total_tax, py['F1040.24'])}${cell('Payments', fs.payments, M.wp.fed.payments, py['F1040.33'])}${cell(M.wp.fed.balance_due >= 0 ? 'Balance due' : 'Refund', fs.balance_due, M.wp.fed.balance_due, undefined)}${cell('Estimated tax penalty', fs.penalty, fs.penalty, undefined)}</div>
  <h2>California 540NR (resident 01/01 to 07/14)</h2><div class="sumgrid">${cell('Total AGI, California law', cs.total_agi, cs.total_agi)}${cell('California AGI', cs.ca_agi, cs.ca_agi)}${cell('Total tax', cs.total_tax, M.wp.ca.total_tax, py['CA540.64'])}${cell('Payments', cs.payments, M.wp.ca.payments)}${cell(M.wp.ca.balance_due >= 0 ? 'Balance due' : 'Refund', cs.balance_due, M.wp.ca.balance_due)}</div>
  <div class="grid2" style="margin-top:14px">
   <div class="panel"><h3 style="margin-top:0">Open findings</h3>${
     open.length
       ? `<p class="small muted">${open.length} items the independent checks raised against engine ${M.vk}.</p><table>${open
           .slice(0, 8)
           .map(
             (f) =>
               `<tr class="click" data-go="findings"><td><span class="pill ${f.kind === 'error' ? 'red' : f.kind === 'judgment' ? 'amb' : 'ind'}">${f.kind}</span></td><td>${esc(f.title)}</td><td class="n small">${f.eff.fed || f.eff.fedPay ? 'fed ' + sgn(f.eff.fed - f.eff.fedPay) : ''}</td></tr>`
           )
           .join('')}</table><button class="btn" data-go="findings">Work the findings</button>`
       : '<p class="ok">None open.</p>'
   }</div>
   <div class="panel"><h3 style="margin-top:0">${since ? 'Since you last looked (' + dshort(since) + ')' : 'Activity'}</h3>${changesSince(6)}<div class="row"><button class="btn" data-go="changes">All changes</button><button class="btn" data-seen>Mark all as seen</button></div></div>
  </div>
  <h2>Areas</h2><div class="tbl-wrap panel"><table><tr><th>Area</th><th>Lines</th><th>Verified</th><th>Open</th><th>Preparer</th><th>Reviewer</th><th>Assigned</th><th class="n">Hours vs budget</th></tr>
  ${AREAS.map((a) => {
    const ks = Object.keys(M.L).filter((k) => areaOfLine(k) === a.id && !k.startsWith('F8949.'));
    const ver = ks.filter((k) => verifs(k).length).length;
    const fo = M.checks.filter(
      (f) => f.area === a.id && f.status === 'open' && f.kind !== 'pass'
    ).length;
    const hrs = M.S.time.filter((t) => t.area === a.id).reduce((s, t) => s + t.hours, 0);
    const bud = P.firm.budget_hours[a.budget];
    const as = M.S.assign[a.id];
    const ss = (l) => {
      const s = signState(a.id, l);
      return s.state === 'signed'
        ? `<span class="ok">✓ ${esc(PERSON[s.s.by]?.name.split(' ')[0])}</span>`
        : s.state === 'reopened'
          ? '<span class="amb">reopened</span>'
          : '<span class="faint">open</span>';
    };
    return `<tr class="click" data-go="area/${a.id}"><td>${esc(a.name)}</td><td class="n">${ks.length}</td><td><div class="bar" style="width:80px"><i style="width:${ks.length ? (ver / ks.length) * 100 : 0}%"></i></div></td><td>${fo ? `<span class="pill red">${fo}</span>` : ''}</td><td>${ss('preparer')}</td><td>${ss('reviewer')}</td><td class="small">${as ? esc(PERSON[as.who]?.name) + (as.due ? ' by ' + as.due : '') : '<span class="faint">' + esc(PERSON[P.firm.assignment_at_start.preparer].name) + '</span>'}</td><td class="n small">${hrs.toFixed(1)} / ${bud}</td></tr>`;
  }).join('')}</table></div>`;
};
function changesSince(limit) {
  const since = M.S.seen[UI.actor] || '';
  const evs = M.S.log
    .filter((e) => e.ts > since && e.actor !== UI.actor)
    .slice(-limit)
    .reverse();
  const docs = P.documents
    .filter(
      (d) =>
        docVisible(d.id) &&
        d.received_at > (P.firm.staff.find((s) => s.id === UI.actor)?.active_from || '')
    )
    .sort((a, b) => (a.received_at < b.received_at ? 1 : -1))
    .slice(0, 3);
  return (
    (evs.length
      ? `<ul class="tl">${evs.map((e) => `<li>${who(e.actor)} <span class="small">${esc(describe(e))}</span> <span class="faint small">${ago(e.ts)}</span></li>`).join('')}</ul>`
      : '<p class="small muted">No new activity from others.</p>') +
    `<p class="small muted">Latest documents: ${docs.map((d) => `<span class="srcchip" data-ref="${d.id}">${d.id} ${dshort(d.received_at)}</span>`).join('')}</p>`
  );
}

V.findings = () => {
  const f = UI.filters.kind;
  const list = M.checks.filter((x) =>
    f === 'all'
      ? true
      : f === 'open'
        ? x.status === 'open' && x.kind !== 'pass'
        : f === 'pass'
          ? x.kind === 'pass'
          : f === 'done'
            ? ['accepted', 'dismissed', 'decided', 'pending'].includes(x.status)
            : x.kind === f
  );
  const counts = (k) =>
    M.checks.filter((x) =>
      k === 'open'
        ? x.status === 'open' && x.kind !== 'pass'
        : k === 'pass'
          ? x.kind === 'pass'
          : k === 'done'
            ? ['accepted', 'dismissed', 'decided', 'pending'].includes(x.status)
            : k === 'all'
              ? true
              : x.kind === k
    ).length;
  const tot = list
    .filter((x) => x.status === 'open')
    .reduce(
      (t, x) => ({ fed: t.fed + x.eff.fed - x.eff.fedPay, ca: t.ca + x.eff.ca - x.eff.caPay }),
      { fed: 0, ca: 0 }
    );
  return `<h1>Findings</h1><p class="lede">Independent checks recompute from the documents and do not trust the engine. Each finding shows what the engine did, what the evidence says, and the proposed adjustment with its tax effect. Accept or dismiss one at a time or in bulk; every action can be undone.</p>
   <div class="chipset">${[
     ['open', 'Open'],
     ['error', 'Errors'],
     ['judgment', 'Judgment calls'],
     ['info', 'Information'],
     ['pass', 'Checks that agree'],
     ['done', 'Resolved'],
     ['all', 'All']
   ]
     .map(
       ([k, l]) =>
         `<button class="${f === k ? 'on' : ''}" data-fkind="${k}">${l} ${counts(k)}</button>`
     )
     .join('')}</div>
   ${can(UI.actor, 'prepare') ? `<div class="row noprint" style="margin:12px 0;align-items:center"><button class="btn sm" data-selall>Select all shown</button><button class="btn pri sm" data-bulk="accept" ${UI.sel.size ? '' : 'disabled'}>Accept ${UI.sel.size || ''} selected</button><button class="btn sm" data-bulk="dismiss" ${UI.sel.size ? '' : 'disabled'}>Dismiss selected</button><span class="small muted">Open items shown: federal ${sgn(tot.fed)}, California ${sgn(tot.ca)} on balance due if all accepted</span></div>` : ''}
   ${list.map(findingCard).join('') || '<p class="muted">Nothing here.</p>'}`;
};
function findingCard(f) {
  const e = f.eff,
    bal = { fed: e.fed - e.fedPay, ca: e.ca - e.caPay };
  const big = Math.abs(bal.fed) > 1000 || Math.abs(bal.ca) > 1000;
  const sel = UI.sel.has(f.id);
  return `<div class="finding ${f.kind}">
   <div class="row" style="justify-content:space-between;align-items:flex-start"><div style="display:flex;gap:10px;align-items:flex-start">${f.status === 'open' && f.kind !== 'pass' && can(UI.actor, 'prepare') ? `<input type="checkbox" data-selfind="${f.id}" ${sel ? 'checked' : ''} aria-label="Select">` : ''}<div><h4>${esc(f.title)}</h4><div class="small muted">${esc(AREA[f.area]?.name)} . check: ${esc(f.check)}</div></div></div>
   <div style="text-align:right"><span class="pill ${f.status === 'open' ? (f.kind === 'error' ? 'red' : f.kind === 'judgment' ? 'amb' : 'ind') : f.status === 'pass' ? 'grn' : ''}">${f.status === 'pass' ? 'agrees' : f.status}</span>${bal.fed || bal.ca ? `<div class="small">federal <b>${sgn(bal.fed)}</b> California <b>${sgn(bal.ca)}</b></div>` : ''}${big && f.status === 'open' ? '<div class="small amb">over 1,000: partner sign-off</div>' : ''}${f.blocking ? '<div class="small bad">blocks e-file</div>' : ''}</div></div>
   <div class="vs"><b>Engine</b><div>${esc(f.engine)}</div><b>Evidence</b><div>${esc(f.evidence)}</div>${f.why ? `<b>Note</b><div>${esc(f.why)}</div>` : ''}</div>
   <div>${f.refs.map((r) => (M.L[r] ? `<span class="srcchip" data-trace="${r}">${r}</span>` : chip(r))).join('')}</div>
   ${f.adj.length ? `<div class="small" style="margin-top:6px">${f.adj.map((a) => `<div>Proposed: ${esc(a.label)} on <span class="srcchip" data-trace="${a.line}">${a.line}</span></div>`).join('')}</div>` : ''}
   ${f.status === 'open' && f.kind !== 'pass' && can(UI.actor, 'prepare') ? `<div class="row noprint" style="margin-top:8px">${f.adj.length ? `<button class="btn ok sm" data-accept="${f.id}">Accept adjustment</button>` : ''}${f.kind !== 'error' || !f.adj.length ? `<button class="btn sm" data-judge="${f.id}">Record judgment</button>` : ''}<button class="btn sm" data-dismiss="${f.id}">Dismiss with reason</button><button class="btn sm" data-askon="${f.id}">Ask client or colleague</button></div>` : ''}
   ${f.status !== 'open' && f.status !== 'pass' ? `<div class="small muted" style="margin-top:6px">${M.S.dismissed[f.id] ? `Dismissed by ${who(M.S.dismissed[f.id].by)}: ${esc(M.S.dismissed[f.id].reason)}` : ''}${M.S.judgments['j-' + f.id] ? `Judgment by ${who(M.S.judgments['j-' + f.id].by)}: ${esc(M.S.judgments['j-' + f.id].decision)}` : ''}${f.status === 'accepted' || f.status === 'pending' ? `Adjustment ${f.status === 'pending' ? 'awaiting partner approval' : 'in the workpaper'}.` : ''}</div>` : ''}
  </div>`;
}
V.gate = () => {
  const g = gate();
  return `<h1>Filing gate</h1><p class="lede">The return can be sent to the client for approval only when nothing below is open. Items come from findings, review notes, sign-offs (which reopen when what was signed changes), required steps and the firm's standards.</p>
   ${g.length ? `<div class="panel"><table>${g.map((x) => `<tr class="click" data-go="${x.go}"><td class="bad">●</td><td>${esc(x.t)}</td></tr>`).join('')}</table></div>` : '<div class="panel ok"><b>Nothing blocks filing.</b> Go to Filing to request client approval.</div>'}
   <h2>Required steps</h2>${stepsList()}`;
};
function stepsList() {
  return `<div class="panel"><ul class="steps" style="list-style:none;padding:0">${stepsState()
    .map(
      (s) =>
        `<li><span class="${s.done ? 'ok' : 'faint'}">${s.done ? '✓' : '○'}</span> ${esc(s.step)} ${s.manual && can(UI.actor, 'prepare') && !M.S.filing.frozen ? `<button class="btn sm" data-step="${esc(s.step)}" data-done="${s.done ? 0 : 1}">${s.done ? 'Reopen' : 'Mark done'}</button>` : ''}${M.S.steps[s.step] ? ` <span class="small faint">${who(M.S.steps[s.step].by)}</span>` : ''}</li>`
    )
    .join('')}</ul></div>`;
}

V.area = (id) => {
  const a = AREA[id];
  if (!a) return '<p>Unknown area.</p>';
  const ks = Object.keys(M.L).filter(
    (k) => areaOfLine(k) === id && !(k.startsWith('F8949.') && !k.endsWith('total'))
  );
  const fs = M.checks.filter((f) => f.area === id);
  const py = P.prior_years.return_2024.lines;
  const prep = preparedBy(id);
  const signBox = (lv) => {
    const s = signState(id, lv);
    const canSign = lv === 'preparer' ? can(UI.actor, 'prepare') : can(UI.actor, 'review');
    const conflict = lv !== 'preparer' && prep.has(UI.actor);
    return `<div class="panel tight"><div class="small muted">${lv} sign-off</div>${s.state === 'signed' ? `<div class="ok">✓ ${who(s.s.by)} ${dshort(s.s.ts)}</div>` : s.state === 'reopened' ? `<div class="amb">Reopened: content changed after ${who(s.s.by)} signed ${dshort(s.s.ts)}</div>` : '<div class="faint">Not signed</div>'}
     ${s.state !== 'signed' && canSign && !M.S.filing.frozen ? (conflict ? '<div class="small bad">You prepared work in this area, so you cannot sign it as ' + lv + '.</div>' : `<button class="btn sm ok" data-sign="${id}|${lv}">Sign off as ${lv}</button>`) : ''}</div>`;
  };
  const as = M.S.assign[id];
  return `<h1>${esc(a.name)}</h1>
   <div class="row">${signBox('preparer')}${signBox('reviewer')}<div class="panel tight"><div class="small muted">Assignment</div><div>${as ? who(as.who) + (as.due ? ' due ' + esc(as.due) : '') : who(P.firm.assignment_at_start.preparer)}</div>${
     can(UI.actor, 'review') || can(UI.actor, 'admin')
       ? `<div class="form-row"><select id="asg-who">${PEOPLE.filter((p) => p.role !== 'client')
           .map((p) => `<option value="${p.id}">${esc(p.name)}</option>`)
           .join(
             ''
           )}</select><input type="text" id="asg-due" placeholder="Due YYYY-MM-DD"><button class="btn sm" data-assign="${id}">Assign</button></div>`
       : ''
   }</div>
   <div class="panel tight"><div class="small muted">Time</div><div>${M.S.time
     .filter((t) => t.area === id)
     .reduce((s, t) => s + t.hours, 0)
     .toFixed(
       1
     )} of ${P.firm.budget_hours[a.budget]} h budget</div>${can(UI.actor, 'time') ? `<div class="form-row"><input type="number" step="0.25" id="time-h" placeholder="Hours"><button class="btn sm" data-time="${id}">Log time</button></div>` : ''}</div></div>
   ${
     fs.filter((f) => f.kind !== 'pass').length
       ? `<h2>Findings</h2>${fs
           .filter((f) => f.kind !== 'pass')
           .map(findingCard)
           .join('')}`
       : ''
   }
   <h2>Lines</h2><div class="tbl-wrap panel"><table><tr><th>Line</th><th>Label</th><th class="n">Engine</th><th class="n">Workpaper</th><th class="n">2024</th><th>Variance</th></tr>
   ${ks
     .map((k) => {
       const l = M.L[k];
       const pv = py[k];
       const vv =
         typeof pv === 'number' && typeof l.value === 'number' ? variance(pv, lineValue(k)) : null;
       return `<tr><td class="small"><span class="srcchip" data-trace="${k}">${k}</span></td><td>${esc(l.label)}</td><td class="n faint">${typeof l.value === 'number' ? money(l.value) : ''}</td><td class="n">${num(k)}</td><td class="n faint">${pv !== undefined ? money(pv) : ''}</td><td>${vv?.flag ? (M.S.variance[k] ? '<span class="pill grn">explained</span>' : '<span class="pill amb">explain</span>') : ''}</td></tr>`;
     })
     .join('')}</table></div>
   ${
     fs.filter((f) => f.kind === 'pass').length
       ? `<h2>Checks that agree</h2>${fs
           .filter((f) => f.kind === 'pass')
           .map(findingCard)
           .join('')}`
       : ''
   }
   <h2>Documents</h2><div class="panel">${a.docs.map((d) => `<span class="srcchip" data-ref="${d}">${d} ${esc(IDX.doc[d].title.slice(0, 46))}</span>`).join('')}</div>
   <h2>Review notes</h2>${
     Object.values(M.S.notes)
       .filter((n) => n.area === id || areaOfLine(n.target) === id)
       .map(noteCard)
       .join('') || '<p class="small muted">None.</p>'
   }
   ${can(UI.actor, 'note') ? `<div class="form-row"><input type="text" id="notetext" placeholder="Review note on this area"><label class="small"><input type="checkbox" id="noteblock" checked> blocks filing</label><button class="btn" data-addnote="area:${id}">Add note</button></div>` : ''}`;
};

V.return = () => {
  const py = P.prior_years.return_2024.lines;
  const rows = [
    ['F1040.1z', 'Wages'],
    ['F1040.2b', 'Taxable interest'],
    ['F1040.3b', 'Ordinary dividends'],
    ['F1040.4b', 'IRA taxable'],
    ['F1040.7', 'Capital gain'],
    ['Sch1.3', 'Business income'],
    ['Sch1.5', 'Schedule E'],
    ['F1040.9', 'Total income'],
    ['F1040.10', 'Adjustments'],
    ['F1040.11', 'AGI'],
    ['F1040.12', 'Deductions'],
    ['F1040.13', 'QBI deduction'],
    ['F1040.15', 'Taxable income'],
    ['F1040.16', 'Tax'],
    ['F1040.17', 'AMT'],
    ['F1040.19', 'Child tax credit'],
    ['F1040.23', 'Other taxes'],
    ['F1040.24', 'Total tax'],
    ['F1040.25d', 'Withholding'],
    ['F1040.26', 'Estimated payments'],
    ['F1040.33', 'Total payments'],
    ['F1040.37', 'Amount owed'],
    ['F540NR.32', 'California AGI'],
    ['F540NR.64', 'California tax']
  ];
  const pyKey = {
    'F1040.1z': 'F1040.1a',
    'F540NR.64': 'CA540.64',
    'F540NR.32': 'CA540.17',
    'F1040.25d': 'F1040.25a'
  };
  const q = UI.search.toLowerCase();
  const forms = {};
  Object.values(M.L).forEach((l) => (forms[l.form] ||= []).push(l));
  return `<h1>Return summary vs 2024</h1><p class="lede">Engine totals with the firm's adjustments applied to the lines they touch. Downstream totals change on engine recompute; the overview shows their estimated effect.</p>
   <div class="tbl-wrap panel"><table><tr><th>Line</th><th></th><th class="n">2025 workpaper</th><th class="n">2024 filed</th><th class="n">Change</th></tr>${rows
     .map(([k, lab]) => {
       const p = py[pyKey[k] || k];
       const v = lineValue(k);
       return `<tr><td class="small faint">${k}</td><td>${lab}</td><td class="n">${num(k)}</td><td class="n faint">${p !== undefined ? money(p) : ''}</td><td class="n">${typeof p === 'number' && typeof v === 'number' ? sgn(v - p) : ''}</td></tr>`;
     })
     .join('')}</table></div>
   <h2>Every line, by form</h2><input type="text" id="linefilter" placeholder="Filter lines by key or label" value="${esc(UI.lineFilter || '')}">
   ${Object.entries(forms)
     .map(([f, ls]) => {
       const sh = ls.filter(
         (l) =>
           !UI.lineFilter ||
           (l.key + ' ' + l.label).toLowerCase().includes(UI.lineFilter.toLowerCase())
       );
       if (!sh.length) return '';
       return `<details ${UI.lineFilter ? 'open' : ''}><summary><b>${esc(f)}</b> <span class="faint small">${ls.length} lines</span></summary><div class="tbl-wrap"><table>${sh
         .slice(0, 400)
         .map(
           (l) =>
             `<tr><td class="small faint">${esc(l.key)}</td><td>${esc(l.label)}</td><td class="n">${num(l.key)}</td></tr>`
         )
         .join('')}</table></div></details>`;
     })
     .join('')}`;
};
