# Core idea and data model

## The idea: a workpaper is a proof, not a spreadsheet

Every number on the return is a claim. A claim is proven when it has three things: a **source** (a field on a page, an agency record, a client answer), a **derivation** (the engine rule and its inputs), and a **verification** (a tick mark recording who checked it, how, and against what). The workpaper's job is to show, at a glance, which claims are proven, which are not, and exactly what still blocks filing.

So the primary screen is not a grid of numbers. It asks "Is this return right?" and answers with the totals, the open findings, the filing gate and the state of each area. Every number is clickable: one click shows how it was built, the next shows the page it was read from with the field highlighted. Tick marks (agreed to source, recalculated, confirmed with client, agreed to prior year, agreed to IRS/FTB record) borrow the auditor's oldest visual language, so a 20-year CPA reads them instantly and a new hire learns them from the legend.

## The data model

**1. Evidence (immutable).** The packet as delivered: documents and pages, ~3,000 extracted values with confidence and position, three engine versions, client answers, prior years, agency records. Never edited. A season clock replays when each item arrived, so the workpaper can be viewed as it stood on any date.

**2. The ledger (append-only).** Everything the firm does is an event: adjustment proposed or approved or reversed, verification, review note, question and answer, document disposition, variance explanation, judgment, sign-off, assignment, time entry, unmasked view, standards change, filing step, undo. Each event carries actor, real timestamp and season date. The current workpaper is a fold over the ledger. Nothing is overwritten: an adjustment keeps the engine value, who, why, the authority, and its federal and California tax effect. Undo is itself an event. A filed return is a frozen snapshot plus fingerprint; an amendment is a new layer on top.

**3. One graph, three node types.** Evidence nodes (a document page and field position), Line nodes (engine output with rule, inputs, sources), Act nodes (ledger events pointing at evidence or lines). Tracing walks down the graph to the page; impact analysis walks up ("flows into"). Any document shows everywhere it landed, or the recorded reason it did not.

**4. Sign-offs that know what they signed.** A sign-off stores a hash of the lines and adjustments beneath it. If anything under it changes (a new engine version, an accepted finding, a reversal), the sign-off shows as reopened automatically. Reviewers cannot sign areas where they prepared work.

**5. Independent checks.** A layer of checks recomputes from evidence and does not trust the engine. When a check agrees, it adds a tick mark. When it disagrees, it raises a finding with the engine's version, the evidence, the proposed adjustment and its tax effect. Findings feed the filing gate.

**6. Source adapter.** Documents are reached only through `pages(docId)` and `locate(valueId) -> {page, bbox, text}`. Today it renders the printed content as a simulated page with the field highlighted and a page map. Real page images replace the renderer without touching tracing.

## Key tradeoffs

- **Tax effects are estimates.** The engine cannot be rerun, so effects use the version's per-dollar rates (or the engine's own what-if when one exists). The UI says so, and flags where a change crosses a threshold (the SALT cap). Downstream lines are not recomputed.
- **Single file, no build step.** Vanilla JS with the packet embedded, so it loads the packet exactly as delivered from one link. The cost is less structure than a framework would give.
- **Storage.** The ledger uses the artifact's shared database when the viewer grants it (several people, live), and falls back to device storage with live sync across browser tabs. The shared path is implemented but was only tested in fallback mode.
- **Checks are specific to this packet's failure patterns** (duplicate pages, double-reported income, wrong-year FX, wrong-year payments). A production version would generalize each into a rule library.

## How AI was used

Claude (Anthropic) was used throughout: exploring the packet with Python, hunting for errors by comparing extracted values against printed content and recomputing engine results, writing the app, and testing it headlessly with Playwright through a full season (findings, partner approval, sign-offs, client signature, e-file, freeze, notice). Every finding was checked against the source pages by script before it went into the app.
