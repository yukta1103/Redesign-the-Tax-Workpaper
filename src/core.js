/*
 * Indexes immutable packet evidence, stores append-only events, and derives workpaper state.
 * Independent checks and tax-effect calculations live here alongside the event ledger.
 * The view modules consume this core without changing the packet.
 */
'use strict';
const P = window.PACKET; // loaded from data/packet.json by index.html, unmodified
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const fmt = (n, d = 0) =>
  n === null || n === undefined || n === ''
    ? ''
    : typeof n === 'number'
      ? (n < 0 ? '(' : '') +
        Math.abs(n).toLocaleString('en-US', {
          minimumFractionDigits: d,
          maximumFractionDigits: d
        }) +
        (n < 0 ? ')' : '')
      : String(n);
const money = (n) =>
  typeof n === 'number' ? fmt(n, Math.abs(n % 1) > 0.0001 && Math.abs(n) < 1e7 ? 2 : 0) : esc(n);
const sgn = (n) => (n > 0 ? '+' : '') + fmt(n);
const uid = (p = 'e') => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}
const dshort = (s) => (s ? String(s).slice(0, 10) : '');

/* ---------- indices ---------- */
const IDX = {
  ev: {},
  doc: {},
  evByDoc: {},
  qa: {},
  msg: {},
  call: {},
  staff: {},
  versions: {},
  lines: {},
  citedBy: {},
  docLines: {}
};
P.documents.forEach((d) => (IDX.doc[d.id] = d));
P.extracted_values.forEach((e) => {
  IDX.ev[e.id] = e;
  (IDX.evByDoc[e.document_id] ||= []).push(e);
});
P.client.questionnaire.forEach((q) => (IDX.qa[q.id] = q));
P.client.messages.forEach((m) => (IDX.msg[m.id] = m));
P.client.call_notes.forEach((c) => (IDX.call[c.id] = c));
P.firm.staff.forEach((s) => (IDX.staff[s.id] = s));
P.return_versions.forEach((v) => {
  IDX.versions[v.version] = v;
  const m = {};
  v.lines.forEach((l) => (m[l.key] = l));
  IDX.lines[v.version] = m;
  const cb = {},
    dl = {};
  v.lines.forEach((l) =>
    (l.sources || []).forEach((s) => {
      (cb[s] ||= []).push(l.key);
      const e = IDX.ev[s];
      if (e) (dl[e.document_id] ||= new Set()).add(l.key);
    })
  );
  IDX.citedBy[v.version] = cb;
  IDX.docLines[v.version] = dl;
});
const evf = (doc, field) => (IDX.evByDoc[doc] || []).find((e) => e.field === field);
const pageText = (doc, pg) =>
  (IDX.doc[doc]?.pages.find((p) => p.page === pg) || {}).printed_content || '';

/* ---------- people & roles ---------- */
const PEOPLE = [
  ...P.firm.staff.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    cred: s.credential,
    clear: s.sensitive_data_clearance,
    from: s.active_from,
    note: s.note
  })),
  ...P.firm.client_users.map((c) => ({ id: c.id, name: c.name, role: 'client', clear: true }))
];
const PERSON = Object.fromEntries(PEOPLE.map((p) => [p.id, p]));
const ROLE_CAN = {
  preparer: ['prepare', 'note', 'ask', 'time'],
  reviewer: ['prepare', 'note', 'ask', 'review', 'time'],
  partner: ['prepare', 'note', 'ask', 'review', 'partner', 'file', 'time'],
  quality_reviewer: ['note', 'review', 'ask'],
  firm_administrator: ['admin', 'time'],
  client: ['client']
};
const COLORS = {
  'st-01': '#2E7D5B',
  'st-02': '#3A47B0',
  'st-03': '#7A3E9D',
  'st-04': '#A5640B',
  'st-05': '#4B5563',
  'st-06': '#0E7490',
  'cu-01': '#B0281E',
  'cu-02': '#9D174D'
};
const can = (who, what) => (ROLE_CAN[PERSON[who]?.role] || []).includes(what);

/* ---------- verification methods (the tick-mark language) ---------- */
const METHODS = {
  agreed_to_source_document: { g: '✓', c: 'src', label: 'Agreed to source document' },
  recalculated: { g: 'Σ', c: 'calc', label: 'Recalculated independently' },
  confirmed_with_client: { g: 'C', c: 'cli', label: 'Confirmed with client' },
  agreed_to_prior_year: { g: 'PY', c: 'py', label: 'Agreed to prior year' },
  agreed_to_third_party_record: {
    g: '3P',
    c: 'tp',
    label: 'Agreed to third-party record (IRS/FTB)'
  }
};

/* ---------- areas of the return ---------- */
const AREAS = [
  {
    id: 'identity',
    name: 'Household, identity & dependents',
    budget: 'intake_and_engagement',
    pre: ['F8812', 'F8867', 'F8863'],
    docs: ['D01', 'D02', 'D03', 'D04', 'D05', 'D71', 'D06', 'D07']
  },
  {
    id: 'wages',
    name: 'Wages & stock compensation',
    budget: 'wages_and_stock_compensation',
    pre: ['F1040.1', 'F1040.25', 'Sch3.11', 'F8959', 'F6251.2i'],
    docs: ['D08', 'D09', 'D10', 'D11', 'D12', 'D13', 'D73']
  },
  {
    id: 'investments',
    name: 'Investments & digital assets',
    budget: 'investments_and_digital_assets',
    pre: [
      'SchB.1',
      'SchB.2',
      'SchB.4',
      'SchB.5',
      'SchB.6',
      'F8949',
      'SchD',
      'F1040.2b',
      'F1040.3',
      'F1040.7',
      'F8960'
    ],
    docs: ['D28', 'D29', 'D30', 'D31', 'D32', 'D33', 'D34', 'D35', 'D74']
  },
  {
    id: 'business',
    name: 'Business: Lindqvist Studio',
    budget: 'business',
    pre: ['SchC', 'SchSE', 'F4562-C', 'Sch1.15', 'Sch1.16', 'Sch1.17', 'F8995', 'Sch1.3'],
    docs: [
      'D14',
      'D15',
      'D16',
      'D17',
      'D18',
      'D19',
      'D20',
      'D21',
      'D22',
      'D23',
      'D24',
      'D25',
      'D26',
      'D27'
    ]
  },
  {
    id: 'rentals',
    name: 'Rentals & the condo sale',
    budget: 'rentals_and_sale',
    pre: [
      'SchE.1',
      'SchE.2',
      'SchE.3',
      'SchE.9',
      'SchE.11',
      'SchE.12',
      'SchE.14',
      'SchE.16',
      'SchE.18',
      'SchE.19',
      'SchE.20',
      'SchE.21',
      'SchE.22',
      'SchE.26',
      'F4562-E',
      'F4797',
      'F8582'
    ],
    docs: ['D46', 'D47', 'D48', 'D49', 'D50', 'D51', 'D52', 'D53']
  },
  {
    id: 'passthrough',
    name: 'K-1s & S corporation basis',
    budget: 'pass_throughs_and_basis',
    pre: ['SchE.28', 'SchE.32', 'SchE.41', 'F7203', 'ScheduleS', 'Sch1.5', 'Sch1.10'],
    docs: ['D37', 'D38', 'D39', 'D40']
  },
  {
    id: 'retirement',
    name: 'Retirement, HSA & foreign',
    budget: 'deductions_and_credits',
    pre: ['F8606', 'F1040.4', 'F8889', 'Sch1.13', 'SchB.7', 'SchB.8', 'F8938'],
    docs: ['D26', 'D36', 'D41', 'D42', 'D43', 'D44', 'D45']
  },
  {
    id: 'deductions',
    name: 'Deductions & credits',
    budget: 'deductions_and_credits',
    pre: [
      'SchA',
      'F8283',
      'F1040.12',
      'F1040.13',
      'F1040.14',
      'F2441',
      'Sch3.8',
      'Sch3.1',
      'F1040.19',
      'F1040.20'
    ],
    docs: [
      'D54',
      'D55',
      'D56',
      'D57',
      'D58',
      'D59',
      'D60',
      'D61',
      'D62',
      'D63',
      'D64',
      'D65',
      'D66'
    ]
  },
  {
    id: 'tax',
    name: 'Tax computation',
    budget: 'partner_review',
    pre: [
      'F1040.8',
      'F1040.9',
      'F1040.10',
      'F1040.11',
      'F1040.15',
      'F1040.16',
      'F1040.17',
      'F1040.18',
      'F1040.22',
      'F1040.23',
      'F1040.24',
      'F6251',
      'Sch2',
      'Sch1.26'
    ],
    docs: []
  },
  {
    id: 'payments',
    name: 'Payments, penalty & extension',
    budget: 'partner_review',
    pre: [
      'F1040.26',
      'F1040.31',
      'F1040.33',
      'F1040.37',
      'F1040.38',
      'Sch3.10',
      'Sch3.15',
      'F2210',
      'F540NR.72',
      'F540NR.73',
      'F540NR.78',
      'F540NR.97',
      'FTB5805'
    ],
    docs: ['D67', 'D68', 'D69']
  },
  {
    id: 'california',
    name: 'California (part-year) & state split',
    budget: 'california',
    pre: ['SchCA540NR', 'F540NR', 'FTB3885A'],
    docs: ['D38']
  }
];
const AREA = Object.fromEntries(AREAS.map((a) => [a.id, a]));
function areaOfLine(key) {
  let best = null,
    bl = -1;
  for (const a of AREAS)
    for (const p of a.pre)
      if ((key === p || key.startsWith(p + '.') || key.startsWith(p)) && p.length > bl) {
        best = a.id;
        bl = p.length;
      }
  return best || 'tax';
}
function areaOfDoc(d) {
  for (const a of AREAS) if (a.docs.includes(d)) return a.id;
  return 'identity';
}

/* =====================================================================
   EVENT STORE: append-only ledger. db (shared, live) when the viewer grants it;
   otherwise localStorage + BroadcastChannel (live across tabs on this device).
   ===================================================================== */
const Store = {
  events: [],
  listeners: [],
  mode: 'local',
  db: null,
  room: null,
  me: null,
  peers: {},
  KEY: 'miraflores.wp.CL-20417.v1',
  init() {
    try {
      this.events = JSON.parse(localStorage.getItem(this.KEY) || '[]');
    } catch (e) {
      this.events = [];
    }
    try {
      this.bc = new BroadcastChannel(this.KEY);
      this.bc.onmessage = (m) => {
        if (m.data?.type === 'events') {
          this.merge(m.data.events, false);
        } else if (m.data?.type === 'presence') {
          this.peers[m.data.p.tab] = m.data.p;
          this.emit();
        }
      };
    } catch (e) {}
    this.tab = uid('tab');
    this.connect();
  },
  async connect() {
    if (!window.claude?.use) return;
    try {
      const db = await window.claude.use('db');
      if (db) {
        this.db = db;
        this.mode = 'shared';
        db.collection('ledger').onSnapshot(
          (snap) => {
            const evs = [];
            snap.docs?.forEach?.((d) => {
              const x = d.data?.();
              if (x?.events) evs.push(...x.events);
            });
            this.merge(evs, false, true);
            this.emit();
          },
          (err) => {
            this.mode = 'local';
            this.emit();
          }
        );
        // push any local-only events up
        const pending = this.events.filter((e) => !e._synced);
        if (pending.length) this.pushShared(pending);
        this.emit();
      }
      const room = await window.claude.use('room');
      if (room) {
        this.room = room;
        room.onPeers?.((ps) => {
          this.roomPeers = ps;
          this.emit();
        });
      }
    } catch (e) {
      /* stays local */
    }
  },
  async pushShared(evs) {
    if (!this.db) return;
    // batch events into one doc per write (bounded doc count)
    try {
      await this.db
        .collection('ledger')
        .doc(uid('b'))
        .set({ events: evs.map((e) => ({ ...e, _synced: true })) });
      evs.forEach((e) => (e._synced = true));
      this.save();
    } catch (e) {
      toast('Saved on this device only: the shared ledger refused the write.');
    }
  },
  merge(evs, broadcast = true, fromShared = false) {
    const have = new Set(this.events.map((e) => e.id));
    let added = 0;
    for (const e of evs)
      if (!have.has(e.id)) {
        this.events.push(fromShared ? { ...e, _synced: true } : e);
        have.add(e.id);
        added++;
      }
    if (added) {
      this.events.sort((a, b) => (a.ts < b.ts ? -1 : 1));
      this.save();
      this.emit();
    }
  },
  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.events));
    } catch (e) {}
  },
  append(type, payload = {}, opts = {}) {
    const e = {
      id: uid('ev'),
      ts: new Date().toISOString(),
      at: UI.clock,
      actor: UI.actor,
      type,
      ...payload
    };
    if (opts.batch) e.batch = opts.batch;
    this.events.push(e);
    this.save();
    try {
      this.bc?.postMessage({ type: 'events', events: [e] });
    } catch (x) {}
    if (this.db) this.pushShared([e]);
    this.emit();
    return e;
  },
  appendMany(list) {
    const batch = uid('batch');
    const out = [];
    for (const [type, payload] of list) {
      const e = {
        id: uid('ev'),
        ts: new Date().toISOString(),
        at: UI.clock,
        actor: UI.actor,
        type,
        batch,
        ...payload
      };
      this.events.push(e);
      out.push(e);
    }
    this.save();
    try {
      this.bc?.postMessage({ type: 'events', events: out });
    } catch (x) {}
    if (this.db) this.pushShared(out);
    this.emit();
    return { batch, events: out };
  },
  on(fn) {
    this.listeners.push(fn);
  },
  emit() {
    this.listeners.forEach((f) => f());
  },
  reset() {
    this.events = [];
    this.save();
    this.emit();
  }
};

/* =====================================================================
   DERIVED STATE: fold the ledger into the workpaper's current state
   ===================================================================== */
// Replays ledger events into the current workpaper state without mutating the packet.
function derive() {
  const undone = new Set();
  for (const e of Store.events) if (e.type === 'undo') (e.ids || []).forEach((i) => undone.add(i));
  const S = {
    adj: {},
    dismissed: {},
    verify: {},
    notes: {},
    questions: {},
    signoffs: {},
    disp: {},
    variance: {},
    judgments: {},
    steps: {},
    assign: {},
    time: [],
    reveals: [],
    standards: null,
    filing: {},
    seen: {},
    log: [],
    amend: null,
    notice: null
  };
  for (const e of Store.events) {
    if (e.type === 'undo' || e.type === 'seen' || e.type === 'reveal') {
      if (e.type === 'seen') S.seen[e.actor] = e.ts;
      if (e.type === 'reveal') S.reveals.push(e);
      if (e.type !== 'seen') S.log.push(e);
      continue;
    }
    if (undone.has(e.id)) continue;
    S.log.push(e);
    switch (e.type) {
      case 'adj.add':
        S.adj[e.adjId] = {
          ...e.adj,
          id: e.adjId,
          by: e.actor,
          ts: e.ts,
          at: e.at,
          status: e.adj.needsPartner ? 'pending_partner' : 'active',
          findingId: e.findingId,
          amendment: S.filing.frozen ? true : !!e.amendment
        };
        break;
      case 'adj.approve':
        if (S.adj[e.adjId]) {
          S.adj[e.adjId].status = 'active';
          S.adj[e.adjId].approvedBy = e.actor;
        }
        break;
      case 'adj.reverse':
        if (S.adj[e.adjId]) {
          S.adj[e.adjId].status = 'reversed';
          S.adj[e.adjId].reversedBy = e.actor;
          S.adj[e.adjId].reverseWhy = e.reason;
        }
        break;
      case 'finding.dismiss':
        S.dismissed[e.findingId] = { by: e.actor, reason: e.reason, ts: e.ts };
        break;
      case 'verify':
        (S.verify[e.target] ||= []).push({
          method: e.method,
          note: e.note,
          by: e.actor,
          ts: e.ts,
          valueAt: e.valueAt,
          evidence: e.evidence || [],
          auto: e.auto
        });
        break;
      case 'note.add':
        S.notes[e.noteId] = {
          id: e.noteId,
          target: e.target,
          text: e.text,
          blocking: e.blocking !== false,
          by: e.actor,
          ts: e.ts,
          status: 'open',
          thread: [],
          area: e.area
        };
        break;
      case 'note.reply':
        S.notes[e.noteId]?.thread.push({ by: e.actor, text: e.text, ts: e.ts });
        break;
      case 'note.resolve':
        if (S.notes[e.noteId]) {
          S.notes[e.noteId].status = 'resolved';
          S.notes[e.noteId].resolvedBy = e.actor;
        }
        break;
      case 'note.reopen':
        if (S.notes[e.noteId]) S.notes[e.noteId].status = 'open';
        break;
      case 'q.ask':
        S.questions[e.qId] = {
          id: e.qId,
          to: e.to,
          text: e.text,
          target: e.target,
          by: e.actor,
          ts: e.ts,
          status: 'open',
          answers: []
        };
        break;
      case 'q.answer':
        if (S.questions[e.qId]) {
          S.questions[e.qId].answers.push({ by: e.actor, text: e.text, ts: e.ts });
          S.questions[e.qId].status = 'answered';
        }
        break;
      case 'signoff':
        S.signoffs[e.area + '|' + e.level] = { by: e.actor, ts: e.ts, hash: e.hash, at: e.at };
        break;
      case 'signoff.revoke':
        delete S.signoffs[e.area + '|' + e.level];
        break;
      case 'doc.disp':
        S.disp[e.doc] = { disp: e.disp, reason: e.reason, by: e.actor, ts: e.ts };
        break;
      case 'variance.explain':
        S.variance[e.key] = { text: e.text, by: e.actor, ts: e.ts };
        break;
      case 'judgment':
        S.judgments[e.jId] = {
          id: e.jId,
          topic: e.topic,
          decision: e.decision,
          authority: e.authority,
          penalty: e.penalty,
          area: e.area,
          by: e.actor,
          ts: e.ts
        };
        break;
      case 'step':
        S.steps[e.step] = { by: e.actor, ts: e.ts, done: e.done !== false };
        break;
      case 'assign':
        S.assign[e.area] = { who: e.who, due: e.due, by: e.actor, ts: e.ts };
        break;
      case 'time':
        S.time.push({ area: e.area, hours: e.hours, who: e.actor, note: e.note, ts: e.ts });
        break;
      case 'standards':
        S.standards = e.standards;
        break;
      case 'filing':
        Object.assign(S.filing, e.patch);
        break;
      case 'notice':
        S.notice = { ...(S.notice || {}), ...e.patch };
        break;
    }
  }
  return S;
}

/* =====================================================================
   INDEPENDENT CHECKS (do not trust the engine): recompute from evidence
   ===================================================================== */
// Recomputes tax checks from packet evidence and the selected engine version.
function runChecks(vk) {
  const L = IDX.lines[vk],
    V = IDX.versions[vk],
    R = V.tax_effect_rates;
  const lv = (k) => L[k]?.value;
  const out = [];
  const add = (f) => out.push(f);
  const has = (d) => docVisible(d);

  // 1. Noncovered RSU lots taken at zero basis although the supplement gives adjusted basis
  if (has('D11')) {
    const sup = pageText('D11', 2);
    const lots = [];
    for (const m of sup.matchAll(
      /Lot (RSU-\d+): (\d+) sh acquired (\d\d)\/(\d\d)\/(\d{4}).*?adjusted basis ([\d,]+\.\d\d)/g
    ))
      lots.push({
        lot: m[1],
        sh: +m[2],
        acq: `${m[5]}-${m[3]}-${m[4]}`,
        basis: +m[6].replace(/,/g, '')
      });
    const hits = [];
    for (const k of Object.keys(L).filter((k) => /^F8949\.[BE]\.N\d/.test(k))) {
      const l = L[k];
      const acq = (l.label.match(/acquired (\d{4}-\d\d-\d\d)/) || [])[1];
      const sup1 = lots.find((x) => x.acq === acq);
      if (sup1 && /basis 0\.00/.test(l.label))
        hits.push({ k, box: k.split('.')[1], basis: sup1.basis, lot: sup1.lot });
    }
    if (hits.length) {
      const st = hits.filter((h) => h.box === 'B').reduce((s, h) => s + h.basis, 0),
        lt = hits.filter((h) => h.box === 'E').reduce((s, h) => s + h.basis, 0);
      add({
        id: 'rsu-basis',
        kind: 'error',
        area: 'investments',
        title: 'RSU sales taxed at zero basis (income counted twice)',
        check:
          'Match every noncovered lot to the stock-plan supplement; basis already taxed as W-2 wages',
        engine: `Form 8949 box B/E lots ${hits.map((h) => h.k.split('.')[2]).join(', ')} use basis 0.00; gain equals full proceeds.`,
        evidence: `Corvane supplement (D11 p2) gives adjusted basis ${hits.map((h) => h.lot + ' ' + fmt(h.basis, 2)).join('; ')}. The vest value is already in W-2 box 1 (Box 14 RSU 38,200).`,
        refs: ['doc:D11#page2', 'ev-0067', 'ev-0069', 'ev-0071', ...hits.map((h) => h.k)],
        lines: hits.map((h) => h.k),
        adj: [
          {
            line: 'SchD.2',
            kind: 'rate',
            cat: 'stcg',
            amount: -st,
            caCat: 'ca_source_income',
            caAmount: -st,
            label: `Add RSU basis to short-term noncovered lots (${fmt(st)})`
          },
          {
            line: 'SchD.9',
            kind: 'rate',
            cat: 'ltcg',
            amount: -lt,
            label: `Add RSU basis to long-term noncovered lot (${fmt(lt)})`
          }
        ],
        why: 'Both short-term lots were sold during California residency, so the California effect uses the California-source rate. Report with code B adjustment on Form 8949 (column g), not by changing broker basis.'
      });
    }
  }
  // 2. Same interest reported by the composite and the bank's own 1099-INT
  if (has('D28') && has('D29')) {
    const a = L['SchB.1.1'],
      b = L['SchB.1.2'];
    if (
      a &&
      b &&
      a.value === b.value &&
      /sweep/i.test(pageText('D29', 1)) &&
      /7731/.test(pageText('D29', 1)) &&
      /7731/.test(pageText('D28', 1))
    )
      add({
        id: 'int-dup',
        kind: 'error',
        area: 'investments',
        title: 'Northlake sweep interest counted twice',
        check: 'Group interest by underlying account, not by form',
        engine: `Schedule B lists ${fmt(a.value)} from the Northlake Securities composite and ${fmt(b.value)} from Northlake Bank.`,
        evidence:
          'D29 says it is the bank sweep program for Northlake Securities account ending 7731, the same interest D28 already reports.',
        refs: ['ev-0492', 'ev-0538', 'doc:D29#page1', 'doc:D28#page1'],
        lines: ['SchB.1.2', 'SchB.2', 'F1040.2b'],
        adj: [
          {
            line: 'SchB.1.2',
            kind: 'rate',
            cat: 'interest',
            amount: -b.value,
            label: 'Remove duplicate Northlake Bank interest'
          }
        ]
      });
  }
  // 3. Foreign interest at the wrong year's exchange rate
  const sek = L['SchB.1.6'];
  if (sek && /10\.56/.test(sek.label)) {
    const sekAmt = IDX.ev['ev-0960']?.value ?? 18450,
      rate = P.engine_reference.parameters.fx.SEK['2025_average'];
    const right = Math.round(sekAmt / rate);
    add({
      id: 'sek-fx',
      kind: 'error',
      area: 'retirement',
      title: 'Swedish interest converted at the 2024 average rate',
      check: 'Recompute every foreign-currency amount at the rate for its own year',
      engine: `SEK ${fmt(sekAmt, 2)} at 10.56 (ref:fx.SEK.2024_average) = ${fmt(sek.value)}.`,
      evidence: `2025 average is ${rate} SEK/USD (engine_reference). SEK ${fmt(sekAmt, 2)} / ${rate} = ${fmt(right)}.`,
      refs: ['ev-0960', 'ref:fx.SEK.2025_average'],
      lines: ['SchB.1.6'],
      adj: [
        {
          line: 'SchB.1.6',
          kind: 'rate',
          cat: 'interest',
          amount: right - sek.value,
          label: 'Convert at 2025 average rate'
        }
      ]
    });
  }
  // 4. 1099-K amount added on top of books revenue that already contains it
  const g = L['SchC.1'];
  if (g && has('D15') && has('D21')) {
    const books = 151300,
      k = IDX.ev['ev-0127']?.value ?? 12400,
      txt = pageText('D15', 3);
    if (/Paywell/.test(txt) && g.value - books === k)
      add({
        id: '1099k-dup',
        kind: 'error',
        area: 'business',
        title: 'Form 1099-K receipts double counted in gross receipts',
        check: 'Reconcile books deposits to every information return (1099-NEC, 1099-K)',
        engine: `Gross receipts ${fmt(g.value)} = books ${fmt(books)} + unmatched 1099-K ${fmt(k)}.`,
        evidence:
          'D15 p3: Atlas paid 41,200, of which 12,400 came through Paywell card processing and was deposited gross into sales. The 1099-K is already inside books revenue (and inside Atlas\u2019s 1099-NEC).',
        refs: ['ev-0127', 'doc:D15#page3', 'ev-0113'],
        lines: ['SchC.1'],
        adj: [
          {
            line: 'SchC.1',
            kind: 'rate',
            cat: 'schc_profit',
            amount: -k,
            label: 'Remove 1099-K amount already in books revenue'
          }
        ]
      });
  }
  // 5. Mileage: the same page scanned twice
  if (has('D23')) {
    const trips = {};
    const pages = IDX.doc.D23.pages;
    let dupPages = [];
    pages.forEach((p) => {
      const sig = (p.printed_content.match(/\d{4}-\d\d-\d\d [^;]+? \d+ mi/g) || []).join('|');
      if (trips[sig]) dupPages.push(p.page);
      else trips[sig] = p.page;
    });
    const unique =
      Object.keys(trips)
        .join('|')
        .match(/\d+ mi/g)
        ?.reduce((s, x) => s + parseInt(x), 0) || 0;
    const bm = lv('SchC.44a'),
      rate = P.engine_reference.parameters.mileage_rate;
    const odo = (IDX.ev['ev-0479']?.value || 0) - (IDX.ev['ev-0478']?.value || 0);
    if (dupPages.length && bm > unique)
      add({
        id: 'mileage-dup',
        kind: 'error',
        area: 'business',
        title: `Mileage log page ${dupPages.join(', ')} is a second scan of page 2`,
        check: 'Sum the trips, not the page totals; tie to odometer',
        engine: `Business miles ${fmt(bm)} = sum of four page totals (2,600 + 3,700 + 3,700 + 1,800).`,
        evidence: `Page 3 is marked as a second scan of the May-Aug sheet. Unique trips total ${fmt(unique)} miles of ${fmt(odo)} odometer miles.`,
        refs: ['ev-0226', 'ev-0315', 'ev-0404', 'ev-0477', 'ev-0478', 'ev-0479', 'doc:D23#page3'],
        lines: ['SchC.44a', 'SchC.9'],
        adj: [
          {
            line: 'SchC.9',
            kind: 'rate',
            cat: 'schc_profit',
            amount: Math.round((bm - unique) * rate),
            lineDelta: -Math.round((bm - unique) * rate),
            label: `Car expense on ${fmt(unique)} miles x ${rate}`
          }
        ]
      });
  }
  // 6/7. Mixed-use phone and internet, personal subscription
  if (IDX.call['call-01'] && L['SchC.25']?.value === 3480)
    add({
      id: 'phone-net',
      kind: 'error',
      area: 'business',
      title: 'Family phone plan and home internet deducted at 100%',
      check: 'Apply the business-use share the client gave on the call',
      engine: 'Utilities 3,480 = telephone 2,160 + internet 1,320 from books, at 100%.',
      evidence:
        'Call 2026-03-26: phone plan covers 4 family lines, business share about 70%; internet business use about 50%. 2,160 x 70% + 1,320 x 50% = 2,172.',
      refs: ['call-01', 'doc:D15#page2', 'ev-0101', 'ev-0095'],
      lines: ['SchC.25'],
      adj: [
        {
          line: 'SchC.25',
          kind: 'rate',
          cat: 'schc_profit',
          amount: 3480 - 2172,
          lineDelta: -(3480 - 2172),
          label: 'Reduce to business share (2,172)'
        }
      ]
    });
  if (/Spotify Family 216/.test(pageText('D15', 1)) && L['SchC.27a.1']?.value === 6850)
    add({
      id: 'spotify',
      kind: 'error',
      area: 'business',
      title: 'Personal Spotify Family subscription in business software',
      check: 'Read transaction detail behind each books line',
      engine: 'Software and subscriptions 6,850 taken in full.',
      evidence:
        'D15 p1 lists Spotify Family 216; the client said on the call it is personal and was booked by mistake.',
      refs: ['doc:D15#page1', 'call-01', 'ev-0099'],
      lines: ['SchC.27a.1'],
      adj: [
        {
          line: 'SchC.27a.1',
          kind: 'rate',
          cat: 'schc_profit',
          amount: 216,
          lineDelta: -216,
          label: 'Remove personal subscription'
        }
      ]
    });
  // 8. SE health insurance while eligible for a spouse's subsidized employer plan
  if (
    L['Sch1.17']?.value > 0 &&
    /both of Ngozi's employers offer family coverage/.test(IDX.qa['qa-25'].answer)
  )
    add({
      id: 'sehi',
      kind: 'error',
      area: 'business',
      title: 'Self-employed health insurance deduction not allowed',
      check: 'Test every month for eligibility under a spouse\u2019s subsidized employer plan',
      engine: `Schedule 1 line 17 deducts ${fmt(L['Sch1.17'].value)} of Erik\u2019s individual premiums.`,
      evidence:
        'qa-25: both of Ngozi\u2019s employers offered family coverage and Erik was eligible; he kept his own plan. Eligibility (not enrollment) bars the deduction for those months. The prior preparer also took 0 in 2024.',
      refs: ['qa-25', 'ev-0484', 'py:/return_2024/notes/Sch1.17'],
      lines: ['Sch1.17'],
      adj: [
        {
          line: 'Sch1.17',
          kind: 'rate',
          cat: 'adjustment',
          amount: -L['Sch1.17'].value,
          label: 'Remove SE health insurance deduction'
        }
      ],
      why: 'Employment gap 05/17 to 06/01 may leave May without eligibility under either plan; record as a judgment if the client wants to claim one month. QBI effect is not captured by the adjustment rate.'
    });
  // 9. HVAC replacement expensed as a repair
  if (/HVAC 11,000.00 is inside repairs/.test(L['SchE.14A']?.note || '')) {
    const w = P.what_if.alternatives.find((a) => a.id === 'hvac_improvement');
    add({
      id: 'hvac',
      kind: 'error',
      area: 'rentals',
      title: 'New HVAC system at Fremont Way expensed as a repair',
      check: 'Classify repairs over a threshold against the invoice',
      engine: 'Repairs 13,300 include the 11,000 HVAC replacement.',
      evidence:
        'D47: removed failed furnace and AC, installed a new heat pump system, air handler, line set and thermostat (permit B25-31877). A replacement of a building system is a restoration, capitalized over 27.5 years.',
      refs: ['doc:D47#page1', 'doc:D46#page1', 'call-01', 'ev-1000'],
      lines: ['SchE.14A', 'SchE.18A'],
      adj: [
        {
          line: 'SchE.14A',
          kind: 'fixed',
          fed: w?.federal.total_tax_change ?? 0,
          ca: w?.california.total_tax_change ?? 0,
          amount: -11000,
          lineDelta: -11000,
          label: 'Capitalize 11,000 as SAC-HVAC (engine what-if hvac_improvement)'
        }
      ],
      why: 'Effect taken from the engine\u2019s own what-if result, not a rate estimate.'
    });
  }
  // 10. Payoff interest added on top of a Form 1098 that already includes it
  if (
    /payoff statement - interest 2,150.00/.test(L['SchA.8a']?.note || '') &&
    /interest paid at payoff/.test(pageText('D55', 1))
  )
    add({
      id: 'mtg-dup',
      kind: 'error',
      area: 'deductions',
      title: 'Lonestar payoff interest counted twice',
      check: 'Read each lender statement for what it already includes',
      engine:
        'Mortgage interest adds the payoff statement\u2019s 2,150 to the Lonestar 1098\u2019s 13,900.',
      evidence:
        'D55: box 1 includes interest paid at payoff 11/20/2025. D56 says the interest is reported on the 2025 Form 1098.',
      refs: ['ev-1029', 'ev-1032', 'doc:D55#page1', 'doc:D56#page1'],
      lines: ['SchA.8a'],
      adj: [
        {
          line: 'SchA.8a',
          kind: 'rate',
          cat: 'itemized',
          amount: -2150,
          label: 'Remove payoff interest already in box 1'
        }
      ]
    });
  // 11. Home property tax: seller's share of the bill
  if (
    L['SchA.5b']?.value === 13420 &&
    /Seller credit for 2025 county taxes 01\/01\/2025-07\/07\/2025: 6,912.00/.test(
      pageText('D54', 1)
    )
  ) {
    const after = L['SchA.5d'].value - 6912,
      cap = P.engine_reference.parameters.salt_cap,
      lost = Math.max(0, cap - after);
    add({
      id: 're-tax',
      kind: 'error',
      area: 'deductions',
      title: 'Home property tax includes the seller\u2019s share',
      check: 'Allocate real estate tax by days owned using the closing statement',
      engine: 'Real estate taxes 13,420: the full 2025 Travis County bill paid from escrow.',
      evidence:
        'D54: seller credited the buyers 6,912 for 01/01 to 07/07. That part is the seller\u2019s tax; the buyers may deduct 13,420 - 6,912 = 6,508.',
      refs: ['ev-1036', 'ev-1038', 'doc:D54#page1', 'doc:D58#page1'],
      lines: ['SchA.5b', 'SchA.5d', 'SchA.5e'],
      adj: [
        {
          line: 'SchA.5b',
          kind: 'fixed',
          amount: -6912,
          lineDelta: -6912,
          fed: Math.round(lost * -R.itemized.federal_per_dollar),
          ca: Math.round(-6912 * R.salt.california_per_dollar),
          label: `Deduct only the buyers\u2019 share (6,508)`
        }
      ],
      why: `Total state and local taxes fall to ${fmt(after)}, below the ${fmt(cap)} cap, so ${fmt(lost)} of deduction is lost federally (itemized rate). This crosses a threshold: confirm on engine recompute.`
    });
  }
  // 12. Vehicle donation above gross proceeds
  if (L['F8283.A1.vehicle']?.value === 6000 && IDX.ev['ev-1055'])
    add({
      id: 'car',
      kind: 'error',
      area: 'deductions',
      title: 'Donated car claimed at Kelley Blue Book value',
      check: 'Cap vehicle gifts at the charity\u2019s sale price (Form 1098-C box 4c)',
      engine: 'Form 8283 vehicle 6,000 from the questionnaire.',
      evidence:
        'D66 box 4a checked: sold to an unrelated party 09/09/2025 for 2,900. The deduction is limited to gross proceeds.',
      refs: ['qa-39', 'doc:D66#page1', 'ev-1055'],
      lines: ['F8283.A1.vehicle', 'SchA.12'],
      adj: [
        {
          line: 'F8283.A1.vehicle',
          kind: 'rate',
          cat: 'itemized',
          amount: -3100,
          label: 'Limit to 1098-C gross proceeds (2,900)'
        }
      ]
    });
  // 13. Federal Q4 estimate from memory vs IRS transcript
  {
    const tr = P.tax_agency_records.irs_account_transcript_2025[0].transactions.filter(
      (t) => t.code === '670' && t.date < '2026-04-01'
    );
    const trSum = tr.reduce((s, t) => s + t.amount, 0);
    if (L['F1040.26'] && trSum !== L['F1040.26'].value)
      add({
        id: 'fed-est',
        kind: 'error',
        area: 'payments',
        title: 'Fourth-quarter federal estimate overstated by 1,000',
        check: 'Agree every estimated payment to the IRS account transcript',
        engine: `Estimated payments ${fmt(L['F1040.26'].value)}: Q4 4,000 on 2026-01-14 taken from the questionnaire (no confirmation uploaded).`,
        evidence: `IRS transcript (D69): four 670 payments of 3,000, total ${fmt(trSum)}. The Q4 payment posted 2026-01-15 for 3,000.`,
        refs: ['qa-41', 'doc:D67#page1', 'agency:/irs_account_transcript_2025/0'],
        lines: ['F1040.26'],
        adj: [
          {
            line: 'F1040.26',
            kind: 'payment',
            fedPay: trSum - L['F1040.26'].value,
            label: 'Agree estimates to transcript'
          }
        ]
      });
  }
  // 14. California estimate designated to the wrong year
  {
    const ftb = P.tax_agency_records.ftb_account;
    const s = ftb.tax_year_2025_payments.reduce((a, p) => a + p.amount, 0);
    if (L['F540NR.72'] && L['F540NR.72'].value !== s)
      add({
        id: 'ca-est',
        kind: 'error',
        area: 'payments',
        title: 'California 09/15/2025 payment was applied to 2024',
        check: 'Agree state payments to the FTB account, by the year each was designated',
        engine: `2025 California estimates ${fmt(L['F540NR.72'].value)}: every FTB payment dated 2025-04-01 to 2026-01-15.`,
        evidence: `D68 shows the 09/15/2025 3,500 Web Pay was designated tax year 2024; FTB holds it as a 2024 credit. FTB shows ${fmt(s)} for 2025.`,
        refs: ['ev-1074', 'doc:D68#page1', 'agency:/ftb_account'],
        lines: ['F540NR.72'],
        adj: [
          {
            line: 'F540NR.72',
            kind: 'payment',
            caPay: s - L['F540NR.72'].value,
            label: 'Claim only payments FTB holds for 2025'
          }
        ],
        why: 'Alternative: ask FTB to transfer the 2024 credit to 2025 before filing; record the choice as a judgment.'
      });
  }
  // 15. California-source wages after the move
  if (L['SchCA540NR.1.E']?.value === L['SchCA540NR.1.D']?.value && has('D73')) {
    const corv = IDX.ev['ev-0030']?.value ?? 107100;
    const halv = 22469; // D73 CA taxable YTD through 07/15/2025
    const right = corv + halv,
      over = L['SchCA540NR.1.E'].value - right;
    add({
      id: 'ca-wages',
      kind: 'error',
      area: 'california',
      title: 'Wages earned in Texas sourced to California',
      check: 'Source wages by where the work was done, using the pay stub at the move date',
      engine: `California wages ${fmt(L['SchCA540NR.1.E'].value)} = Form W-2 box 16 from both employers.`,
      evidence: `Halvorsen kept California as the work state through 09/30 by mistake (D09, qa-45). The 07/18 pay stub (D73) shows CA taxable wages 22,469 through 07/15, when work moved to Austin. California-source = Corvane ${fmt(corv)} + Halvorsen ${fmt(halv)} = ${fmt(right)}.`,
      refs: [
        'ev-0030',
        'ev-0047',
        'doc:D09#page1',
        'doc:D73#page1',
        'qa-45',
        'household:residency'
      ],
      lines: ['SchCA540NR.1.E'],
      adj: [
        {
          line: 'SchCA540NR.1.E',
          kind: 'rate',
          cat: 'ca_source_income',
          amount: -over,
          label: `California-source wages ${fmt(right)}`
        }
      ],
      why: 'California withholding from the Texas period stays a payment; it comes back as refund. Ask Halvorsen for a corrected W-2 (box 15/16).'
    });
  }
  // 16. Dependent SSN: organizer vs last year\u2019s return
  {
    const org = P.household.people.find((p) => p.id === 'theo').ssn,
      py = P.prior_years.return_2024.dependents.find((d) => /Theo/.test(d.name)).ssn;
    if (org !== py)
      add({
        id: 'theo-ssn',
        kind: 'error',
        area: 'identity',
        title: 'Theo\u2019s SSN on the organizer differs from last year\u2019s return',
        blocking: true,
        check: 'Compare every identity number to prior-year filings and ID documents',
        engine: `Return uses ${org} (household, typed by the client).`,
        evidence: `2024 return (accepted by IRS) shows ${py}. Digits 3 and 4 of the serial are swapped. ${docVisible('D71') ? 'Social Security card (D71) confirms ' + pageText('D71', 1).match(/\d{3}-\d\d-\d{4}/)[0] + '.' : 'Request the Social Security card before filing.'}`,
        refs: [
          'household:theo',
          'py:/return_2024/dependents/1',
          ...(docVisible('D71') ? ['doc:D71#page1'] : [])
        ],
        lines: ['F8812.4'],
        adj: [
          { line: 'household:theo.ssn', kind: 'data', amount: 0, label: `Correct SSN to ${py}` }
        ],
        why: 'No tax effect, but the IRS rejects the e-file (R0000-504-02) and the child tax credit cannot be claimed with a mismatched TIN.'
      });
  }
  // 17. Care provider TIN transposed by extraction
  {
    const e = IDX.ev['ev-1045'];
    const printed = (pageText('D62', 1).match(/Tax ID (\d\d-\d+)/) || [])[1];
    if (e && printed && e.value !== printed)
      add({
        id: 'care-tin',
        kind: 'error',
        area: 'deductions',
        title: 'Little Sprouts tax ID misread (confidence 0.97)',
        blocking: true,
        check: 'Re-read identifying numbers against the printed page',
        engine: `Form 2441 line 1b uses ${e.value}.`,
        evidence: `D62 prints ${printed}. Two digits transposed.`,
        refs: ['ev-1045', 'doc:D62#page1'],
        lines: ['F2441.1b'],
        adj: [{ line: 'F2441.1b', kind: 'data', amount: 0, label: `Provider TIN ${printed}` }],
        why: 'No tax effect (credit is 0), but Form 2441 still reports providers to exclude the 5,000 dependent care benefit.'
      });
    if (/Preschool/.test(L['F2441.1a']?.label || ''))
      add({
        id: 'care-name',
        kind: 'info',
        area: 'deductions',
        title: 'Provider name on Form 2441 differs from the statement',
        check: 'Agree provider names to statements',
        engine: L['F2441.1a'].label,
        evidence:
          'D61 is issued by Bright Oak Kids Club (same TIN 68-0412257). Prior-year 2441 also used Bright Oak Kids Club.',
        refs: ['ev-1043', 'doc:D61#page1', 'py:/return_2024/lines/F2441.provider'],
        lines: ['F2441.1a'],
        adj: [
          { line: 'F2441.1a', kind: 'data', amount: 0, label: 'Provider name Bright Oak Kids Club' }
        ]
      });
  }
  // 18. Crypto lot with no basis: client has evidence
  if (L['F8949.H.C6'])
    add({
      id: 'crypto-c6',
      kind: 'judgment',
      area: 'investments',
      title: 'Coinhaven lot C6 reported at zero basis and a June 2025 acquisition',
      check: 'Trace transfers-in to their original purchase',
      engine: 'Basis 0.00, acquired 2025-06-01 (the transfer-in date): short-term gain 5,325.',
      evidence:
        'msg-07: bought on CryptoNorth 03/15/2021 for about 3,050, moved to Coinhaven in June; only a bank statement line survives. If accepted: long-term, basis 3,050, gain 2,275.',
      refs: ['ev-0918', 'ev-0919', 'msg-07', 'F8949.H.C6'],
      lines: ['F8949.H.C6', 'SchD.3'],
      adj: [
        {
          line: 'SchD.3',
          kind: 'rate',
          cat: 'stcg',
          amount: -5325,
          caCat: 'ca_source_income',
          caAmount: -3050,
          label: 'Remove C6 from short-term'
        },
        {
          line: 'SchD.10',
          kind: 'rate',
          cat: 'ltcg',
          amount: 2275,
          caCat: null,
          label: 'Report C6 long-term, basis 3,050'
        }
      ],
      why: 'Substantiation is a bank statement and the client\u2019s word. Obtain the bank statement as evidence and record the judgment with authority (Treas. Reg. 1.1012-1(j); Cohan rule risk).'
    });
  // 19. Unread broker page
  {
    const d = IDX.doc.D31,
      txt = pageText('D31', 32),
      lotsSum = 71715,
      summ = 71965;
    if (d && d.extraction.status === 'partial' && /M18/.test(txt) && !L['F8949.B.M18'])
      add({
        id: 'meridian-p32',
        kind: 'error',
        area: 'investments',
        title: 'Meridian page 32 not read: one sale missing',
        check: 'Tie every broker\u2019s summary proceeds to the sum of its lots',
        engine: `Lots total ${fmt(lotsSum, 2)} vs summary ${fmt(summ, 2)} (diagnostic BROKER_SUMMARY_DETAIL_MISMATCH).`,
        evidence:
          'D31 page 32 (Additional transactions): M18 Ironwood REIT cash in lieu, proceeds 250.00, basis 310.00, short-term noncovered. Adding it ties the summary exactly.',
        refs: ['doc:D31#page32', 'ev-0703'],
        lines: ['F8949.B.total', 'SchD.2'],
        adj: [
          {
            line: 'SchD.2',
            kind: 'rate',
            cat: 'stcg',
            amount: -60,
            label: 'Add M18: loss (60), box B'
          }
        ]
      });
  }
  // 20. SEP excess contribution
  if (L['Sch1.16'] && /Contribution 18,000.00/.test(L['Sch1.16'].note || ''))
    add({
      id: 'sep-excess',
      kind: 'judgment',
      area: 'business',
      title: 'SEP contribution exceeds the deductible limit',
      check: 'Recompute the SEP limit after every Schedule C change',
      engine: `Deduction ${fmt(L['Sch1.16'].value)}; 2,786 carried forward.`,
      evidence:
        'D26: 18,000 deposited 04/10/2026. The limit falls further after the Schedule C corrections (about 13,700). An excess left in the SEP is subject to a 6% excise tax each year (Form 5329) unless withdrawn with earnings by the due date.',
      refs: ['ev-0485', 'doc:D26#page1', 'qa-26'],
      lines: ['Sch1.16'],
      adj: [],
      why: 'Decision for the partner and client: withdraw the excess before 10/15/2026, or keep it and file Form 5329.'
    });
  // 21. Handwritten receipt
  if (IDX.ev['ev-1049']?.confidence < 0.5)
    add({
      id: 'brigid',
      kind: 'judgment',
      area: 'deductions',
      title: 'St. Brigid gift: receipt digit unreadable (1,500 or 7,500)',
      check: 'Hold low-confidence reads until confirmed by a second source',
      engine: 'Cash gifts include 1,500 read at confidence 0.41.',
      evidence:
        'msg-08: parish confirmed 1,500 by phone; bank statement check #2207 on 12/21/2025. A gift of 250 or more needs a contemporaneous written acknowledgment; the phone call is not one.',
      refs: ['ev-1049', 'doc:D64#page1', 'msg-08'],
      lines: ['SchA.11'],
      adj: [],
      why: 'Keep 1,500. Ask the client for a typed acknowledgment from the parish and attach the bank statement before filing.'
    });
  // 22. Questionnaire answers the documents contradict
  add({
    id: 'qa-sales',
    kind: 'info',
    area: 'investments',
    title: 'Questionnaire says no investments were sold',
    check: 'Compare every client answer to the documents',
    engine: 'Engine followed the documents (diagnostic QUESTIONNAIRE_SALES_CONFLICT).',
    evidence:
      'qa-14 "No"; documents show 282 brokerage sales and 12 crypto dispositions (qa-15: "just moved things around"). The client likely means no sales they decided on (direct-indexing account). Confirm and educate.',
    refs: ['qa-14', 'qa-15', 'D74', 'D34'],
    lines: [],
    adj: []
  });
  add({
    id: 'ira-basis',
    kind: 'pass',
    area: 'retirement',
    title: 'IRA basis 7,000 from 2024 is real, despite the client\u2019s answer',
    check: 'Agree carryover basis to the 2024 Form 8606 and Form 5498',
    engine: 'Form 8606 line 2 = 7,000 from the 2024 return.',
    evidence:
      'qa-31 says no prior basis, but D42 shows the 2024 contribution made 02/12/2025, and D41 shows two conversions (7,010 and 7,016). Pro-rata taxable amount 26 recomputes.',
    refs: ['qa-31', 'ev-0991', 'ev-0992', 'ev-0987', 'py:/return_2024/lines/F8606.14'],
    lines: ['F8606.2', 'F8606.18'],
    adj: [],
    autoVerify: { line: 'F8606.2', method: 'agreed_to_prior_year' }
  });
  // 23. Things outside the return the firm must identify
  add({
    id: 'outside',
    kind: 'judgment',
    area: 'retirement',
    title: 'Filings outside this return',
    check: 'Completeness: list every filing the facts require, in scope or not',
    engine: 'Diagnostics mention FBAR and Forms 1099-NEC only.',
    evidence:
      'FinCEN 114 for 2025 (maximum SEK 1,452,300) due 10/15/2026. Forms 1099-NEC for Mara Quintero (4,800) and Dev Patel (2,600), late since 02/02/2026. Form 3520 for 2023: inheritance from Birgitta Lindqvist (foreign person) over 100,000; the prior preparer left it open. Oregon: K-1 shows a composite return filed for Erik. Ada files her own return claiming no AOTC.',
    refs: [
      'F8938.1.max',
      'doc:D36#page1',
      'doc:D27#page1',
      'doc:D07#page3',
      'doc:D39#page2',
      'household:related_returns'
    ],
    lines: [],
    adj: [],
    why: 'Engagement letter excludes FBAR, 1099s and other states: send the client a written scope-limitation notice and offer to prepare them. Form 3520 penalties can be 5% per month up to 25%: partner to discuss reasonable cause.'
  });
  add({
    id: 'ca-amt',
    kind: 'judgment',
    area: 'california',
    title: 'California AMT on the ISO exercise is not computed',
    check: 'Cover areas the engine skips',
    engine: 'F540NR line 61 = 0 (not computed).',
    evidence:
      'ISOs granted 03/01/2022 while working in California, exercised 07/30/2025 after the move. The 40,000 spread is California-source in proportion to California workdays from grant to exercise. Schedule P (540NR) may produce California AMT.',
    refs: ['ev-0075', 'ev-0076', 'F6251.2i'],
    lines: ['F540NR.61'],
    adj: []
  });
  add({
    id: 'homeoffice-py',
    kind: 'info',
    area: 'business',
    title: 'Prior preparer used 300 sq ft; measured room is 220',
    check: 'Agree prior-year assumptions to evidence',
    engine: '2025 uses 240 average (correct).',
    evidence:
      'D24 measures the Sacramento studio at 220 sq ft. 2024 claimed 300 (prior preparer note: "2 rooms combined?"). 2024 overstated by 400; below the threshold for an amended return. Document and close the prior preparer\u2019s open item.',
    refs: ['doc:D24#page1', 'doc:D07#page2'],
    lines: ['SchC.30'],
    adj: []
  });

  /* ---- recomputations that agree with the engine: they become tick marks ---- */
  const pass = (id, area, title, line, detail, refs) =>
    add({
      id,
      kind: 'pass',
      area,
      title,
      check: 'Independent recomputation',
      engine: `${line} = ${fmt(lv(line))}`,
      evidence: detail,
      refs,
      lines: [line],
      adj: [],
      autoVerify: { line, method: 'recalculated' }
    });
  const w1 = (IDX.ev['ev-0016']?.value || 0) + (IDX.ev['ev-0035']?.value || 0);
  if (w1 === lv('F1040.1a'))
    pass(
      'w2-sum',
      'wages',
      'Wages agree to distinct W-2s (phone photo D10 matched to D09)',
      'F1040.1a',
      `104,600 + 107,800 = ${fmt(w1)}; D10 has the same EIN and identical boxes as D09.`,
      ['ev-0016', 'ev-0035', 'doc:D10#page1']
    );
  const ss =
    (IDX.ev['ev-0019']?.value || 0) +
    (IDX.ev['ev-0038']?.value || 0) -
    P.engine_reference.parameters.ss_wage_base * 0.062;
  if (Math.round(ss) === lv('Sch3.11'))
    pass(
      'excess-ss',
      'wages',
      'Excess social security recomputed',
      'Sch3.11',
      `6,944 + 7,316 - 176,100 x 6.2% = ${fmt(ss, 2)}`,
      ['ev-0019', 'ev-0038']
    );
  const iso = 1000 * (52 - 12);
  if (iso === lv('F6251.2i'))
    pass(
      'iso',
      'wages',
      'ISO AMT adjustment recomputed',
      'F6251.2i',
      '1,000 sh x (52.00 - 12.00) = 40,000; shares still held (qa-06).',
      ['ev-0076', 'ev-0077', 'ev-0078', 'ev-0079', 'qa-06']
    );
  if (lv('F7203.1') === 2300)
    pass(
      'scorp-basis',
      'passthrough',
      'S corporation basis rolls forward with the 2023 K-1',
      'F7203.1',
      '2022 end 21,300 + 2023 income 14,100 - distributions 20,000 = 15,400; + 2024 income 16,900 - distributions 30,000 = 2,300. Distributions in excess of basis 2025: 21,215 (capital gain).',
      [
        'py:/basis_records/scorp_lindqvist_family_woodworks/0',
        'ev-0983',
        'ev-0985',
        'py:/return_2024/K1_1120S'
      ]
    );
  if (lv('F4797.25') === 105040)
    pass(
      'condo-gain',
      'rentals',
      'Condo gain recomputed from the closing statements',
      'F4797.25',
      '395,000 - (310,000 + 6,600 + 21,725 + 1,975 - 50,340 depreciation) = 105,040; unrecaptured 1250 gain 50,340.',
      ['ev-1023', 'ev-1019', 'ev-1022', 'doc:D51#page1', 'doc:D51#page2']
    );
  if (lv('SchE.18B') === 7329)
    pass(
      'dep-b',
      'rentals',
      'Condo depreciation recomputed (mid-month, sold October)',
      'SchE.18B',
      '248,000/27.5 x 9.5/12 = 7,139.39; 6,600/27.5 x 9.5/12 = 190.00; total 7,329.',
      ['asset:AUS-BLDG', 'asset:AUS-FLOOR']
    );
  if (lv('F8812.12') === 400)
    pass(
      'ctc',
      'identity',
      'Child tax credit phase-out recomputed',
      'F8812.12',
      '2,200 + 500 = 2,700; (445,590 - 400,000)/1,000 rounded up = 46 x 50 = 2,300; credit 400.',
      ['household:theo', 'household:ada']
    );
  if (lv('F8889.9') === 6000)
    pass(
      'hsa',
      'retirement',
      'HSA employer contributions agree W-2 code W to Form 5498-SA',
      'F8889.9',
      '2,500 + 3,500 = 6,000 = 5498-SA box 2; family limit 8,550.',
      ['ev-0024', 'ev-0043', 'ev-0997']
    );
  const rid = 60000 + 9870 - 6000 - 210;
  if (rid === 63660)
    pass(
      'ridgeline-cap',
      'passthrough',
      'Ridgeline capital account rolls',
      'SchE.28B',
      `60,000 + 9,870 - 6,000 - 210 = ${fmt(rid)} = K-1 ending capital.`,
      ['ev-0969', 'ev-0970', 'ev-0967']
    );
  if (lv('F8949.D.M14') === 855 && !L['F8949.A.M14'])
    pass(
      'meridian-corr',
      'investments',
      'Corrected Meridian 1099 fully applied (M6 wash, M9 basis, M14 term)',
      'F8949.D.M14',
      'D31 changes: M6 wash sale 735 to 512, M9 basis 6,900 to 4,880, M14 acquired 2024-09-15 (now long-term). All three appear in this version; D30 marked superseded.',
      ['ev-0755', 'ev-0781', 'ev-0823', 'ev-0828']
    );
  if (has('D74'))
    pass(
      'brightpath',
      'investments',
      'Brightpath 260 lots tie to the broker summary',
      'F8949.A.total',
      'Short-term covered: proceeds 139,615.96, basis 140,228.56, wash 1,326.05. Long-term: 195,112.56 / 198,071.70 / 1,580.24. Lot sums equal the summary to the cent; every lot\u2019s term agrees with its dates.',
      ['doc:D74#page1', 'doc:D74#page2']
    );
  return out;
}

/* ---------- tax effect of an adjustment (rates measured at the current version) ---------- */
// Estimates each adjustment's federal and California effects at the selected version's rates.
function effect(a, vk) {
  const R = IDX.versions[vk].tax_effect_rates;
  if (a.kind === 'fixed') return { fed: a.fed || 0, ca: a.ca || 0, fedPay: 0, caPay: 0 };
  if (a.kind === 'payment') return { fed: 0, ca: 0, fedPay: a.fedPay || 0, caPay: a.caPay || 0 };
  if (a.kind === 'data') return { fed: 0, ca: 0, fedPay: 0, caPay: 0 };
  const fed = Math.round(a.amount * (R[a.cat]?.federal_per_dollar || 0));
  let ca;
  if (a.caCat === null) ca = 0;
  else if (a.caCat)
    ca = Math.round((a.caAmount ?? a.amount) * (R[a.caCat]?.california_per_dollar || 0));
  else ca = Math.round(a.amount * (R[a.cat]?.california_per_dollar || 0));
  return { fed, ca, fedPay: 0, caPay: 0 };
}
