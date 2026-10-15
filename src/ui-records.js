/*
 * Defines the workpaper's document, sales, depreciation, bookkeeping, and return-record views.
 * Each view reads derived state and links back to packet evidence through shared trace controls.
 * Loaded after ui-gate-views.js and before the filing application.
 */
// Lists packet documents with their landing, receipt, and disposition status.
V.documents = () => {
  const di = docIndex();
  const c = (s) => di.filter((x) => x.state === s).length;
  return `<h1>Document index</h1><p class="lede">Every document and where it landed, or why it did not. Completeness is proven when no document needs a disposition. ${c('landed')} landed, ${c('accounted')} accounted for, ${c('superseded')} superseded, ${c('not received')} not yet received, ${c('needs disposition')} need a disposition.</p>
   <div class="tbl-wrap panel"><table><tr><th>Doc</th><th>Title</th><th>Received</th><th>Values</th><th>Status</th><th>Landed in / reason</th><th></th></tr>
   ${di
     .map((x) => {
       const low = (IDX.evByDoc[x.d.id] || []).filter((e) => e.confidence < 0.9).length;
       return `<tr><td><span class="srcchip" data-ref="${x.d.id}">${x.d.id}</span></td><td>${esc(x.d.title)}${x.d.marked_corrected ? ' <span class="pill amb">corrected</span>' : ''}</td><td class="small">${dshort(x.d.received_at)}</td><td class="n small">${x.d.extraction.values}${low ? ` <span class="conf low">${low} low</span>` : ''}</td>
     <td><span class="pill ${x.state === 'landed' || x.state === 'accounted' ? 'grn' : x.state === 'needs disposition' ? 'red' : ''}">${x.state}</span></td>
     <td class="small">${
       x.lines.length
         ? x.lines
             .slice(0, 5)
             .map((k) => `<span class="srcchip" data-trace="${k}">${k}</span>`)
             .join('') + (x.lines.length > 5 ? ` +${x.lines.length - 5}` : '')
         : esc(x.disp ? x.disp.disp + ': ' + (x.disp.reason || '') : docReason(x.d.id))
     }</td>
     <td>${x.state === 'needs disposition' && can(UI.actor, 'prepare') ? `<button class="btn sm" data-disp="${x.d.id}">Account for</button>` : ''}</td></tr>`;
     })
     .join('')}</table></div>
   <p class="small muted">Expected but missing: none beyond what the timeline delivers. Related returns outside this packet: ${P.household.related_returns.map((r) => esc(r.who)).join('; ')}.</p>`;
};

// Reconciles broker summaries and lets reviewers inspect sales lots by exception.
V.sales = () => {
  const F = UI.salesFilter;
  const lots = Object.values(M.L)
    .filter((l) => l.form === 'F8949' && !l.line.endsWith('total'))
    .map((l) => {
      const m =
        l.label.match(
          /^(.*?) \((?:acquired )?(.*?), sold (.*?); proceeds ([\d,.]+), basis ([\d,.]+)(?:, adjustment ([A-Z]) (-?[\d,.]+))?\)/
        ) || [];
      const n = (s) => (s ? +s.replace(/,/g, '') : 0);
      return {
        k: l.key,
        box: l.line.split('.')[0],
        lot: l.line.split('.')[1],
        desc: m[1] || l.label,
        acq: m[2],
        sold: m[3],
        proceeds: n(m[4]),
        basis: n(m[5]),
        wash: m[6] === 'W' ? n(m[7]) : 0,
        adjCode: m[6],
        adjAmt: n(m[7]),
        gain: l.value
      };
    });
  const shown = lots.filter(
    (x) =>
      (F.box === 'all' || x.box === F.box) &&
      (!F.q || (x.desc + ' ' + x.lot).toLowerCase().includes(F.q.toLowerCase())) &&
      (F.flag === 'all' ||
        (F.flag === 'zero' && x.basis === 0) ||
        (F.flag === 'wash' && x.wash > 0) ||
        (F.flag === 'finding' &&
          M.checks.some((c) => c.status === 'open' && c.lines.includes(x.k))))
  );
  const boxes = [...new Set(lots.map((l) => l.box))].sort();
  const sum = (arr, f) => arr.reduce((s, x) => s + x[f], 0);
  const pg = F.page || 0,
    per = 60;
  const brokers = [
    {
      b: 'Northlake (D28)',
      doc: 'D28',
      summ: 6600 + 37720 + 8400 + 15300,
      lots: lots.filter((l) => /^N\d/.test(l.lot))
    },
    {
      b: 'Meridian (D31 corrected)',
      doc: 'D31',
      summ: 71965,
      lots: lots.filter((l) => /^M\d/.test(l.lot))
    },
    {
      b: 'Brightpath (D74)',
      doc: 'D74',
      summ: 139615.96 + 195112.56,
      lots: lots.filter((l) => /^X\d/.test(l.lot))
    },
    {
      b: 'Coinhaven 1099-DA (D34)',
      doc: 'D34',
      summ: 34833,
      lots: lots.filter((l) => /^C\d/.test(l.lot))
    }
  ];
  return `<h1>Sales detail</h1><p class="lede">${lots.length} dispositions. Review by exception: the totals tie to each broker, and only lots a check flagged need attention.</p>
   <h2>Broker reconciliation</h2><div class="tbl-wrap panel"><table><tr><th>Broker</th><th class="n">Summary proceeds</th><th class="n">Sum of lots</th><th class="n">Difference</th><th class="n">Lots</th></tr>
   ${brokers
     .map((b) => {
       const s = sum(b.lots, 'proceeds');
       const d = Math.round((b.summ - s) * 100) / 100;
       return `<tr><td><span class="srcchip" data-ref="${b.doc}">${b.b}</span></td><td class="n">${fmt(b.summ, 2)}</td><td class="n">${fmt(s, 2)}</td><td class="n ${d ? 'bad' : 'ok'}">${d ? fmt(d, 2) : 'ties'}</td><td class="n">${b.lots.length}</td></tr>`;
     })
     .join('')}</table>
   <p class="small muted">Meridian difference is page 32 (M18, 250.00) that extraction skipped. Coinhaven ties to the 1099-DA; basis comes from the exchange CSV (D35). S corporation excess distributions (box F) are not broker sales.</p></div>
   <h2>By box</h2><div class="tbl-wrap panel"><table><tr><th>Box</th><th class="n">Lots</th><th class="n">Proceeds</th><th class="n">Basis</th><th class="n">Wash</th><th class="n">Gain (engine)</th></tr>${boxes
     .map((b) => {
       const x = lots.filter((l) => l.box === b);
       return `<tr class="click" data-sbox="${b}"><td>${b}</td><td class="n">${x.length}</td><td class="n">${fmt(sum(x, 'proceeds'), 2)}</td><td class="n">${fmt(sum(x, 'basis'), 2)}</td><td class="n">${fmt(sum(x, 'wash'), 2)}</td><td class="n">${num('F8949.' + b + '.total')}</td></tr>`;
     })
     .join('')}</table></div>
   <h2>Lots</h2><div class="row"><div class="chipset">${['all', ...boxes].map((b) => `<button class="${F.box === b ? 'on' : ''}" data-sbox="${b}">${b === 'all' ? 'All boxes' : 'Box ' + b}</button>`).join('')}</div><div class="chipset">${[
     ['all', 'Any'],
     ['finding', 'Flagged by a check'],
     ['zero', 'Zero basis'],
     ['wash', 'Wash sale']
   ]
     .map(([k, l]) => `<button class="${F.flag === k ? 'on' : ''}" data-sflag="${k}">${l}</button>`)
     .join(
       ''
     )}</div><input type="text" id="salesq" placeholder="Security or lot" value="${esc(F.q)}" style="max-width:220px"></div>
   <div class="tbl-wrap panel"><table><tr><th>Lot</th><th>Box</th><th>Security</th><th>Acquired</th><th>Sold</th><th class="n">Proceeds</th><th class="n">Basis</th><th class="n">Adj. (code)</th><th class="n">Gain</th></tr>
   ${shown
     .slice(pg * per, (pg + 1) * per)
     .map(
       (x) =>
         `<tr><td class="small">${x.lot}</td><td>${x.box}</td><td>${esc(x.desc)}</td><td class="small">${esc(x.acq || '')}</td><td class="small">${esc(x.sold || '')}</td><td class="n">${fmt(x.proceeds, 2)}</td><td class="n ${x.basis === 0 ? 'bad' : ''}">${fmt(x.basis, 2)}</td><td class="n">${x.adjCode ? x.adjCode + ' ' + fmt(x.adjAmt, 2) : ''}</td><td class="n">${num(x.k)}</td></tr>`
     )
     .join('')}
   <tr class="tot"><td colspan="5">${shown.length} lots shown</td><td class="n">${fmt(sum(shown, 'proceeds'), 2)}</td><td class="n">${fmt(sum(shown, 'basis'), 2)}</td><td class="n">${fmt(sum(shown, 'wash'), 2)}</td><td class="n">${fmt(sum(shown, 'gain'), 2)}</td></tr></table></div>
   ${shown.length > per ? `<div class="row"><button class="btn sm" data-spage="${Math.max(0, pg - 1)}" ${pg ? '' : 'disabled'}>Previous</button><span class="small muted">Page ${pg + 1} of ${Math.ceil(shown.length / per)}</span><button class="btn sm" data-spage="${pg + 1}" ${(pg + 1) * per < shown.length ? '' : 'disabled'}>Next</button></div>` : ''}`;
};

V.depreciation = () => {
  const hv = M.adjs.find((a) => a.findingId === 'hvac' && a.status === 'active');
  const rows = M.V.assets
    .map(
      (a) =>
        `<tr><td><span class="srcchip" data-ref="asset:${a.asset_id}">${a.asset_id}</span></td><td>${esc(a.description)}<div class="small faint">${esc(a.activity)}</div></td><td class="small">${esc(a.method)}</td><td class="n">${a.life_years}</td><td class="small">${esc(a.placed_in_service)}</td><td class="n">${fmt(a.cost, 2)}</td><td class="n">${fmt(a.federal.depreciation_2025, 2)}</td><td class="n">${fmt(a.federal.accumulated_end, 2)}</td><td class="n">${fmt(a.california.depreciation_2025, 2)}</td><td class="n">${fmt(a.california.accumulated_end, 2)}</td><td class="n">${fmt(a.amt?.difference_from_regular, 2)}</td><td class="small">${a.disposed ? esc(typeof a.disposed === 'string' ? a.disposed : JSON.stringify(a.disposed)) : ''}</td></tr>`
    )
    .join('');
  return `<h1>Depreciation by asset</h1><p class="lede">Federal, California and AMT for every asset, with disposals. California does not allow federal special depreciation, so the studio equipment and 2021 appliances carry basis differences forward.</p>
   <div class="tbl-wrap panel"><table><tr><th>Asset</th><th>Description</th><th>Method</th><th class="n">Life</th><th>In service</th><th class="n">Cost</th><th class="n">Fed 2025</th><th class="n">Fed accum.</th><th class="n">CA 2025</th><th class="n">CA accum.</th><th class="n">AMT diff</th><th>Disposed</th></tr>${rows}
   ${hv ? `<tr style="background:var(--flag-bg)"><td>SAC-HVAC</td><td>Heat pump system, 1450 Fremont Way <div class="small">added by adjustment</div></td><td class="small">SL / mid-month</td><td class="n">27.5</td><td class="small">2025-08-12</td><td class="n">11,000.00</td><td class="n">150.00</td><td class="n">150.00</td><td class="n">150.00</td><td class="n">150.00</td><td class="n">0.00</td><td></td></tr>` : ''}</table></div>
   <h2>Disposal: 1200 Barton Hills Dr Unit 4C (sold 2025-10-15)</h2><div class="panel kv"><b>Sale price</b><div>${num('F4797.21')}</div><b>Cost plus selling expenses</b><div>${num('F4797.22')}</div><b>Depreciation allowed</b><div>${num('F4797.23')} (2020-2024 per prior preparer, 2025 through October)</div><b>Gain</b><div>${num('F4797.25')}</div><b>Section 1250 recapture</b><div>${num('F4797.26g')} (straight line)</div><b>Unrecaptured 1250 gain (25% max)</b><div>${num('SchD.19')}</div></div>
   <h2>California differences carried forward</h2><div class="panel">${Object.entries(
     M.V.carryovers_out.california.depreciation_basis_differences
   )
     .map(([k, v]) => `<span class="srcchip" data-ref="asset:${k}">${k} ${fmt(v, 2)}</span>`)
     .join('')}</div>`;
};

V.books = () => {
  const adj = (id) => M.adjs.find((a) => a.findingId === id && a.status === 'active');
  const r = [
    ['Net income per books (QuickBooks, cash)', 89834, 'doc:D14#page1'],
    ['Add back book depreciation', 7600, 'doc:D14#page2'],
    ['Tax depreciation: 100% special allowance on 38,000 of equipment', -38000, 'F4562-C.14'],
    ['Health insurance (Erik): moved out of Schedule C', 14400, 'doc:D14#page1'],
    ['Fuel replaced by standard mileage (8,260)', 3100 - 8260, 'SchC.9'],
    ['Meals at 50%', 1980, 'SchC.24b'],
    ['Form 1099-K added by engine as unmatched receipts', 12400, 'SchC.1'],
    ['Home office, simplified method', -1200, 'SchC.30']
  ];
  const eng = r.reduce((s, x) => s + x[1], 0);
  const ours = [
    ['1099-K already in books revenue', '1099k-dup', -12400],
    ['Mileage: duplicate log page', 'mileage-dup', 2590],
    ['Phone and internet at business share', 'phone-net', 1308],
    ['Personal Spotify subscription', 'spotify', 216]
  ];
  const ourTot = ours.reduce((s, x) => s + (adj(x[1]) ? x[2] : 0), 0);
  return `<h1>Books to tax: Lindqvist Studio</h1><p class="lede">From the client's QuickBooks profit to Schedule C, every reconciling item with its source. Engine items first, then the firm's corrections.</p>
   <div class="tbl-wrap panel"><table><tr><th>Item</th><th class="n">Amount</th><th>Source</th></tr>${r.map((x) => `<tr><td>${esc(x[0])}</td><td class="n">${fmt(x[1])}</td><td>${M.L[x[2]] ? `<span class="srcchip" data-trace="${x[2]}">${x[2]}</span>` : chip(x[2])}</td></tr>`).join('')}
   <tr class="tot"><td>Schedule C net profit (engine)</td><td class="n">${fmt(eng)}</td><td>${eng === M.L['SchC.31'].value ? '<span class="ok">ties to SchC.31</span>' : '<span class="bad">does not tie</span>'}</td></tr>
   ${ours.map((x) => `<tr class="${adj(x[1]) ? '' : 'sub'}"><td>${esc(x[0])} ${adj(x[1]) ? '' : '<span class="pill">not accepted</span>'}</td><td class="n">${fmt(x[2])}</td><td><span class="srcchip" data-go="findings">${x[1]}</span></td></tr>`).join('')}
   <tr class="tot"><td>Schedule C net profit (workpaper)</td><td class="n">${fmt(eng + ourTot)}</td><td></td></tr></table></div>
   <h2>Gross receipts to information returns</h2><div class="panel tbl-wrap"><table><tr><th>Payer</th><th class="n">1099-NEC</th><th class="n">1099-K</th><th class="n">Books deposits</th></tr>
   ${[
     ['Fennimore Brewing', 'D16', 38500, 0],
     ['Atlas Outdoor Gear', 'D17', 41200, 12400],
     ['Sable & Finch', 'D18', 27900, 0],
     ['Riverbend CU', 'D19', 19800, 0],
     ['Quill Media', 'D20', 14600, 0]
   ]
     .map(
       (x) =>
         `<tr><td><span class="srcchip" data-ref="${x[1]}">${x[0]}</span></td><td class="n">${fmt(x[2])}</td><td class="n">${x[3] ? fmt(x[3]) + ' (inside the 41,200)' : ''}</td><td class="n">${fmt(x[2])}</td></tr>`
     )
     .join('')}
   <tr><td>11 small clients, no 1099</td><td></td><td></td><td class="n">9,300</td></tr><tr class="tot"><td>Total</td><td class="n">142,000</td><td class="n">12,400</td><td class="n">151,300</td></tr></table>
   <p class="small muted">The examiner's question in 2028 (1099-NEC 142,000 + 1099-K 12,400 = 154,400 vs receipts) is answered here: the 12,400 card payments are part of Atlas's 41,200.</p></div>`;
};

V.rentals = () => `<h1>Rentals & passive losses</h1><div class="grid2">${['A', 'B']
  .map(
    (p) =>
      `<div class="panel"><h3 style="margin-top:0">${esc(M.L['SchE.1' + p].value)}</h3><div class="kv"><b>Days rented / personal</b><div>${num('SchE.2' + p, { noTick: 1 })}</div><b>Rents</b><div>${num('SchE.3' + p)}</div>${[
        '9',
        '11',
        '12',
        '14',
        '16',
        '18',
        '19'
      ]
        .filter((x) => M.L['SchE.' + x + p])
        .map(
          (x) =>
            `<b>${esc(M.L['SchE.' + x + p].label.replace(/ - property [AB]/, ''))}</b><div>${num('SchE.' + x + p)}</div>`
        )
        .join(
          ''
        )}<b>Income (loss)</b><div>${num('SchE.21' + p)}</div><b>Allowed after Form 8582</b><div>${num('SchE.22' + p)}</div></div></div>`
  )
  .join('')}</div>
  <h2>Passive activity loss (Form 8582)</h2><div class="panel kv"><b>Rental income incl. 4797 gain on the sold condo</b><div>${num('F8582.1a')}</div><b>Rental losses</b><div>${num('F8582.1b')}</div><b>Prior-year unallowed (6,300 + 9,850)</b><div>${num('F8582.1c')}</div><b>Other passive income (K-1s)</b><div>${num('F8582.3a')}</div><b>Net</b><div>${num('F8582.4')}</div></div><p class="small muted">${esc(M.L['F8582.4'].note)}</p>`;

V.state = () => {
  const cols = ['A', 'B', 'C', 'D', 'E'];
  const rowsK = [
    ...new Set(
      Object.keys(M.L)
        .filter((k) => k.startsWith('SchCA540NR.'))
        .map((k) => k.split('.')[1])
    )
  ];
  return `<h1>State split: California part-year</h1><p class="lede">Resident of California 01/01 to 07/14/2025 (195 of 365 days); Texas from 07/15. California taxes all income of the resident period and only California-source income after.</p>
   <div class="panel"><div class="bar" style="height:22px"><i style="width:${(195 / 365) * 100}%;background:var(--review)"></i></div><div class="row small" style="justify-content:space-between"><span>California resident 195 days</span><span>Texas resident 170 days (no income tax)</span></div></div>
   <div class="tbl-wrap panel"><table><tr><th>Schedule CA line</th>${cols.map((c) => `<th class="n">${c === 'A' ? 'Federal' : c === 'B' ? 'Subtractions' : c === 'C' ? 'Additions' : c === 'D' ? 'CA law total' : 'California amount'}</th>`).join('')}<th>Sourcing</th></tr>
   ${rowsK
     .map((r) => {
       const any = cols.map((c) => M.L[`SchCA540NR.${r}.${c}`]).find(Boolean);
       return `<tr><td class="small">${r} ${esc(any?.label.split(' - ')[0] || '')}</td>${cols.map((c) => `<td class="n">${M.L[`SchCA540NR.${r}.${c}`] ? num(`SchCA540NR.${r}.${c}`) : ''}</td>`).join('')}<td class="small faint">${esc(P.engine_reference.rules[M.L[`SchCA540NR.${r}.E`]?.rule] || '')}</td></tr>`;
     })
     .join('')}</table></div>
   <h2>Form 540NR</h2><div class="panel kv">${['F540NR.17', 'F540NR.18', 'F540NR.19', 'F540NR.31', 'F540NR.32', 'F540NR.34', 'F540NR.35', 'F540NR.37', 'F540NR.39', 'ScheduleS.credit', 'F540NR.61', 'F540NR.64', 'F540NR.71', 'F540NR.72', 'F540NR.78', 'F540NR.97'].map((k) => `<b>${esc(M.L[k].label)}</b><div>${num(k)}</div>`).join('')}</div>
   <h2>Pass-through state supplements</h2><div class="panel small">Ridgeline box 2 apportionment (D38): California 22%, Texas 31%, Arizona 27% (composite filed), Nevada 20%. Woodworks: Oregon composite tax 1,580 paid for Erik (D39 p2); Schedule S credit ${num('ScheduleS.credit')}.</div>`;
};

V.k1 = () => `<h1>K-1 lines & basis</h1><div class="grid2">
  <div class="panel"><h3 style="margin-top:0">Lindqvist Family Woodworks, Inc. (1120-S, 20%)</h3><div class="kv"><b>Box 1 ordinary income</b><div>${chip('ev-0975')}</div><b>Box 4 interest</b><div>${chip('ev-0976')}</div><b>Box 16D distributions</b><div>${chip('ev-0977')}</div><b>Box 17V QBI / W-2 / UBIA</b><div>${chip('ev-0979')} ${chip('ev-0980')} ${chip('ev-0981')}</div><b>Oregon composite tax</b><div>${chip('ev-0982')}</div><b>Schedule E</b><div>${num('SchE.28A')}</div></div>
   <h3>Stock basis (Form 7203)</h3><table><tr><th>Year</th><th class="n">Begin</th><th class="n">Income</th><th class="n">Distributions</th><th class="n">End</th><th>Source</th></tr><tr><td>2022</td><td></td><td></td><td></td><td class="n">21,300</td><td class="small">client worksheet (prior file)</td></tr><tr><td>2023</td><td class="n">21,300</td><td class="n">14,100</td><td class="n">(20,000)</td><td class="n">15,400</td><td>${chip('D40')} found 06/05/2026</td></tr><tr><td>2024</td><td class="n">15,400</td><td class="n">16,900</td><td class="n">(30,000)</td><td class="n">2,300</td><td>${chip('py:/return_2024/K1_1120S')}</td></tr><tr><td>2025</td><td class="n">${num('F7203.1')}</td><td class="n">${num('F7203.4')}</td><td class="n">(42,000)</td><td class="n">${num('F7203.15')}</td><td class="small">excess distribution ${num('F7203.excess')} taxed as capital gain</td></tr></table>
   <p class="small muted">Before the 2023 K-1 arrived, v1/v2 assumed no change in 2023 (basis 8,200). The gap closed in v3. 2024 had enough basis (32,300 available vs 30,000 distributed), so no prior-year exposure.</p></div>
  <div class="panel"><h3 style="margin-top:0">Ridgeline Real Estate Fund III LP (1065, limited partner, arrived 06/22)</h3><div class="kv"><b>Box 2 rental income</b><div>${chip('ev-0964')}</div><b>Box 5 interest</b><div>${chip('ev-0965')}</div><b>Box 9a LTCG</b><div>${chip('ev-0966')}</div><b>Box 19A distributions</b><div>${chip('ev-0967')}</div><b>Box 21 foreign tax</b><div>${chip('ev-0968')}</div><b>Capital account</b><div>60,000 to 63,660 ${chip('ev-0970')}</div><b>Outside basis</b><div class="amb">never computed by prior preparer: start a basis schedule now (capital account is not basis)</div></div></div></div>`;

V.carry = () => {
  const co = M.V.carryovers_out,
    ci = P.prior_years.carryovers_into_2025;
  return `<h1>Carryovers & basis by year</h1><div class="grid2"><div class="panel"><h3 style="margin-top:0">Into 2025 (agreed to 2024 return)</h3><table>${Object.entries(
    ci
  )
    .filter(([k, v]) => typeof v === 'number')
    .map(
      ([k, v]) =>
        `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td class="n">${fmt(v)}</td><td>${chip('py:/carryovers_into_2025/' + k)}</td></tr>`
    )
    .join(
      ''
    )}</table>${can(UI.actor, 'prepare') ? `<button class="btn sm" data-step="Carryovers agreed to prior year" data-done="1">Mark carryovers agreed</button>` : ''}</div>
   <div class="panel"><h3 style="margin-top:0">Out of 2025 (engine ${M.vk})</h3><table>${Object.entries(
     co.federal
   )
     .map(([k, v]) => `<tr><td>${esc(k.replace(/_/g, ' '))}</td><td class="n">${fmt(v)}</td></tr>`)
     .join(
       ''
     )}<tr><td>ISO shares held: AMT basis 52,000 vs regular 12,000 (1,000 sh)</td><td class="n">40,000</td></tr></table><p class="small amb">SEP excess and California depreciation differences change once findings are accepted.</p></div></div>
   <h2>Basis by year</h2><div class="panel"><pre style="white-space:pre-wrap;font-size:12.5px">${esc(JSON.stringify(P.prior_years.basis_records, null, 2))}</pre></div>`;
};

V.variance = () => {
  const vs = variances().filter((v) => v.flag);
  return `<h1>Variance vs 2024</h1><p class="lede">Flagged when a line changes more than ${M.std.variance_review.flag_if_change_over_percent}% and more than ${fmt(M.std.variance_review.and_over_amount)} (firm standard). Each needs an explanation before filing.</p>
  <div class="tbl-wrap panel"><table><tr><th>Line</th><th class="n">2024</th><th class="n">2025</th><th class="n">Change</th><th>Explanation</th></tr>${vs.map((v) => `<tr><td><span class="srcchip" data-trace="${v.k}">${v.k}</span> ${esc(v.label)}</td><td class="n">${fmt(v.py)}</td><td class="n">${fmt(v.cy)}</td><td class="n">${sgn(v.diff)} (${v.pct}%)</td><td>${M.S.variance[v.k] ? `${esc(M.S.variance[v.k].text)} <span class="small faint">${who(M.S.variance[v.k].by)}</span>` : can(UI.actor, 'prepare') ? `<div class="form-row"><input type="text" data-varfor="${v.k}" placeholder="Why it changed"><button class="btn sm" data-varsave="${v.k}">Save</button></div>` : '<span class="amb">unexplained</span>'}</td></tr>`).join('')}</table></div>
  ${can(UI.actor, 'prepare') ? `<button class="btn" data-varauto>Draft explanations from the evidence</button> <span class="small muted">Fills each blank with a sourced explanation you can edit; saved as your entries in one undoable batch.</span>` : ''}`;
};

V.prior = () => {
  const pw = P.prior_years.prior_preparer_workpaper;
  const map = {
    'Obtain 2023 Woodworks K-1 to roll basis forward.': [
      'Closed: D40 received 06/05/2026; basis rolled (2,300 at 1/1/2025).',
      'scorp-basis'
    ],
    'Confirm 2024 Form 5498 for IRA basis.': [
      'Closed: D42 confirms 7,000 contributed 02/12/2025 for 2024.',
      'ira-basis'
    ],
    'Client to confirm home office square footage.': [
      'Closed: D24 measures 220 sq ft; 2024 used 300.',
      'homeoffice-py'
    ],
    '2023 Form 3520 (foreign inheritance over 100,000) - discussed? (no note of resolution)': [
      'Open: raised as an outside filing for partner discussion.',
      'outside'
    ]
  };
  const diffs = [
    [
      'Self-employed health insurance',
      '0 (Erik on Ngozi\u2019s plan)',
      'Engine took 14,400; we disallow (eligible for spouse plan)'
    ],
    ['Home office', '300 sq ft simplified', '240 average (220 Sacramento, 260 Austin)'],
    [
      'Vehicle',
      'Standard mileage 7,400 miles',
      'Standard mileage; duplicate log page removed (8,100)'
    ],
    [
      'Depreciation',
      'Laptop 179 (2022)',
      '100% special allowance on 38,000 equipment; HVAC capitalized'
    ],
    [
      'S corp basis',
      'Assumed sufficient, 2023 missing',
      'Rolled with 2023 K-1; 2025 distributions exceed basis by 21,215'
    ],
    ['IRA basis', '7,000 per client, 5498 not obtained', 'Agreed to D42 and 2024 8606'],
    ['Residency', 'California full year', 'Part-year (540NR); wages sourced by work location'],
    [
      'FBAR / 8938',
      'FBAR filed by client; 8938 filed',
      '8938 required again; FBAR outside scope but flagged'
    ]
  ];
  return `<h1>Prior preparer vs us</h1><div class="panel"><div class="small muted">${esc(P.prior_years.return_2024.prepared_by)}, filed ${P.prior_years.return_2024.filed} (${chip('D07')} ${chip('D06')})</div><p>${esc(pw.summary_memo)}</p><ul>${pw.notes.map((n) => `<li class="small">${esc(n)}</li>`).join('')}</ul></div>
  <h2>Open items they left</h2><div class="panel"><table>${pw.open_items_left_by_prior_preparer.map((o) => `<tr><td>${esc(o)}</td><td class="small">${esc(map[o]?.[0] || '')}</td><td><span class="srcchip" data-go="findings">${map[o]?.[1] || ''}</span></td></tr>`).join('')}</table></div>
  <h2>What they did vs what we changed</h2><div class="panel tbl-wrap"><table><tr><th>Topic</th><th>2024 (Delta River)</th><th>2025 (Miraflores)</th></tr>${diffs.map((d) => `<tr><td>${esc(d[0])}</td><td>${esc(d[1])}</td><td>${esc(d[2])}</td></tr>`).join('')}</table></div>
  ${can(UI.actor, 'prepare') ? `<button class="btn" data-step="Prior-year return reviewed" data-done="1">Mark prior-year return reviewed</button>` : ''}`;
};

V.comms = () => {
  const qs = Object.values(M.S.questions);
  return `<h1>Questions & messages</h1><p class="lede">Questions to the client or colleagues. An answer is evidence: it can be cited on any line or finding.</p>
   ${
     can(UI.actor, 'ask')
       ? `<div class="panel"><div class="form-row"><select id="q-to"><option value="cu-01">Ngozi Okafor (client)</option><option value="cu-02">Erik Lindqvist (client)</option>${PEOPLE.filter(
           (p) => p.role !== 'client' && p.id !== UI.actor
         )
           .map((p) => `<option value="${p.id}">${esc(p.name)} (${esc(p.role)})</option>`)
           .join(
             ''
           )}</select><input type="text" id="q-target" placeholder="About (line, doc or finding id), optional"></div><div class="form-row"><input type="text" id="q-text" placeholder="Question"><button class="btn pri" data-ask>Send question</button></div></div>`
       : ''
   }
   <h2>Open and answered</h2>${qs.length ? qs.map((q) => `<div class="panel tight"><div class="row" style="justify-content:space-between"><div>${who(q.by)} to ${who(q.to)} ${q.target ? 'about ' + chip(q.target) : ''}</div><span class="pill ${q.status === 'open' ? 'amb' : 'grn'}">${q.status}</span></div><p style="margin:6px 0"><b>${esc(q.text)}</b></p>${q.answers.map((a) => `<div style="border-left:2px solid var(--verify);padding-left:8px">${who(a.by)}: ${esc(a.text)} <span class="faint small">${dshort(a.ts)}</span></div>`).join('')}${q.to === UI.actor || (['cu-01', 'cu-02'].includes(q.to) && PERSON[UI.actor].role === 'client') ? `<div class="form-row"><input type="text" data-ansfor="${q.id}" placeholder="Your answer"><button class="btn sm ok" data-answer="${q.id}">Answer</button></div>` : ''}</div>`).join('') : '<p class="small muted">No questions yet.</p>'}
   <h2>Client messages and call notes</h2><div class="panel"><table>${P.client.messages.map((m) => `<tr><td class="small">${dshort(m.sent_at)}</td><td>${esc(m.from)}</td><td>${esc(m.text)}</td><td>${chip(m.id)}</td></tr>`).join('')}</table></div>
   <div class="panel"><b>Call 2026-03-26</b> ${chip('call-01')}<ul>${P.client.call_notes[0].notes.map((n) => `<li class="small">${esc(n)}</li>`).join('')}</ul></div>
   <h2>Questionnaire</h2><div class="panel tbl-wrap"><table>${P.client.questionnaire.map((q) => `<tr><td class="small">${q.id}</td><td>${esc(q.question)}</td><td>${esc(q.answer)}</td>${M.checks.some((f) => f.refs.includes(q.id) && f.kind !== 'pass') ? '<td><span class="pill amb">contradicted by documents</span></td>' : '<td></td>'}</tr>`).join('')}</table></div>`;
};

V.judgments = () => {
  const js = Object.values(M.S.judgments);
  const templates = [
    [
      'j-8867',
      'Paid preparer due diligence (Form 8867): CTC and credit for other dependents',
      'Interviewed client; Theo (8) and Ada (19, full-time student, lived at home 12 months per organizer, at UC Davis) qualify; SSNs verified to card and prior return; documents retained.',
      'IRC 6695(g); Treas. Reg. 1.6695-2'
    ],
    [
      'j-bonus',
      'Election: 100% special depreciation on studio equipment (no 179)',
      'Default special allowance; 179 alternative saves 1,050 California only (what-if).',
      'IRC 168(k); what_if equipment_section179'
    ],
    [
      'j-itemize',
      'Itemize rather than take the standard deduction',
      'Itemized exceeds standard by a wide margin (what-if: +12,306 tax if standard).',
      'IRC 63'
    ],
    [
      'j-penalty',
      'Estimated tax penalty: regular method',
      'Annualized method gives the same 164 (what-if penalty_annualized).',
      'IRC 6654; Form 2210'
    ]
  ];
  return `<h1>Judgments & elections</h1><p class="lede">Every judgment records the decision, the authority relied on and any penalty consideration (firm rule).</p>
  ${js.length ? `<div class="panel tbl-wrap"><table><tr><th>Topic</th><th>Decision</th><th>Authority</th><th>Penalty consideration</th><th>By</th></tr>${js.map((j) => `<tr><td>${esc(j.topic)}</td><td>${esc(j.decision)}</td><td class="small">${esc(j.authority)}</td><td class="small">${esc(j.penalty || '')}</td><td>${who(j.by)}</td></tr>`).join('')}</table></div>` : '<p class="muted">None recorded yet.</p>'}
  ${
    can(UI.actor, 'prepare')
      ? `<h2>Record one</h2>${templates
          .filter((t) => !M.S.judgments[t[0]])
          .map(
            (t) =>
              `<div class="panel tight"><b>${esc(t[1])}</b><div class="small muted">${esc(t[2])} . ${esc(t[3])}</div><button class="btn sm" data-jtemplate="${t[0]}">Record as written</button></div>`
          )
          .join('')}`
      : ''
  }`;
};

V.review = () => {
  const notes = Object.values(M.S.notes);
  const pend = M.adjs.filter((a) => a.status === 'pending_partner');
  return `<h1>Review & sign-off</h1><p class="lede">Open review notes block filing. Sign-offs store a fingerprint of what was signed; when any line, adjustment or engine version under them changes, they reopen by themselves.</p>
  <h2>Sign-off matrix</h2><div class="panel tbl-wrap"><table><tr><th>Area</th><th>Preparer</th><th>Reviewer</th></tr>${AREAS.map(
    (a) =>
      `<tr class="click" data-go="area/${a.id}"><td>${esc(a.name)}</td>${['preparer', 'reviewer']
        .map((l) => {
          const s = signState(a.id, l);
          return `<td>${s.state === 'signed' ? `<span class="ok">✓ ${esc(PERSON[s.s.by]?.name)}</span>` : s.state === 'reopened' ? '<span class="amb">reopened</span>' : '<span class="faint">not signed</span>'}</td>`;
        })
        .join('')}</tr>`
  ).join('')}
  <tr class="tot"><td>Whole return: partner</td><td colspan="2">${(() => {
    const s = signState('return', 'partner');
    return s.state === 'signed'
      ? `<span class="ok">✓ ${esc(PERSON[s.s.by].name)} ${dshort(s.s.ts)}</span>`
      : s.state === 'reopened'
        ? '<span class="amb">reopened (return changed after signing)</span>'
        : can(UI.actor, 'partner')
          ? `<button class="btn sm ok" data-sign="return|partner">Partner sign-off on the return</button>`
          : '<span class="faint">not signed</span>';
  })()}</td></tr></table></div>
  <h2>Awaiting partner approval (tax effect over 1,000)</h2>${pend.length ? pend.map(adjRow).join('') : '<p class="small muted">None.</p>'}
  ${pend.length && can(UI.actor, 'partner') ? `<button class="btn ok" data-approveall>Approve all ${pend.length} shown</button>` : ''}
  <h2>Review notes</h2>${
    notes.length
      ? notes
          .sort((a, b) => (a.status === 'open' ? -1 : 1))
          .map(noteCard)
          .join('')
      : '<p class="small muted">No notes. Reviewers can add a note from any line (click a number) or area.</p>'
  }`;
};

V.changes = () => {
  const vs = ['v1', 'v2', 'v3'].map((v) => IDX.versions[v]);
  const since = M.S.seen[UI.actor];
  return `<h1>Changes & versions</h1>
   <h2>Compare versions</h2><div class="panel tbl-wrap"><table><tr><th></th>${vs.map((v) => `<th class="n">${v.version} ${dshort(v.computed_at)}</th>`).join('')}<th class="n">Workpaper</th></tr>
   ${[
     ['Federal total tax', 'federal', 'total_tax', M.wp.fed.total_tax],
     ['Federal payments', 'federal', 'payments', M.wp.fed.payments],
     ['Federal balance due', 'federal', 'balance_due', M.wp.fed.balance_due],
     ['California total tax', 'california', 'total_tax', M.wp.ca.total_tax],
     ['California balance due', 'california', 'balance_due', M.wp.ca.balance_due]
   ]
     .map(
       (r) =>
         `<tr><td>${r[0]}</td>${vs.map((v) => `<td class="n">${fmt(v.summary[r[1]][r[2]])}</td>`).join('')}<td class="n"><b>${fmt(r[3])}</b></td></tr>`
     )
     .join('')}
   <tr class="sub"><td>Trigger</td>${vs.map((v) => `<td class="small">${esc(v.trigger)}</td>`).join('')}<td class="small">${M.live.length} adjustments</td></tr></table></div>
   ${vs
     .slice(1)
     .map(
       (v) =>
         `<details class="panel"><summary><b>${v.version}</b>: ${v.changes_from_previous.length} lines changed from the previous run</summary><div class="tbl-wrap"><table>${v.changes_from_previous.map((c) => `<tr><td><span class="srcchip" data-trace="${c.key}">${c.key}</span></td><td>${c.change}</td><td class="n">${c.old !== undefined ? fmt(c.old) : ''}</td><td class="n">${c.new !== undefined ? fmt(c.new) : ''}</td></tr>`).join('')}</table></div></details>`
     )
     .join('')}
   <h2>Workpaper activity ${since ? '(new since ' + dshort(since) + ' highlighted)' : ''}</h2><button class="btn sm" data-seen>Mark all as seen</button>
   <div class="panel"><ul class="tl">${
     M.S.log
       .slice()
       .reverse()
       .slice(0, 200)
       .map(
         (e) =>
           `<li class="${since && e.ts > since && e.actor !== UI.actor ? 'now' : ''}">${who(e.actor)} <span class="small">${esc(describe(e))}</span> <span class="faint small">${ago(e.ts)} (season ${dshort(e.at)})</span>${
             can(UI.actor, 'prepare') && e.type !== 'undo' && !M.S.filing.frozen
               ? ` <button class="btn sm" data-undo="${
                   e.batch
                     ? Store.events
                         .filter((x) => x.batch === e.batch)
                         .map((x) => x.id)
                         .join(',')
                     : e.id
                 }">Undo${e.batch ? ' batch' : ''}</button>`
               : ''
           }</li>`
       )
       .join('') || '<li class="faint">Nothing yet.</li>'
   }</ul></div>`;
};

V.whatif = () => {
  const A = P.what_if.alternatives;
  const sb = M.checks
    .filter((f) => UI.sandbox.has(f.id))
    .reduce(
      (t, f) => ({ fed: t.fed + f.eff.fed - f.eff.fedPay, ca: t.ca + f.eff.ca - f.eff.caPay }),
      { fed: 0, ca: 0 }
    );
  return `<h1>What-ifs</h1><p class="lede">Engine-computed alternatives (exact), and a sandbox that previews findings without committing them.</p>
   <div class="tbl-wrap panel"><table><tr><th>Alternative</th><th class="n">Federal tax</th><th class="n">California tax</th><th class="n">Lines changed</th></tr>${A.map(
     (a) =>
       `<tr><td>${esc(a.description)}</td><td class="n">${sgn(a.federal.total_tax_change)}</td><td class="n">${sgn(a.california.total_tax_change)}</td><td class="n"><details><summary>${a.changed_lines.length}</summary>${a.changed_lines
         .slice(0, 30)
         .map((c) => `<div class="small">${c.key}: ${fmt(c.old)} to ${fmt(c.new)}</div>`)
         .join('')}</details></td></tr>`
   ).join('')}</table></div>
   <h2>Sandbox</h2><div class="panel">${
     M.checks
       .filter((f) => f.adj.length && f.status === 'open')
       .map(
         (f) =>
           `<label class="form-row" style="flex:none;display:flex"><input type="checkbox" style="flex:none;width:auto" data-sandbox="${f.id}" ${UI.sandbox.has(f.id) ? 'checked' : ''}> <span style="flex:1">${esc(f.title)}</span><span class="small" style="flex:none">fed ${sgn(f.eff.fed - f.eff.fedPay)} CA ${sgn(f.eff.ca - f.eff.caPay)}</span></label>`
       )
       .join('') || '<p class="small muted">No open findings with adjustments.</p>'
   }
   <div class="sumgrid" style="margin-top:10px"><div><div class="l">Federal balance if applied</div><div class="v">${fmt(M.wp.fed.balance_due + sb.fed)}</div></div><div><div class="l">California balance if applied</div><div class="v">${fmt(M.wp.ca.balance_due + sb.ca)}</div></div></div></div>
   <h2>Extension (April 14, from v2)</h2><div class="panel kv"><b>Federal estimate</b><div>${fmt(P.what_if.extension.federal.estimated_balance)}; paid ${fmt(P.what_if.extension.federal.paid_with_form_4868)} with Form 4868</div><b>California estimate</b><div>${fmt(P.what_if.extension.california.estimated_balance)}; paid ${fmt(P.what_if.extension.california.paid_with_ftb_3519)}</div><b>Rule</b><div>${esc(P.what_if.extension.federal.rule)}</div></div>`;
};
