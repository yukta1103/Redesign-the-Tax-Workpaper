V.filing = () => {
  const F = M.S.filing, g = gate(), fz = F.frozen;
  const ef = F.efile || [];
  const steps = [
    ['Extension filed with 36,000 (Form 4868) and FTB 3519 with 0', UI.clock >= '2026-04-14', 'Scripted 04/14 from v2 (what_if.extension).'],
    ['Filing gate clear', g.length===0 || fz, g.length? `${g.length} items open`:''],
    ['Partner requests client approval', !!F.approvalRequested, ''],
    ['Client approves and signs Forms 8879 / FTB 8879', !!F.clientSigned, F.clientSigned?`signed ${dshort(F.clientSigned.ts)} by ${F.clientSigned.by}`:''],
    ['Transmit federal and California e-file', ef.length>0, ef.map(e=>`${e.jurisdiction} ${e.status}`).join(', ')],
    ['Accepted and frozen', !!fz, fz?`frozen ${dshort(fz.ts)}; fingerprint ${fz.hash}`:'']
  ];
  const bal = fz ? fz.fed.balance_due : M.wp.fed.balance_due;
  const days = Math.max(0, (new Date('2026-07-20') - new Date('2026-04-15'))/864e5);
  const intr = bal>0 ? Math.round(bal*P.post_filing_rates.irs_underpayment_interest_rate_annual*days/365) : 0, ftp = bal>0 ? Math.round(bal*P.post_filing_rates.irs_failure_to_pay_penalty_per_month*4) : 0;
  return `<h1>Filing, e-file, freeze</h1>
   <div class="panel"><ul class="tl">${steps.map(s=>`<li class="${s[1]?'':'future'}"><b>${esc(s[0])}</b> ${s[1]?'<span class="ok">✓</span>':''} <span class="small muted">${esc(s[2])}</span></li>`).join('')}</ul>
   <div class="row noprint">
    ${!F.approvalRequested && can(UI.actor,'file') ? `<button class="btn pri" data-filing="request" ${g.length?'disabled title="Clear the filing gate first"':''}>Request client approval</button>`:''}
    ${F.clientSigned && !fz && can(UI.actor,'file') && !(ef.length && ef[ef.length-1].status==='accepted') ? `<button class="btn pri" data-filing="transmit">Transmit e-file</button>`:''}
    ${ef.some(e=>e.jurisdiction==='federal'&&e.status==='accepted') && !fz && can(UI.actor,'file') ? `<button class="btn ok" data-filing="freeze">Freeze filed return</button>`:''}
    ${fz && !M.S.filing.amending && can(UI.actor,'partner') ? `<button class="btn" data-filing="amend">Start an amendment on top</button>`:''}
    ${!can(UI.actor,'file')?'<span class="small muted">Only a partner can request approval, transmit and freeze.</span>':''}
   </div></div>
   ${ef.length?`<h2>E-file submissions</h2><div class="panel tbl-wrap"><table><tr><th>When</th><th>Jurisdiction</th><th>Submission</th><th>Status</th><th>Errors</th></tr>${ef.map(e=>`<tr><td class="small">${dshort(e.date)}</td><td>${e.jurisdiction}</td><td class="small">${e.submission_id}</td><td><span class="pill ${e.status==='accepted'?'grn':'red'}">${e.status}</span></td><td class="small">${(e.errors||[]).map(x=>esc(x.code+': '+x.message)).join('<br>')}</td></tr>`).join('')}</table>${ef[ef.length-1]?.status==='rejected'?'<p class="small bad">Rejected: fix the dependent SSN (finding theo-ssn), then transmit again. The client signature still covers the return because amounts did not change.</p>':''}</div>`:''}
   ${fz?`<h2>Filed return (frozen)</h2><div class="sumgrid"><div><div class="l">Federal total tax</div><div class="v">${fmt(fz.fed.total_tax)}</div></div><div><div class="l">Federal ${fz.fed.balance_due>=0?'balance paid 07/20':'refund'}</div><div class="v">${fmt(Math.abs(fz.fed.balance_due))}</div></div><div><div class="l">California tax</div><div class="v">${fmt(fz.ca.total_tax)}</div></div><div><div class="l">California ${fz.ca.balance_due>=0?'balance':'refund 08/21'}</div><div class="v">${fmt(Math.abs(fz.ca.balance_due))}</div></div></div>
     <p class="small muted">Frozen at acceptance: lines, adjustments, sign-offs and evidence are locked. Changes now go into an amendment layer on top (Form 1040-X / 540X).</p>
     <h2>After filing</h2><div class="panel kv"><b>Federal balance paid after 04/15</b><div>${bal>0?`${fmt(bal)} paid 07/20: interest about ${fmt(intr)} (7% for ${days} days) and failure-to-pay about ${fmt(ftp)} (0.5% x 4 months), assessed by IRS 08/03 (codes 196/276).`:'No balance after the April 14 extension payment; refund due.'}</div><b>IRS transcript 08/03</b><div>${chip('agency:/irs_account_transcript_2025/1')}</div><b>California</b><div>${fz.ca.balance_due<0?`Refund ${fmt(-fz.ca.balance_due)} issued 08/21 by direct deposit.`:'Balance due.'}</div><b>Quality review</b><div>Selected 2027-01-04 by Sam Adeyemi (CPA). The frozen file is the record reviewed.</div></div>`:''}
   ${M.S.filing.amending?`<h2>Amendment in progress</h2><div class="panel">${M.adjs.filter(a=>a.amendment).map(adjRow).join('')||'<p class="small muted">No amended items yet. Adjustments made now are tagged as amendment items.</p>'}</div>`:''}
   <h2>Required steps</h2>${stepsList()}`;
};

V.notice = () => {
  const n = P.tax_agency_records.notices[1], vis = UI.clock >= n.dated;
  if (!vis) return `<h1>Notice response</h1><p class="lede">No open notices as of the season clock. The 2023 CP2000 was resolved (${chip('D70')}). Move the clock to 2028-01-26 to replay the Letter 566 examination.</p>`;
  const fz = M.S.filing.frozen;
  return `<h1>Letter 566: correspondence examination of 2025</h1><p class="lede">Dated ${n.dated}, response due ${n.response_due}. This page is a self-contained record: the frozen figures, the sources, who verified them and when. Print it or save it as PDF to send.</p>
   <div class="row noprint"><button class="btn pri" onclick="window.print()">Print response package</button>${can(UI.actor,'partner')?`<button class="btn" data-notice="sent">Mark response sent</button>`:''}${M.S.notice?.sent?'<span class="pill grn">response sent</span>':''}</div>
   ${!fz?'<p class="bad">Return is not frozen: figures below are live, not as filed.</p>':''}
   <h2>Item 1: Noncash charitable contributions (Schedule A line 12, Form 8283)</h2>
   <div class="panel"><table><tr><th>Gift</th><th class="n">Claimed</th><th>Substantiation</th><th>Verified</th></tr>
    <tr><td>200 sh Northlake Total Market Index Fund to Austin Community Foundation DAF, 12/05/2025; held since 04/2019 (long-term), cost 9,300</td><td class="n">${num('F8283.A1.stock')}</td><td>${chip('doc:D65#page1')} written acknowledgment, no goods or services; publicly traded (no appraisal required)</td><td>${verifs('F8283.A1.stock').map(v=>tickFor_m(v.method)+' '+esc(PERSON[v.by]?.name||'check')).join(', ')||'<span class="faint">none</span>'}</td></tr>
    <tr><td>2012 Subaru Outback to Lone Star Kids Auto Donation, 08/20/2025; sold at auction 09/09/2025</td><td class="n">${num('F8283.A1.vehicle')}</td><td>${chip('doc:D66#page1')} Form 1098-C box 4c gross proceeds 2,900; deduction limited to proceeds (IRC 170(f)(12))</td><td>${M.adjs.find(a=>a.findingId==='car'&&a.status==='active')?'Limited from 6,000 to 2,900 before filing':'<span class="bad">Claimed at 6,000: exposure 3,100</span>'}</td></tr></table></div>
   <h2>Item 2: Schedule C gross receipts vs Forms 1099-NEC (142,000) and 1099-K (12,400)</h2>${V.books().split('<h2>Gross receipts to information returns</h2>')[1]||''}
   <div class="panel small">Reported gross receipts: ${num('SchC.1')}. ${M.adjs.find(a=>a.findingId==='1099k-dup'&&a.status==='active')?'The 12,400 card payments are inside Atlas\u2019s 41,200 (D15 p3); receipts were filed at 151,300 after removing the double count.':'<span class="bad">Filed at 163,700, which counted the 1099-K twice: the return overstated receipts by 12,400 (taxpayer-favorable correction available).</span>'}</div>
   <h2>Who prepared, reviewed and signed</h2><div class="panel small">${AREAS.filter(a=>['business','deductions'].includes(a.id)).map(a=>`${esc(a.name)}: ${['preparer','reviewer'].map(l=>{const s=M.S.signoffs[a.id+'|'+l]; return s?`${l} ${esc(PERSON[s.by]?.name)} ${dshort(s.ts)}`:`${l} not signed`;}).join('; ')}`).join('<br>')}<br>Return partner: ${M.S.signoffs['return|partner']?esc(PERSON[M.S.signoffs['return|partner'].by].name):'not signed'}. Paid preparer: ${esc(PERSON[P.firm.firm_identity.paid_preparer_signing_returns].name)}, PTIN ${esc(P.firm.firm_identity.ptins[P.firm.firm_identity.paid_preparer_signing_returns])}.</div>`;
};

V.nextyear = () => {
  const tax25 = M.S.filing.frozen?.fed.total_tax ?? M.wp.fed.total_tax, ca25 = M.S.filing.frozen?.ca.total_tax ?? M.wp.ca.total_tax;
  const fedReq = Math.round(tax25*1.10), q = Math.ceil(fedReq/4);
  return `<h1>Next year: roll forward and plan 2026</h1><p class="lede">Everything carries forward with its history. The 2026 preparer opens this file on 2027-01-15 and starts from here.</p>
   <div class="grid2"><div class="panel"><h3 style="margin-top:0">Carries forward</h3><table>
    <tr><td>Minimum tax credit from 2025 AMT (Form 8801)</td><td class="n">${fmt(M.V.carryovers_out.federal.minimum_tax_credit_from_2025_amt)}</td></tr>
    <tr><td>ISO shares (1,000 Corvane): regular basis 12,000, AMT basis 52,000</td><td class="n">40,000 diff</td></tr>
    <tr><td>SEP contribution not deductible for 2025 (excise unless withdrawn)</td><td class="n">${fmt(M.V.carryovers_out.federal.sep_contribution_not_deductible_for_2025)}+</td></tr>
    <tr><td>Ridgeline ending capital (start an outside-basis schedule)</td><td class="n">${fmt(M.V.carryovers_out.federal.ridgeline_capital_account_end)}</td></tr>
    <tr><td>Woodworks stock basis</td><td class="n">0</td></tr>
    <tr><td>California depreciation basis differences</td><td class="n">${fmt(Object.values(M.V.carryovers_out.california.depreciation_basis_differences).reduce((a,b)=>a+b,0),2)}</td></tr>
    ${M.adjs.find(a=>a.findingId==='hvac'&&a.status==='active')?'<tr><td>New asset SAC-HVAC 11,000 (27.5 yr, Aug 2025)</td><td class="n">10,850 basis</td></tr>':''}
    <tr><td>Capital loss and passive carryovers</td><td class="n">0 (used in 2025)</td></tr></table></div>
   <div class="panel"><h3 style="margin-top:0">2026 estimates</h3><div class="kv"><b>Federal safe harbor</b><div>110% of 2025 tax ${fmt(tax25)} = ${fmt(fedReq)}; ${fmt(q)} on each of ${P.planning_reference_2026.federal_estimate_due_dates.join(', ')}</div><b>Withholding credit</b><div>Ngozi's 2026 withholding counts against this; set estimates net of it.</div><b>California</b><div>${esc(P.planning_reference_2026.california_safe_harbor)} 110% of ${fmt(ca25)} = ${fmt(Math.round(ca25*1.1))} at 30/40/30, but 2026 California-source income is only the Sacramento rental and Ridgeline's share: plan on 90% of 2026 tax instead.</div></div></div></div>
   <h2>Open into 2026</h2><div class="panel"><ul>${P.planning_reference_2026.known_2026_changes_for_this_household.map(x=>`<li>${esc(x)}</li>`).join('')}<li>Ask Halvorsen for a corrected 2025 W-2 (state wages) and fix 2026 payroll state.</li><li>Form 3520 for 2023 and FBAR follow-up (outside filings).</li><li>File 2025 Forms 1099-NEC for the two contractors; set up 2026 W-9s.</li><li>Ada turns 20, still a student: dependency test again; AOTC phased out at this income.</li></ul></div>`;
};

V.firm = () => {
  const std = M.std, isAdmin = can(UI.actor,'admin');
  const hrs = AREAS.map(a=>({a, h:M.S.time.filter(t=>t.area===a.id).reduce((s,t)=>s+t.hours,0)}));
  return `<h1>Firm: standards, access, time</h1>
   <h2>Standards ${isAdmin?'':'<span class="small muted">(only the firm administrator can change these)</span>'}</h2>
   <div class="panel"><div class="form-row"><label>Flag variance over %<input type="number" id="std-pct" value="${std.variance_review.flag_if_change_over_percent}" ${isAdmin?'':'disabled'}></label><label>and over amount<input type="number" id="std-amt" value="${std.variance_review.and_over_amount}" ${isAdmin?'':'disabled'}></label><label>Partner sign-off above tax effect<input type="number" id="std-partner" value="${std.partner_threshold ?? 1000}" ${isAdmin?'':'disabled'}></label></div>
   ${isAdmin?'<button class="btn pri" data-savestd>Save standards</button>':''}<ul class="small">${std.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul><div class="small muted">Verification types: ${std.verification_types.map(v=>esc(METHODS[v]?.label||v)).join(', ')}. Review levels: ${std.review_levels.join(', ')}.</div></div>
   <h2>Staff and access</h2><div class="panel tbl-wrap"><table><tr><th>Person</th><th>Role</th><th>Credential</th><th>Sensitive data</th><th>Active from</th><th>Can</th></tr>${PEOPLE.map(p=>`<tr><td>${who(p.id)}</td><td>${esc(p.role)}</td><td>${esc(p.cred||'')}</td><td>${p.clear?'<span class="ok">cleared</span>':'<span class="bad">masked</span> <span class="small">'+esc(p.note||'')+'</span>'}</td><td class="small">${esc(p.from||'')}</td><td class="small">${(ROLE_CAN[p.role]||[]).join(', ')}</td></tr>`).join('')}</table></div>
   <h2>Sensitive data view log</h2><div class="panel">${M.S.reveals.length?`<table>${M.S.reveals.slice().reverse().map(r=>`<tr><td>${who(r.actor)}</td><td>${esc(r.field)}</td><td class="small">${ago(r.ts)}</td></tr>`).join('')}</table>`:'<p class="small muted">No unmasked views yet. Every "Show" on an SSN, account number or IP PIN is logged here.</p>'}
   <p class="small">Household: Ngozi ${sens(P.household.people[0].ssn,'ssn:ngozi')} IP PIN ${sens(P.household.people[0].ip_pin,'ippin:ngozi')} . Refund account ${sens(P.household.bank_account_for_refund_or_payment.account,'bank:acct')}</p></div>
   <h2>Time against budget</h2><div class="panel">${hrs.map(x=>{const b=P.firm.budget_hours[x.a.budget]; return `<div class="form-row" style="flex-wrap:nowrap"><span style="flex:0 0 260px">${esc(x.a.name)}</span><div class="bar" style="flex:1"><i class="${x.h>b?'over':''}" style="width:${Math.min(100,x.h/b*100)}%"></i></div><span style="flex:0 0 90px" class="small n">${x.h.toFixed(1)} / ${b} h</span></div>`;}).join('')}</div>
   <h2>Retention</h2><p class="small muted">Records are retained 7 years after filing${M.S.filing.frozen?`: destroy after ${String(+M.S.filing.frozen.ts.slice(0,4)+7)}-${M.S.filing.frozen.ts.slice(5,10)}`:''}. The ledger is append-only; reversals and undos are events, never deletions.</p>
   ${isAdmin?'<h2>Prototype data</h2><button class="btn bad" data-resetall>Clear this device\u2019s workpaper ledger</button>':''}`;
};

V.about = () => {
  const errs = M.checks.filter(f=>f.kind==='error'), jud = M.checks.filter(f=>f.kind==='judgment');
  return `<h1>The core idea</h1>
   <div class="panel" style="max-width:80ch"><p><b>A workpaper is a proof, not a spreadsheet.</b> Every number on the return is a claim. A claim is proven when it has a source (a field on a page, an agency record, a client answer), a derivation (the rule and the inputs), and a verification (a tick mark: who checked it, how, against what). The workpaper's job is to show which claims are proven, which are not, and what blocks filing.</p>
   <p><b>Data model.</b> The packet is immutable evidence: documents, extracted values, engine versions, client answers, agency records. On top sits one append-only <i>ledger</i> of events (adjustment proposed, verified, note written, question answered, signed off, filed). The current workpaper is a fold over the ledger. Nothing is ever overwritten: an adjustment keeps the engine value, who, why, authority and tax effect; undo is an event; a filed return is a frozen fingerprint and an amendment is a new layer on top.</p>
   <p><b>Three node types, one graph.</b> Evidence (document page + field position), Line (engine output with rule and inputs), Act (ledger event pointing at evidence or lines). Tracing walks the graph down to the page; impact walks it up. Sign-offs store a hash of the lines and adjustments under them, so they reopen on their own when what was signed changes. Independent checks recompute from evidence and attach tick marks when they agree, findings when they do not.</p>
   <p><b>Source documents are behind an adapter</b> (pages, locate field). Today it renders printed content with the synthetic box; real page images replace it without touching the trace.</p></div>
   <h2>Errors the checks found (${errs.length}) and judgment calls (${jud.length})</h2>
   <div class="panel tbl-wrap"><table><tr><th>Finding</th><th>How the design surfaced it</th><th class="n">Federal</th><th class="n">California</th></tr>${[...errs,...jud].map(f=>`<tr><td><b>${esc(f.title)}</b><div class="small muted">${esc(f.evidence)}</div></td><td class="small">${esc(f.check)}</td><td class="n">${sgn(f.eff.fed-f.eff.fedPay)}</td><td class="n">${sgn(f.eff.ca-f.eff.caPay)}</td></tr>`).join('')}</table></div>`;
};

V.search = () => {
  const q = UI.search.toLowerCase(); if (q.length<2) return '<h1>Search</h1><p class="muted">Type at least two characters.</p>';
  const lines = Object.values(M.L).filter(l => (l.key+' '+l.label).toLowerCase().includes(q)).slice(0,60);
  const docs = P.documents.filter(d => (d.id+' '+d.title+' '+d.pages.map(p=>p.printed_content).join(' ')).toLowerCase().includes(q)).slice(0,30);
  const notes = Object.values(M.S.notes).filter(n=>n.text.toLowerCase().includes(q));
  const fs = M.checks.filter(f=>(f.title+f.evidence).toLowerCase().includes(q));
  const qa = P.client.questionnaire.filter(x=>(x.question+x.answer).toLowerCase().includes(q));
  return `<h1>Search: ${esc(UI.search)}</h1>
   ${fs.length?`<h2>Findings</h2>${fs.map(f=>`<div class="srcchip" data-go="findings">${esc(f.title)}</div>`).join('')}`:''}
   <h2>Lines (${lines.length})</h2><div class="panel tbl-wrap"><table>${lines.map(l=>`<tr><td class="small faint">${l.key}</td><td>${esc(l.label)}</td><td class="n">${num(l.key)}</td></tr>`).join('')||'<tr><td class="muted">none</td></tr>'}</table></div>
   <h2>Documents (${docs.length})</h2><div class="panel">${docs.map(d=>`<span class="srcchip" data-ref="${d.id}">${d.id} ${esc(d.title)}</span>`).join('')||'none'}</div>
   ${qa.length?`<h2>Client answers</h2><div class="panel">${qa.map(x=>chip(x.id)+' '+esc(x.answer)).join('<br>')}</div>`:''}
   ${notes.length?`<h2>Notes</h2>${notes.map(noteCard).join('')}`:''}`;
};

/* ---------- client portal ---------- */
V.client = (sub) => {
  const me = PERSON[UI.actor], F = M.S.filing, fz = F.frozen;
  if (sub==='questions'){ const qs = Object.values(M.S.questions).filter(q=>q.to.startsWith('cu-'));
    return `<h1>Questions for you</h1><p class="lede">Your answers go straight into the file as evidence for your return.</p>${qs.length?qs.map(q=>`<div class="panel"><p><b>${esc(q.text)}</b></p><div class="small muted">From ${esc(PERSON[q.by]?.name)} ${dshort(q.ts)}</div>${q.answers.map(a=>`<p>${esc(a.text)} <span class="small faint">${esc(PERSON[a.by]?.name)}</span></p>`).join('')}<div class="form-row"><input type="text" data-ansfor="${q.id}" placeholder="Your answer"><button class="btn ok" data-answer="${q.id}">Send answer</button></div></div>`).join(''):'<p class="muted">No questions right now.</p>'}`; }
  if (sub==='copy') return clientCopy();
  const s = fz || {fed:M.wp.fed, ca:M.wp.ca};
  return `<h1>Hello, ${esc(me.name.split(' ')[0])}</h1><p class="lede">Your 2025 federal and California returns, prepared by Miraflores.</p>
   <div class="sumgrid"><div><div class="l">Federal</div><div class="v">${s.fed.balance_due>=0?'You owe '+fmt(s.fed.balance_due):'Refund '+fmt(-s.fed.balance_due)}</div><div class="d">after the 36,000 you paid in April</div></div><div><div class="l">California</div><div class="v">${s.ca.balance_due>=0?'You owe '+fmt(s.ca.balance_due):'Refund '+fmt(-s.ca.balance_due)}</div></div></div>
   <h2>Status</h2><div class="panel">${fz?'<b class="ok">Filed and accepted.</b>':F.clientSigned?'Signed. We will file and confirm acceptance.':F.approvalRequested?'<b>Ready for your approval.</b> Review the summary, then sign below.':'We are still preparing your return.'}</div>
   ${F.approvalRequested && !F.clientSigned ? `<div class="panel"><h3 style="margin-top:0">Approve and sign (Forms 8879 and FTB 8879)</h3><p class="small">By entering your five-digit PIN you declare you have examined the return and it is true, correct and complete, and authorize the firm to file it electronically. Prior-year AGI for signature: ${fmt(P.household.prior_year_agi_for_esignature)}.</p><div class="form-row"><input type="text" id="pin1" placeholder="Taxpayer PIN (Ngozi)" maxlength="5"><input type="text" id="pin2" placeholder="Spouse PIN (Erik)" maxlength="5"><button class="btn ok" data-filing="sign">Approve and sign</button></div></div>`:''}
   ${Object.values(M.S.questions).some(q=>q.to.startsWith('cu-')&&q.status==='open')?'<p><a href="#client/questions">You have questions to answer.</a></p>':''}`;
};
function clientCopy(){
  const fz = M.S.filing.frozen; const L = k => fz?.lines?.[k] ?? lineValue(k);
  const rows = ['F1040.1z','F1040.2b','F1040.3b','F1040.7','F1040.8','F1040.11','F1040.12','F1040.13','F1040.15','F1040.24','F1040.33','F1040.37','F540NR.17','F540NR.32','F540NR.64','F540NR.78','F540NR.97'];
  return `<h1>Your copy: 2025 return summary</h1><p class="noprint"><button class="btn" onclick="window.print()">Print or save as PDF</button></p><div class="panel"><div class="kv"><b>Filing status</b><div>Married filing jointly</div><b>Taxpayer</b><div>Ngozi Okafor ${sens(P.household.people[0].ssn,'ssn:ngozi')}</div><b>Spouse</b><div>Erik Lindqvist</div><b>Dependents</b><div>Ada, Theo</div><b>Status</b><div>${fz?'Accepted '+dshort(fz.ts):'Not yet filed (draft)'}</div></div>
   <table style="margin-top:12px">${rows.map(k=>`<tr><td>${esc(M.L[k]?.label||k)}</td><td class="n">${fmt(L(k))}</td></tr>`).join('')}</table>
   <p class="small muted">Engine line values shown with the firm's line adjustments; totals as filed: federal tax ${fmt((fz?.fed||M.wp.fed).total_tax)}, California tax ${fmt((fz?.ca||M.wp.ca).total_tax)}.</p></div>`;
}

/* =====================================================================
   RENDER + EVENTS
   ===================================================================== */
function render(){
  M = model(); chrome();
  const [r, sub] = UI.route.split('/');
  const me = PERSON[UI.actor];
  let html;
  if (me.role==='client') html = V.client(sub);
  else if (UI.search && r==='search') html = V.search();
  else if (r==='area') html = V.area(sub);
  else html = (V[r]||V.overview)(sub);
  $('main').innerHTML = html;
  renderDrawer();
}
function evidenceList(s){ return (s||'').split(',').map(x=>x.trim()).filter(Boolean); }
function partnerNeeded(f){ const t = (M.std.partner_threshold ?? 1000); return Math.abs(f.eff.fed - f.eff.fedPay) > t || Math.abs(f.eff.ca - f.eff.caPay) > t; }
function acceptEvents(f){ const np = partnerNeeded(f) && !can(UI.actor,'partner'); return f.adj.map(a => ['adj.add', {adjId: uid('adj'), findingId:f.id, area:f.area, adj:{...a, reason:f.title+'. '+f.evidence, authority:f.check, needsPartner:np}}]); }
function modal(title, fields){
  return new Promise(res => {
    const bg = document.createElement('div'); bg.className='modal-bg';
    bg.innerHTML = `<div class="modal" role="dialog" aria-label="${esc(title)}"><h2 style="margin-top:0">${esc(title)}</h2>${fields.map((f,i)=>`<label class="small muted">${esc(f.label)}</label>${f.long?`<textarea rows="3" data-mf="${i}">${esc(f.value||'')}</textarea>`:`<input type="text" data-mf="${i}" value="${esc(f.value||'')}">`}`).join('')}<div class="row" style="margin-top:12px;justify-content:flex-end"><button class="btn" data-mcancel>Cancel</button><button class="btn pri" data-mok>Save</button></div></div>`;
    document.body.appendChild(bg); bg.querySelector('[data-mf]')?.focus();
    bg.addEventListener('click', e => {
      if (e.target.matches('[data-mcancel]') || e.target===bg){ bg.remove(); res(null); }
      if (e.target.matches('[data-mok]')){ const vals = [...bg.querySelectorAll('[data-mf]')].map(x=>x.value.trim()); if (fields.some((f,i)=>f.required && !vals[i])) { toast('Fill in the required fields.'); return; } bg.remove(); res(vals); }
    });
  });
}
const frozenGuard = () => { if (M.S.filing.frozen && !M.S.filing.amending){ toast('The filed return is frozen. Start an amendment to change it.'); return true; } return false; };

document.addEventListener('click', async e => {
  const t = e.target.closest('[data-trace],[data-ref],[data-go],[data-close],[data-back],[data-docpage],[data-accept],[data-dismiss],[data-judge],[data-bulk],[data-selall],[data-fkind],[data-verify],[data-addnote],[data-resolve],[data-reopen],[data-approve],[data-approveall],[data-reverse],[data-madj],[data-sign],[data-step],[data-undo],[data-seen],[data-disp],[data-varsave],[data-varauto],[data-ask],[data-answer],[data-askon],[data-jtemplate],[data-filing],[data-notice],[data-savestd],[data-resetall],[data-reveal],[data-assign],[data-time],[data-sbox],[data-sflag],[data-spage],[data-menu]');
  if (!t) return;
  const d = t.dataset;
  if (d.trace!==undefined){ e.preventDefault(); openDrawer('line', d.trace, {back: UI.drawer}); return; }
  if (d.ref!==undefined){ if (M.L[d.ref]) openDrawer('line', d.ref, {back:UI.drawer}); else openDrawer('ref', d.ref, {back: UI.drawer}); return; }
  if (d.go!==undefined){ closeDrawer(); go(d.go); return; }
  if (d.close!==undefined){ closeDrawer(); return; }
  if (d.back!==undefined){ UI.drawer = UI.drawer.back; renderDrawer(); return; }
  if (d.menu!==undefined){ $('nav.rail').classList.toggle('show'); return; }
  if (d.docpage){ const [doc,pg,ev] = d.docpage.split('|'); UI.drawer = {...UI.drawer, page:+pg}; if (ev) UI.drawer.kind='ref'; renderDrawer(); return; }
  if (d.fkind){ UI.filters.kind = d.fkind; UI.sel.clear(); render(); return; }
  if (d.selall!==undefined){ M.checks.filter(f=>f.status==='open'&&f.kind!=='pass').forEach(f=>UI.sel.add(f.id)); render(); return; }
  if (d.sbox){ UI.salesFilter.box = d.sbox; UI.salesFilter.page=0; render(); return; }
  if (d.sflag){ UI.salesFilter.flag = d.sflag; UI.salesFilter.page=0; render(); return; }
  if (d.spage){ UI.salesFilter.page = +d.spage; render(); return; }
  if (d.reveal){ if (!PERSON[UI.actor].clear){ toast('No sensitive-data clearance.'); return; } UI.revealed.add(d.reveal); Store.append('reveal',{field:d.field}); toast('Unmasked view logged.'); return; }
  if (frozenGuard() && (d.accept||d.bulk||d.verify||d.madj||d.disp||d.varsave||d.varauto||d.reverse)) return;
  if (d.accept){ const f = M.checks.find(x=>x.id===d.accept); const {events} = Store.appendMany(acceptEvents(f)); toast(partnerNeeded(f) && !can(UI.actor,'partner') ? 'Adjustment proposed: partner approval needed (over 1,000).' : 'Adjustment accepted.', events.map(x=>x.id)); return; }
  if (d.bulk){ const fs = M.checks.filter(f=>UI.sel.has(f.id));
    if (d.bulk==='accept'){ const evs = fs.filter(f=>f.adj.length).flatMap(acceptEvents); if (!evs.length){ toast('None of the selected findings has an adjustment.'); return; } const {events} = Store.appendMany(evs); UI.sel.clear(); toast(`${fs.filter(f=>f.adj.length).length} findings accepted.`, events.map(x=>x.id)); }
    else { const v = await modal(`Dismiss ${fs.length} findings`, [{label:'Reason (required, kept with each finding)', long:true, required:true}]); if (!v) return; const {events} = Store.appendMany(fs.map(f=>['finding.dismiss',{findingId:f.id, reason:v[0], area:f.area}])); UI.sel.clear(); toast(`${fs.length} dismissed.`, events.map(x=>x.id)); }
    return; }
  if (d.dismiss){ const v = await modal('Dismiss finding', [{label:'Why the engine is right or the item does not apply', long:true, required:true}]); if (!v) return; const ev = Store.append('finding.dismiss',{findingId:d.dismiss, reason:v[0], area:M.checks.find(f=>f.id===d.dismiss)?.area}); toast('Dismissed.', [ev.id]); return; }
  if (d.judge){ const f = M.checks.find(x=>x.id===d.judge); const v = await modal('Record judgment', [{label:'Topic', value:f.title},{label:'Decision', long:true, required:true, value:f.why||''},{label:'Authority relied on (required by firm rule)', required:true},{label:'Penalty consideration (6662 / 6694 exposure, disclosure)', long:true}]); if (!v) return; const ev = Store.append('judgment',{jId:'j-'+f.id, topic:v[0], decision:v[1], authority:v[2], penalty:v[3], area:f.area}); toast('Judgment recorded.', [ev.id]); return; }
  if (d.jtemplate){ const T = {'j-8867':['Due diligence (Form 8867): CTC and ODC','Interviewed client; Theo and Ada qualify; SSNs agreed to card and prior return; records retained.','IRC 6695(g); Treas. Reg. 1.6695-2'],'j-bonus':['Election: 100% special depreciation on studio equipment','Keep special allowance; section 179 saves 1,050 California only.','IRC 168(k)'],'j-itemize':['Itemize deductions','Itemized exceeds standard.','IRC 63'],'j-penalty':['Estimated tax penalty method','Regular method; annualized gives same result.','IRC 6654']}[d.jtemplate]; const ev = Store.append('judgment',{jId:d.jtemplate, topic:T[0], decision:T[1], authority:T[2], area:'identity'}); toast('Judgment recorded.', [ev.id]); return; }
  if (d.verify){ const ev = Store.append('verify',{target:d.verify, method:$('#vmethod').value, note:$('#vnote').value, evidence:evidenceList($('#vevid').value), valueAt: lineValue(d.verify), area:areaOfLine(d.verify)}); toast('Verification recorded.', [ev.id]); return; }
  if (d.madj){ const amt = +$('#madj-amt').value, cat = $('#madj-cat').value, why = $('#madj-why').value.trim(); if (!amt || !why){ toast('Enter an amount and a reason.'); return; }
    const a = cat.startsWith('payment') ? {line:d.madj, kind:'payment', [cat==='payment-fed'?'fedPay':'caPay']:amt, label:`Manual: ${sgn(amt)} on ${d.madj}`} : {line:d.madj, kind:'rate', cat, amount:amt, label:`Manual: ${sgn(amt)} on ${d.madj}`};
    const e1 = effect(a, M.vk); const np = (Math.abs(e1.fed-e1.fedPay)>1000||Math.abs(e1.ca-e1.caPay)>1000) && !can(UI.actor,'partner');
    const ev = Store.append('adj.add',{adjId:uid('adj'), area:areaOfLine(d.madj), adj:{...a, reason:why, authority:$('#madj-auth').value, needsPartner:np}}); toast(np?'Proposed: partner approval needed.':'Adjustment added.', [ev.id]); return; }
  if (d.addnote){ const txt = $('#notetext').value.trim(); if (!txt) return; const isArea = d.addnote.startsWith('area:'); const ev = Store.append('note.add',{noteId:uid('n'), target: isArea? d.addnote.slice(5) : d.addnote, area: isArea? d.addnote.slice(5) : areaOfLine(d.addnote), text:txt, blocking:$('#noteblock').checked}); toast('Note added.', [ev.id]); return; }
  if (d.resolve){ const inp = document.querySelector(`[data-replyfor="${d.resolve}"]`); if (inp?.value) Store.append('note.reply',{noteId:d.resolve, text:inp.value}); Store.append('note.resolve',{noteId:d.resolve}); toast('Note cleared.'); return; }
  if (d.reopen){ Store.append('note.reopen',{noteId:d.reopen}); return; }
  if (d.approve){ const a = M.S.adj[d.approve]; if (a.by===UI.actor){ toast('You cannot approve your own adjustment.'); return; } Store.append('adj.approve',{adjId:d.approve}); toast('Approved.'); return; }
  if (d.approveall!==undefined){ const ids = M.adjs.filter(a=>a.status==='pending_partner' && a.by!==UI.actor).map(a=>a.id); const {events} = Store.appendMany(ids.map(id=>['adj.approve',{adjId:id}])); toast(`${ids.length} approved.`, events.map(x=>x.id)); return; }
  if (d.reverse){ const v = await modal('Reverse adjustment', [{label:'Why', required:true, long:true}]); if (!v) return; const ev = Store.append('adj.reverse',{adjId:d.reverse, reason:v[0]}); toast('Reversed. The original stays in the history.', [ev.id]); return; }
  if (d.sign){ const [area, level] = d.sign.split('|'); if (level!=='preparer' && preparedBy(area).has(UI.actor)){ toast('You prepared work here: someone else must sign this level.'); return; } const ev = Store.append('signoff',{area, level, hash: areaHash(area)}); toast(`Signed off as ${level}.`, [ev.id]); return; }
  if (d.step){ Store.append('step',{step:d.step, done:d.done==='1'}); return; }
  if (d.undo){ const ids = d.undo.split(','); Store.append('undo',{ids}); $('#toast').hidden = true; toast(`Undid ${ids.length} change(s).`); return; }
  if (d.seen!==undefined){ Store.append('seen',{}); return; }
  if (d.disp){ const v = await modal(`Account for ${d.disp}`, [{label:'Disposition (used as support / not relevant / duplicate / outside scope)', required:true, value:'used as support'},{label:'Reason', long:true, value:docReason(d.disp)}]); if (!v) return; Store.append('doc.disp',{doc:d.disp, disp:v[0], reason:v[1]}); return; }
  if (d.varsave){ const v = document.querySelector(`[data-varfor="${d.varsave}"]`).value.trim(); if (!v) return; Store.append('variance.explain',{key:d.varsave, text:v}); return; }
  if (d.varauto!==undefined){ const ex = varianceExplanations(); const list = variances().filter(v=>v.flag && !M.S.variance[v.k]).map(v=>['variance.explain',{key:v.k, text: ex(v.k) || 'Driven by changes in the underlying inputs; see trace.'}]); if (!list.length) return; const {events} = Store.appendMany(list); toast(`${list.length} explanations drafted. Review and edit any.`, events.map(x=>x.id)); return; }
  if (d.ask!==undefined){ const txt = $('#q-text').value.trim(); if (!txt) return; Store.append('q.ask',{qId:uid('q'), to:$('#q-to').value, text:txt, target:$('#q-target').value.trim()}); toast('Question sent.'); return; }
  if (d.askon){ const f = M.checks.find(x=>x.id===d.askon); const v = await modal('Ask about '+f.title, [{label:'To: cu-01 Ngozi, cu-02 Erik, or a staff id (st-02 Daniel ...)', value:'cu-01', required:true},{label:'Question', long:true, required:true}]); if (!v) return; Store.append('q.ask',{qId:uid('q'), to:v[0], text:v[1], target:f.id}); toast('Question sent.'); return; }
  if (d.answer){ const inp = document.querySelector(`[data-ansfor="${d.answer}"]`); if (!inp.value.trim()) return; Store.append('q.answer',{qId:d.answer, text:inp.value.trim()}); toast('Answer saved as evidence.'); return; }
  if (d.assign){ Store.append('assign',{area:d.assign, who:$('#asg-who').value, due:$('#asg-due').value}); toast('Assigned. They will see it in their changes.'); return; }
  if (d.time){ const h = +$('#time-h').value; if (!h) return; Store.append('time',{area:d.time, hours:h}); return; }
  if (d.savestd!==undefined){ const s = JSON.parse(JSON.stringify(M.std)); s.variance_review.flag_if_change_over_percent = +$('#std-pct').value; s.variance_review.and_over_amount = +$('#std-amt').value; s.partner_threshold = +$('#std-partner').value; Store.append('standards',{standards:s}); toast('Standards saved for the firm.'); return; }
  if (d.resetall!==undefined){ if (confirm('Clear every workpaper event on this device?')) Store.reset(); return; }
  if (d.notice){ Store.append('notice',{patch:{sent:new Date().toISOString()}}); return; }
  if (d.filing){
    const F = M.S.filing;
    if (d.filing==='request'){ if (gate().length){ toast('Clear the filing gate first.'); return; } Store.append('filing',{patch:{approvalRequested:{by:UI.actor, ts:new Date().toISOString(), snapshot:{fed:M.wp.fed, ca:M.wp.ca}}}}); Store.append('q.ask',{qId:uid('q'), to:'cu-01', text:'Your 2025 returns are ready. Please review the summary and sign Forms 8879.', target:'filing'}); toast('Sent to the client for approval.'); return; }
    if (d.filing==='sign'){ const p1 = $('#pin1').value, p2 = $('#pin2').value; if (!/^\d{5}$/.test(p1) || !/^\d{5}$/.test(p2)){ toast('Both PINs must be five digits.'); return; } Store.append('filing',{patch:{clientSigned:{by:PERSON[UI.actor].name, ts:new Date().toISOString(), amounts:{fed:M.wp.fed, ca:M.wp.ca}}}}); toast('Signed. Thank you.'); return; }
    if (d.filing==='transmit'){ const theo = M.checks.find(f=>f.id==='theo-ssn'); const bad = theo && theo.status!=='accepted'; const ef = [...(F.efile||[])];
      const subs = P.tax_agency_records.efile;
      if (bad){ ef.push({...subs[0], date:new Date().toISOString()}, {...subs[1], date:new Date().toISOString()}); Store.append('filing',{patch:{efile:ef}}); toast('Federal e-file rejected: dependent TIN mismatch.'); }
      else { ef.push({...subs[2], date:new Date().toISOString()}, {...subs[3], date:new Date().toISOString()}); Store.append('filing',{patch:{efile:ef}}); toast('Accepted by IRS and FTB.'); }
      return; }
    if (d.filing==='freeze'){ const lines = {}; Object.keys(M.L).forEach(k=>lines[k]=lineValue(k)); Store.append('filing',{patch:{frozen:{ts:new Date().toISOString(), fed:M.wp.fed, ca:M.wp.ca, hash:areaHash('return'), lines, version:M.vk}}}); toast('Filed return frozen.'); return; }
    if (d.filing==='amend'){ Store.append('filing',{patch:{amending:{by:UI.actor, ts:new Date().toISOString()}}}); toast('Amendment layer opened on top of the filed return.'); return; }
  }
});
document.addEventListener('change', e => {
  if (e.target.id==='actor') setActor(e.target.value);
  if (e.target.id==='clock') setClock(e.target.value);
  if (e.target.dataset.selfind){ e.target.checked ? UI.sel.add(e.target.dataset.selfind) : UI.sel.delete(e.target.dataset.selfind); render(); }
  if (e.target.dataset.sandbox){ e.target.checked ? UI.sandbox.add(e.target.dataset.sandbox) : UI.sandbox.delete(e.target.dataset.sandbox); render(); }
});
let searchT;
document.addEventListener('input', e => {
  if (e.target.id==='gsearch'){ clearTimeout(searchT); const v = e.target.value; searchT = setTimeout(()=>{ UI.search = v; if (v.length>=2){ if (UI.route!=='search') go('search'); else render(); } else if (UI.route==='search') go('overview'); const g=$('#gsearch'); g?.focus(); g?.setSelectionRange(v.length,v.length); }, 250); }
  if (e.target.id==='linefilter'){ clearTimeout(searchT); const v=e.target.value; searchT=setTimeout(()=>{ UI.lineFilter=v; render(); const g=$('#linefilter'); g.focus(); g.setSelectionRange(v.length,v.length); },300); }
  if (e.target.id==='salesq'){ clearTimeout(searchT); const v=e.target.value; searchT=setTimeout(()=>{ UI.salesFilter.q=v; UI.salesFilter.page=0; render(); const g=$('#salesq'); g.focus(); g.setSelectionRange(v.length,v.length); },300); }
});
document.addEventListener('keydown', e => { if (e.key==='Escape' && UI.drawer) closeDrawer(); });
function varianceExplanations(){
  const t = {
    'F1040.1a':'New employer mid-year (Halvorsen from 06/02) plus RSU vests at Corvane; two W-2s.',
    'F1040.7':'Condo sale gain 105,040, S corp distributions over basis 21,215, 282 brokerage sales; 2024 was a capped loss.',
    'F1040.11':'Condo gain, RSU and brokerage sales, higher wages.', 'F1040.9':'See AGI.', 'F1040.8':'Rental losses fully allowed in 2025 (passive income from sale).',
    'F1040.12':'Itemized in 2025 (new home mortgage interest, charitable stock gift) vs standard in 2024.',
    'F1040.15':'See AGI and itemized deductions.', 'F1040.16':'Higher taxable income; capital gains at preferential rates.',
    'F1040.24':'Higher income, AMT from ISO exercise, NIIT.', 'F1040.25a':'Lower federal withholding at Halvorsen.', 'F1040.26':'Quarterly estimates 3,000 x 4 in 2025.',
    'F1040.33':'Extension payment 36,000.', 'F1040.19':'CTC phased out above 400,000 MAGI.', 'F1040.13':'QBI deduction limited by income; W-2/UBIA phase-in.',
    'SchC.1':'New clients; Atlas card payments via Paywell.', 'SchC.9':'Business miles up (Austin client base); see mileage finding.', 'SchC.11':'Fewer contractors (2 vs 2024).',
    'SchE.21A':'HVAC replacement at Fremont Way.', 'SchE.3B':'Condo rented 9 months then sold.', 'SchE.21B':'Sold in October.', 'SchE.22A':'Prior suspended losses released.', 'SchE.22B':'Prior suspended losses released on sale.',
    'SchE.26':'All passive losses allowed (net passive income).', 'SchE.41':'Rental losses allowed vs suspended in 2024.', 'Sch1.5':'See Schedule E.',
    'SchD.16':'Gains vs prior-year loss.', 'SchD.15':'Condo 1231 gain.', 'SchD.7':'RSU noncovered lots (see finding) and direct-indexing sales.',
    'F8938':'SEK rate change.', 'SchB.1.1':'Higher sweep balances.', 'SchE.14A':'HVAC replacement.', 'SchE.14B':'Make-ready only (2024 had flooring work).',
    'SchE.12B':'Loan paid off at sale.', 'F8582.4':'Net passive income in 2025.', 'Sch1.15':'Higher SE income.', 'SchSE.12':'Higher SE income.',
    'F8606.1':'2025 contribution; 2024 basis converted.', 'F8606.3':'Two years of basis converted in 2025.', 'F8606.14':'All basis used by conversions.',
    'F2441.2':'Second provider in Austin.', 'CA540.64':'Part-year in 2025.', 'Sch1.17':'Engine deduction; see finding.', 'SchC.27a':'Software only; print production moved to supplies.',
    'SchC.29':'Equipment special depreciation 38,000.', 'SchC.31':'Equipment special depreciation 38,000.', 'Sch1.3':'See Schedule C.', 'SchC.28':'Equipment special depreciation.',
    'SchE.20A':'HVAC in repairs.', 'SchE.20B':'Partial year.', 'SchE.18B':'Partial year before sale.', 'SchC.13':'Equipment special depreciation.', 'SchC.24a':'Fewer trips.'
  };
  return k => t[k];
}

/* presence: who else has this workpaper open */
function heartbeat(){
  const p = {tab:Store.tab, actor:UI.actor, route:UI.route, t:Date.now()};
  try { Store.bc?.postMessage({type:'presence', p}); } catch(e){}
  try { Store.room?.presence?.({actor:UI.actor, route:UI.route}); } catch(e){}
}
Store.init(); Store.on(() => render());
setInterval(heartbeat, 4000); heartbeat();
render();
