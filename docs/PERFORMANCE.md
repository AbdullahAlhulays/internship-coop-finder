# Website performance

Performance measurements below use the local production build.

## What changed

- The application shell no longer imports the opportunity dataset, company
  overviews, public-page analytics, or opportunity polling when opening Build CV.
  `PublicApp.jsx` owns those features; company and information pages are lazy.
- Hover, keyboard focus, and touch prepare destination code and inert HTML.
  After a page is usable, idle time warms the other primary page's code. Save Data
  and slow 2G connections skip speculative loading. PDF code remains download-only.
- Supporting browsers may prepare a separate CV dashboard document on intent.
  It renders only the shared shell until activation: it cannot read the resume
  store, write theme preferences, or mount the editor early. Public pages are
  never prerendered from the CV workspace. Other browsers use normal prefetch.
- Crossing between public pages and CV still creates a fresh document, removing
  previously executing third-party scripts. Public imports in the CV idle loader
  only evaluate module definitions; they do not mount analytics, start polling,
  or run the HTML advertising script.
- Client routes retain the current page while a requested lazy route loads,
  with a small progress indicator. Theme and language are applied before paint.
- Company names sort once per data/status update. Searches filter that ordering;
  deadline sorting is applied only when requested. Number/date/month formatters
  and the last-updated display are reused instead of reconstructed per card or key.
- Closed CV sections mount their controls on first use and retain drafts after
  closing. A mobile preview does not repeatedly measure hidden pages. Title-only
  edits do not rebuild document blocks. Font loading still triggers pagination.
- Gallery previews have WebP sources, PNG fallback, asynchronous decoding, fixed
  dimensions, and lazy loading after the first image.

## Measured payload changes

Uncompressed local production JavaScript needed to display an empty CV dashboard
dropped from **587,739 bytes to approximately 269 KB**, about **54% less**. The
original 538 KB main bundle became a roughly 218 KB shell, a 210 KB public route,
and independent detail/CV chunks. These are transferred compressed when hosting
provides compression; the figures here compare decoded sizes consistently.

The three gallery PNGs total **1,102,369 bytes**. Their WebP counterparts total
**464,756 bytes**, about **58% less**, at the same 1191 x 1684 dimensions. PNGs
remain available for browsers without WebP support.

Timing measurements are local diagnostics, not a production speed guarantee.
They vary with host load, cache state, browser prerender settings, and network.
A first visit directly to CV defers public-page data until it is needed or warmed
in idle time; the first immediate trip to Opportunities can still need that data.

## Checks and reproduction

With the Vite dev server running, `npm run test:navigation` covers filters, city
selection, deadline sorting, applied-state persistence, company routes, browser
back, theme and resume persistence, Arabic/mobile layout, WebP loading, public
script isolation, and zero resume-store reads before prerender activation.

`npm run test:cv` covers editing, storage failure/recovery, all template PDFs,
Arabic text, long-document pagination, keyboard behavior, and mobile previews.
`npm run build` and `npm run check:seo` validate the local output and static pages.

For production-output navigation diagnostics, start the local preview on port
4173, then run `npm run perf:measure -- <label>`. The script records three runs
with 4x CPU slowdown, 40 ms network latency, 1.6 Mbps download, browser cache
enabled, and a 200 ms pointer dwell before navigation. Advertising/analytics
URLs are blocked through CDP so test routing does not disable the browser cache.
JSON reports are kept in ignored `tmp/performance/`.

The private document preparation follows Chrome's
[prerender activation guidance](https://developer.chrome.com/docs/web-platform/prerender-pages).
