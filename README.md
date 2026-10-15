# Redesign the Tax Workpaper

A browser-based tax workpaper prototype for the fictional Okafor-Lindqvist household's 2025 return.

## Try it

**Live demo:** [miraflroesai.vercel.app](https://miraflroesai.vercel.app/)

## Run locally

1. Download or clone this repository.
2. Open a terminal in the project folder.
3. Start a local web server:

   ```bash
   python -m http.server 8000
   ```

   On Windows, use `py -m http.server 8000` if `python` is not recognized.

4. Open [http://localhost:8000](http://localhost:8000).

Keep the terminal open while using the app. Do not open `index.html` directly; the app needs the local server to load its data.

## The idea

A workpaper is a proof, not a spreadsheet. Every number should have a source, a derivation, and a verification. Click a return line to trace it through its inputs to the source field, and see where the value landed.

![Workpaper overview](docs/screenshots/overview.png)

## What you can explore

- Trace return numbers to source documents and their highlighted fields.
- Review independent checks, findings, adjustments, and undo.
- Reconcile broker sales, books-to-tax, and California part-year income.
- Explore review sign-offs, role-based access, client approval, e-file, and notice response.

The packet data is fictional. Changes are saved in browser storage on your device and sync between tabs on that device; they are not shared with other people.

To reset the demo, act as **Jo Kimura (firm administrator)**, open **Standards, access, time**, and choose **Clear this device’s workpaper ledger**.

## Notes

- This is a prototype with no install or build step.
- The tax engine cannot be rerun. Tax effects use its marginal rates, so adjusted downstream totals are estimates.
- Source pages are simulated. The trace is designed so a real page-image renderer can replace them later.
- More detail: [core idea and data model](docs/1-core-idea-and-data-model.md) and [errors found](docs/2-errors-found.md).

## How I used AI

I used Claude (Anthropic) as my main tool throughout. I directed the design and reviewed the output. Claude explored the packet, compared extracted values against printed pages, recomputed engine results, wrote most of the app, and tested it headlessly with Playwright through a full season. I verified the findings against the source documents before including them. I used Claude Code to fix bugs, format the code, and finalize the repo.
