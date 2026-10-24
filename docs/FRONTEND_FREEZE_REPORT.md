# VIBETIX frontend freeze assessment

Date: 2026-10-14. Scope: hardening the existing frontend simulation; no new product features or redesign.

## Freeze decision

**The frontend is technically stable enough to begin backend integration, but the requested final visual freeze is NOT ready for unconditional sign-off.** The original reference screenshots were not present: both supplied attachments contain text briefs, and the attachment inventory contains no reference image files. Exact comparison of Event, Seats, Checkout and Confirmation against the primary visual source of truth therefore remains blocked. Attach those images to complete that final comparison and resolve any differences before visual sign-off.

All executed functional regressions now have passing results. Remaining mobile startup blocking is measured and documented below; the small optimization did not eliminate it. WebKit and real-device/assistive-technology coverage remain unverified. This verdict applies only to a browser simulation. **The complete ticketing system is not production-ready.** Backend and infrastructure work can proceed while reference sign-off is pending.

## Visual fidelity and composition

Inspected current screenshots of Event, Seats, Extras, Review, Checkout, Confirmation and Tickets at all thirteen requested widths in Chromium and Firefox. Inspected Events, Artists, Venues and the empty Favorites composition at 1440, 834 and 390px in both engines; populated Favorites is also exercised by the journey test. Reviewed full desktop Event/Checkout and mobile Seats/Checkout/Confirmation captures, in addition to matrix contact sheets. These are reviews of the implemented composition, not comparisons against absent originals.

The review checked container alignment, hero height/crop, heading hierarchy, content density, card proportions, column/sidebar relationships, arena prominence, controls, digital tickets and desktop-to-mobile stacking. Desktop preserves the large hero, four tier cards and booking sidebars. Tablet layouts stack booking panels. Mobile preserves readable form fields and six-column seat rows; the arena has its own horizontal scroll area and swipe hint. No new composition defect justified a redesign. Exact reference values for typography, spacing, radius, borders, glow and proportions remain unverified.

Changes in this pass:

- Corrected event hero intrinsic dimensions: ECHOES 1600×900, other campaign heroes 1280×720; mobile sources explicitly reserve 768×960. Artist detail images use 640×426 and venue detail/discovery images use 768×512. Existing CSS crops and hierarchy are preserved.
- Made the skip-link destination focusable with `tabIndex={-1}`. Previously the link scrolled without transferring keyboard focus in both engines.
- Strengthened the existing search focus indicator with a two-pixel outline around the form. Escape retains input focus; moving focus outside dismisses suggestions.
- Preserved the offscreen arena preview's SVG shell, title, description, legend and dimensions while deferring its drawing until within 300px of the viewport. No layout jump was observed; an explicit regression checks equal height before/after drawing.

Evidence: `artifacts/freeze/{chromium,firefox}/responsive/` (182 captures), discovery captures (24), `vibetix-freeze-{chromium,firefox}-{0,1,2}.png` contact sheets and `vibetix-discovery-{chromium,firefox}.png` under the same directory. Capture preparation scrolls and waits for actual image load before decoding; a full-page screenshot alone does not trigger lazy loading.

## Production performance before and after

Method: `scripts/measure-performance.mjs`, three fresh browser contexts per mode, production preview with compressed responses, no CPU profile, trace or simultaneous browser tests. Desktop: 1440×1000, unthrottled. Mobile: 390×844, DPR 3, 4× CPU slowdown, 150ms latency, 209,715 bytes/second download (the script's nominal 1.6Mbps setting). Each sample observes initial load plus three seconds. Blocking is the sum of `max(longTaskDuration - 50ms, 0)` in that window: it is **not Lighthouse TBT or INP**. Initial CLS is not session-wide CLS. No field or real-device performance claim is made.

| Sample                              | Desktop median LCP | Mobile median LCP | Desktop median blocking | Mobile median blocking | Initial CLS |
| ----------------------------------- | -----------------: | ----------------: | ----------------------: | ---------------------: | ----------- |
| Previous sprint, historical context |              588ms |            2192ms |                    67ms |                  524ms | 0           |
| Fresh baseline for this pass        |              848ms |            2332ms |                   110ms |                  606ms | 0           |
| Final production build              |              740ms |            2384ms |                   105ms |                  643ms | 0           |

Final desktop LCP runs: 816 / 708 / 740ms; blocking: 113 / 93 / 105ms. Final mobile LCP: 2432 / 2384 / 2316ms; blocking: 643 / 705 / 624ms. All six initial CLS samples were zero. Evidence: `artifacts/freeze/baseline-metrics.json`, `final-metrics.json`; historical figures remain in `docs/SPRINT_REPORT.md`.

**The overall before/after samples do not demonstrate a mobile improvement.** Mobile median LCP rose 52ms and blocking rose 37ms. Small samples and host variability prevent attributing this difference confidently. An earlier post-change batch also had higher blocking (median 656ms); it was not discarded to claim a speedup. No claim is made that the historical 2.19s result was preserved.

To isolate the arena change, a separate alternating A/B experiment served two otherwise identical production variants, four fresh mobile contexts each. Eager preview blocking was 736 / 690 / 747 / 649ms (median **713ms**); deferred was 665 / 669 / 724 / 663ms (median **667ms**), a **46ms / 6.5%** reduction. Median LCP was 2444ms eager versus 2492ms deferred: no LCP benefit. Initial DOM fell from 547 to 401 nodes, SVG descendants from 247 to 101. This modest isolated result supports retaining the offscreen reduction; it does not establish an overall startup win. Evidence: `artifacts/freeze/svg-ab.json` and saved diagnostic scripts.

## Mobile blocking diagnosis

Used Chrome DevTools Protocol production CPU sampling, timeline tracing and hidden diagnostic source maps, with Rollup module attribution. The final shipping build has no source maps. Instrumented timings are diagnostic and are not substituted for the untraced measurements above.

| Area inspected            | Evidence and conclusion                                                                                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Initial JS execution      | A baseline module evaluation task took about 367ms at 4× CPU slowdown. Runtime evaluation is a substantial startup cost.                                                                                                                                                               |
| First React render/commit | A React scheduler task took about 336ms, including element creation, hooks, DOM properties and layout. Across the sampled trace, FunctionCall totals were about 399ms. Timings overlap and must not be added together.                                                                 |
| Hydration                 | The app calls `createRoot`, not `hydrateRoot`; there is no SSR hydration phase. This is client initialization and rendering.                                                                                                                                                           |
| Route initialization      | Router creation was sampled at about 6.6ms self time; route resolution also appears in the profile. React/router dominate shipped runtime weight; route setup alone does not explain the blocking.                                                                                     |
| Zustand/localStorage      | Synchronous reads are present, approximately 5.5ms sampled `getItem` self time. No storage loop or dominant hydration cost was found on this clean entry sample. Stored history size remains a future real-data concern.                                                               |
| SVG arena                 | Deferring the below-fold preview removes 146 initial nodes. Trace layout totals fell from about 213 to 172ms and style updates from 103 to 62ms in the diagnostic samples; isolated A/B blocking improved modestly as above. The interactive seat route was not deferred while in use. |
| Date formatting           | Repeated formatter construction appeared at about 26ms sampled self time. Added a bounded 32-entry formatter cache keyed by timezone and display kind. Existing currency reuse remains. No independent end-to-end speedup is attributed to this cache.                                 |
| CSS                       | Baseline stylesheet parsing was about 6.5ms; style/layout cost was greater. Restricted Tailwind automatic source scanning to `src`, removing utilities accidentally derived from documentation/tests/artifacts and preventing report-generated CSS drift.                              |
| Fonts                     | System font stack; zero font resource requests in the sampled navigation. No remote font bottleneck.                                                                                                                                                                                   |
| Image decoding            | About 32ms aggregate diagnostic decode time, much smaller than JS/render work. Hero remains eager/high-priority with a real mobile variant.                                                                                                                                            |
| Search                    | Local catalog of nine events, local 160ms debounce, no startup network service or heavy index. No dominant search task appeared.                                                                                                                                                       |
| Seat updates/timer        | Both engines: 144 instrumented nodes, only one seat node changes on selection, zero arena/picker/seat render changes during active timer ticks. Summary changes are outside that count.                                                                                                |

Evidence: `artifacts/freeze/{baseline,deferred}-trace.json`, `.cpuprofile`, `*-profile-summary.json`, `*-modules.json`. CPU sample self times are estimates. The remaining work is dominated by initial runtime/render cost, not solved by image conversion or font preloads. Further SSR/runtime replacement or large routing changes would exceed this hardening pass; measure real mobile interactions and startup again during integration.

## Bundle review

Final entry: **368,705 bytes raw / 118,897 gzip JS** and **64,437 / 14,270 gzip CSS**. Regression budgets of 150,000 gzip JS and 20,000 gzip CSS pass. Relative to the historical sprint entry, JS grew 325 gzip bytes while CSS shrank 77 gzip bytes. No primary LCP content was lazy-loaded.

Rollup's largest rendered module sizes before final minification were ReactDOM client approximately 644.6 KB, React Router 227.2 KB, React 19.2 KB and Scheduler 11.1 KB. Application examples: arena preview 8.8 KB, booking store 7.8 KB and hero 7.1 KB. These attribution sizes are not compressed transfer sizes and cannot be compared directly with the final chunk bytes.

Production module inventory showed one React/ReactDOM runtime, with named tree-shaken icon imports. The router's package export path contains `dist/development`; that directory label alone is not evidence that React's development runtime shipped. The traced ReactDOM source is explicitly `react-dom-client.production.js`.

Seats, Extras, Review, Checkout, Confirmation, Tickets, Order, Discovery, detail and informational routes already use route-level lazy loading. Checkout/form validation, order parsing and QR generation stay in their lazy chunks; QR is in the roughly 30.3 KB raw TicketActions chunk, checkout about 50.1 KB, order validation/store about 89.5 KB. No additional fragmentation was justified. All declared runtime dependencies have live consumers; Sharp/build/test tooling remains development-only. No confirmed unused dependency or duplicate runtime was removed. `npm ls --all` traverses development requirements inside the existing pnpm installation and reports mismatched development versions; bundle attribution, rather than that output, establishes shipped runtime duplication.

Evidence: `artifacts/bundle-audit.json`, `artifacts/freeze/final-build.log`, diagnostic module inventories. Rollup reports two nonfatal Zod annotation-position warnings; it removes those comments and completes the build.

## Image and cleanup findings

`npm run images:audit`: **20 WebPs, 1,136,344 bytes, zero findings**. All production rasters are referenced, uniquely hashed and below the 250 KB per-image review budget. No production PNG/JPEG or unused image was found. SVG UI/maps and generated QR vectors remain vector. Source photography and QA screenshots remain under ignored artifacts and are not shipped.

The primary hero retains high fetch priority, responsive mobile selection and explicit dimensions. Discovery cards and extras use lazy loading; immediately visible detail/review images remain eager. Corrected intrinsic attributes are listed above. No image re-encoding was necessary. No production temporary image, obsolete component, stale TODO/FIXME, debugger or application console logging was found. No speculative dependency removal or cosmetic refactor was performed. Tailwind source scoping removes unintended generated CSS. Test source type checking now runs with the application type check; an optional mock order ID is explicitly typed as string instead of accidentally inferred as a UUID template literal.

## Responsive, accessibility and browser verification

All requested widths passed: **1920, 1600, 1440, 1366, 1280, 1024, 834, 768, 430, 412, 390, 375, 360**. Seven main screens per width, in both engines. Document width checks passed and actual composition contact sheets were inspected. Arena overflow is intentionally local to its labeled scroll region, with mobile controls staying within the viewport. Sticky booking panels, grids, search/header layout, form stacking and digital tickets remained usable in the captured states.

Automated axe results: zero violations for 21 major-screen/viewport combinations plus 12 discovery combinations **per browser** in development; the 21 major combinations per browser were rerun against production after the focus fixes and also had zero violations. Tags: WCAG 2 A/AA and 2.1 AA. This is automated coverage, not a conformance certification.

Keyboard scenarios verify skip-link focus transfer, visible search focus, ArrowDown/Enter/Escape search behavior, focus-leave dismissal, mobile navigation activation, arena section Space activation and row filtering without selecting a seat. Checkout validation messages and retained labels are exercised by the actual journey. Reduced-motion emulation confirms disabled smooth scrolling and transitions. The product contains no custom modal/dialog, so no dialog focus trap or native payment dialog coverage is claimed. Print media hides navigation/actions while retaining digital tickets; this does not verify a physical printer or OS print dialog. Chromium clipboard contents are read back; Firefox checks successful copy feedback or its visible event-link fallback because equivalent clipboard permission automation is unavailable.

| Check                          | Executed result                                                                                               | Evidence                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Typecheck                      | Passed, including test files                                                                                  | `npm run typecheck`; `tsconfig.tests.json`                                                                        |
| Unit tests                     | 13 passed, two files                                                                                          | `npm test`                                                                                                        |
| Formatting                     | Passed                                                                                                        | `npm run format:check`                                                                                            |
| Production build               | Passed; zero `.map` files in `dist`                                                                           | `artifacts/freeze/final-build.log`                                                                                |
| Chromium 156, Linux            | All 32 distinct development cases have passing results after corrections; 15 targeted production cases passed | Development ledger and production JSON below                                                                      |
| Playwright Firefox 157, Linux  | Same 32 distinct development cases and 15 production cases passed                                             | Same evidence, browser-specific records                                                                           |
| WebKit                         | **Not executed**                                                                                              | Bounded 180-second installer attempt timed out at about 30% of the 103.1 MiB download; no usable engine installed |
| Browser runtime/console errors | None in passing scenarios                                                                                     | Automatic fixture asserts no page errors or console errors                                                        |

Development evidence: `artifacts/freeze/verified-case-ledger.json`, `initial-cross-browser-results.json`, `corrected-cross-browser-results.json`, `keyboard-results.json`. The initial 62-case run passed 51 and failed 11: six discovery captures had a test variable error and five Firefox mobile captures decoded lazy images before load. Corrected screenshot preparation and the missing fixture binding were rerun: all 16 selected cases passed. The new keyboard test first exposed the skip target/focus-indicator issues; its final two-browser run passed. **64 distinct green cases are assembled from these runs, not presented as one uninterrupted 64-case run.**

Production evidence: `artifacts/freeze/production-regression-results.json` (28/28) and `production-journey-results.json` (2/2). The full journey explicitly executes Event → section → exact seats → Extras → Review → Checkout → promo → simulated payment → Confirmation → My Tickets → Order Details, including refresh persistence and invalid-email correction. Other passing cases cover history, saved/active expiry, invalid checkout/event/order/404, favorites, current-input search, blocked storage, six-seat limit, unavailable seats, cancellation on checkout unmount, calendar download, copy link and print styles.

## Known frontend limitations and backend dependencies

Reference visual sign-off is outstanding. WebKit/Safari, physical iOS/Android, screen-reader sessions, actual printing, Lighthouse scores, INP and field percentiles were not verified. Mobile startup blocking remains material. Frontend route transitions do not provide a comprehensive screen-reader focus/announcement system beyond the checked skip link and control interactions. Browser storage has finite capacity and is not a durable order system. Tour previews without supplied URLs remain visibly disabled. Asset source originals are ignored development files and must be retained separately for future regeneration.

Backend work remains the next major engineering effort: authoritative catalog/pricing/tax quotes, atomic inventory and holds, identity and order ownership, PostgreSQL migrations and constraints, provider payments and idempotency, signed webhooks/reconciliation, ticket issuance/revocation/check-in, email delivery, refunds, secret management, deployment/TLS/CDN routing, security headers, telemetry, backups/restore and load testing. Client prices, holds, QR payloads and stored orders are forgeable simulation state. No real money, reservation, email or valid admission is produced. See `PRODUCTION_READINESS.md` for the detailed dependency sequence.

## Reproduce the checks

Use the installed project package manager (`pnpm`; equivalent npm scripts were executed here). Run `typecheck`, `test`, `format:check`, `build`, `build:audit` and `images:audit`. Default `test:e2e` owns a development server with render instrumentation. For both installed engines in this environment:

```sh
CI=true PLAYWRIGHT_BROWSERS_PATH=/tmp/vibetix-freeze-browsers QA_ALL_BROWSERS=true QA_CHROMIUM_EXECUTABLE=/tmp/vibetix-browser/chrome-linux64/chrome pnpm exec playwright test --project=chromium --project=firefox
```

For production, start `pnpm preview --host 127.0.0.1 --port 5190`, set `QA_BASE_URL=http://127.0.0.1:5190`, and run journey/resilience/accessibility files plus the `automated accessibility` cases from responsive tests. Do not run the development render-counter assertion against an uninstrumented production build. For idle lab measurements, use the same base URL (with trailing slash), Chromium executable and `pnpm performance:measure`. Session browser paths are temporary; install the corresponding Playwright engines on another machine.
