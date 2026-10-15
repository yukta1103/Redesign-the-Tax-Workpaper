# Errors found and how the design surfaced them

Tax effects are on the balance due (positive means more owed), estimated at engine v3's per-dollar rates unless noted. Totals with every finding accepted: federal moves from **4,220 owed to about a 4,264 refund**; California refund moves from **8,256 to about 11,692**. These need an engine recompute before filing.

## Confident mistakes in the engine output or extraction

| # | Error | Evidence | How it surfaced | Federal | California |
|---|---|---|---|---|---|
| 1 | RSU lots N1, N3, N4 taxed at zero basis: 47,620 of income counted twice (already in W-2 wages) | D11 supplement gives adjusted basis 19,100 / 19,100 / 9,420 | Check matches every noncovered lot to the stock-plan supplement | -15,536 | -2,765 |
| 2 | Northlake sweep interest counted twice (1,840) | D29 says it is the sweep for account 7731, already on D28 | Interest grouped by underlying account, not by form | -640 | -127 |
| 3 | Swedish interest converted at the 2024 average rate (10.56) instead of 2025 (9.86) | Engine reference fx table | Every foreign-currency amount recomputed at its own year's rate | +43 | small |
| 4 | 1099-K 12,400 added on top of books revenue that already contains it | D15 p3: Paywell card payments deposited gross inside Atlas's 41,200 | Books deposits reconciled to every information return | -4,402 | -384 |
| 5 | Mileage log page 3 is a second scan of page 2: 11,800 miles claimed vs 8,100 | D23 p3 marked as second scan; trips identical | Trips summed, not page totals; tied to odometer | +919 | small |
| 6 | Family phone plan and home internet deducted at 100% | Call notes: 70% and 50% business | Client answers applied to the books line | +464 | small |
| 7 | Personal Spotify Family (216) in business software | D15 p1 and call notes | Transaction detail read behind each books line | +77 | small |
| 8 | Self-employed health insurance 14,400 deducted while Erik was eligible for Ngozi's employer plans | qa-25; 2024 preparer also took 0 | Month-by-month eligibility test | +4,464 | +605 |
| 9 | 11,000 HVAC replacement (new heat pump system) expensed as a repair | D47 invoice, permit | Large repairs classified against the invoice | +3,633 | +896 (engine what-if) |
| 10 | Lonestar payoff interest 2,150 added again though the 1098 includes it | D55 box 1 note, D56 | Lender statements read for what they already include | +559 | +103 |
| 11 | Home property tax includes the seller's 6,912 share | D54 seller credit 01/01-07/07 | Real estate tax allocated by days owned | about +1,462 (falls below SALT cap) | +332 |
| 12 | Donated car claimed at 6,000 (Kelley Blue Book) | D66 1098-C: sold for 2,900 | Vehicle gifts capped at charity's sale price | +806 | +149 |
| 13 | Q4 federal estimate taken as 4,000 from the client's memory | IRS transcript: 3,000 on 01/15/2026 | Every payment agreed to the transcript | +1,000 | |
| 14 | California 09/15/2025 payment (3,500) counted for 2025 | D68 and FTB account: designated tax year 2024 | Payments agreed to FTB by designated year | | +3,500 |
| 15 | Halvorsen wages after the move to Texas sourced to California (about 88,800) | D73 pay stub at 07/15; employer kept CA as work state by mistake (qa-45) | Wages sourced by work location using the pay stub at the move date | | -5,685 |
| 16 | Theo's SSN on the organizer is wrong (3309 vs 3390) | 2024 accepted return; D71 card | Identity numbers compared to prior-year filings before filing. In the packet this caused the e-file rejection; the prototype blocks e-file until it is fixed | 0 | 0 |
| 17 | Little Sprouts tax ID misread at 0.97 confidence (74-3829516 vs printed 74-3829156) | D62 page | Identifying numbers re-read against the printed page | 0 | 0 |
| 18 | Meridian page 32 never read: sale M18 missing (proceeds 250, loss 60) | D31 p32 | Broker summary tied to sum of lots; explains the 250 gap exactly | -21 | small |
| 19 | Form 2441 provider named "Bright Oak Preschool" | D61 is Bright Oak Kids Club | Provider names agreed to statements | 0 | 0 |

## Judgment calls surfaced (recorded with authority before filing)

- **Coinhaven lot C6:** engine used zero basis and a June 2025 date. Erik says it was bought 03/15/2021 for about 3,050 (bank statement line only). If accepted: long-term, gain 2,275 instead of 5,325 short-term (federal about -1,312).
- **SEP excess:** 18,000 contributed vs a 15,214 limit, lower after the Schedule C corrections. Withdraw the excess or pay the 6% excise (Form 5329).
- **St. Brigid gift:** receipt digit unreadable (confidence 0.41). 1,500 confirmed by phone and bank, but a written acknowledgment is still required.
- **California AMT on the ISO exercise** is not computed by the engine; the grant-to-exercise spread is largely California-source.
- **Filings outside the return:** FBAR 2025, Forms 1099-NEC for two contractors, and a 2023 Form 3520 for the Swedish inheritance the prior preparer left open.

## Client answers the documents contradict

- qa-14 "no investments sold" vs 282 brokerage sales and 12 crypto dispositions.
- qa-31 "no prior IRA basis" vs the 2024 Form 8606 and 5498 showing 7,000. Here the engine is right and the client is wrong; the design records it as a passed check.
- qa-41 Q4 estimate 4,000 vs 3,000 (error 13).
- Prior preparer used 300 sq ft for the home office; the room measures 220.

## Checks that agree with the engine

Twelve independent recomputations agree and become tick marks: W-2 totals (phone photo D10 matched to D09), excess social security, ISO AMT adjustment, S corporation basis roll with the late 2023 K-1, condo gain and depreciation, child tax credit phase-out, HSA contributions, Ridgeline capital account, the corrected Meridian 1099 (wash sale, basis and holding-period changes), and Brightpath's 260 lots tying to the cent.
