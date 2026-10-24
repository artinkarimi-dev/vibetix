# VIBETIX // TICKET DROP LAB

## One-command setup (requires Node.js 20+; no npm install, Redis or database)

From the project root:

```bash
npm run demo
```

Open **http://127.0.0.1:5173/**. To use another port:

```bash
PORT=5180 npm run demo
```

Windows PowerShell: `$env:PORT=5180; npm run demo`

For a vertical 9:16 reel, click **حالت ضبط** in the header first: it hides the decorative introduction and keeps the run controls plus live dashboard on-screen. Click **شروع رقابت ۱۰۰۰ نفره**. There is a countdown, live request matrix, counters, live activity, exactly 10 seat assignments, and a final server-verified result. Ideal recording: capture the main window after clicking Start (~5–7 seconds). Click **بازنشانی** to return to the initial state. Use the re-run action to run a fresh simulation; each run uses a different random processing order.

## What is real / not real

- Actual server-side simulation: 1,000 separate async attempts initiated together, one authoritative inventory of 10, an atomic in-process decrement and an idempotent request ID per attempt. The backend calculates the decisions; the browser does **not** fake winners or counters.
- The SSE API streams a **shuffled, visually paced replay of the computed results**. It is not a wall-clock trace or 1,000 outbound HTTP connections. In the presentation, 1 dot represents 1 reservation attempt.
- `GET /api/demo/runs/:id` is a separate server result check used by the browser after completion.
- **This is a single-process, in-memory demo**. It does not benchmark throughput, prove multi-server safety, use payment networks or issue valid tickets. Every new demonstration begins with a separate fictional inventory. Do not publicly deploy this process without an authenticated/restricted endpoint, proper rate limits and HTTPS.
- For a real horizontally scaled system, issue short-lived holds using an atomic guarded database transaction (e.g. PostgreSQL `UPDATE ... SET remaining = remaining - 1 WHERE remaining > 0 RETURNING ...`), durable booking and idempotency keys, transactionally recorded payment state, expiry/release handling, shared abuse limits and operational monitoring. The **original project's** Fastify/Prisma/Postgres/Redis backend remains separately under `backend/`.

## Test the demo API and invariants

```bash
npm run demo:test
```

Tests run without third-party packages. They verify 20 independent races of 1,000 buyers, idempotent retry, seat uniqueness, API origin rejection, SSE delivery and server state confirmation.

## Why does `pnpm dev` report `ECONNREFUSED 127.0.0.1:3001`?

The original Vite interface expects the original Fastify backend at port 3001 and PostgreSQL / Redis. Launching only Vite does not start these services; `/api/v1/catalog` therefore fails. Follow the root `README.md` for the **full-stack** infrastructure (`pnpm install`, `pnpm local:up` with Docker Compose or the native API/DB/worker workflow). For this recording, use `npm run demo` instead: it serves its own frontend + API on port 5173 and needs none of those dependencies. **Do not run both on port 5173 simultaneously.**

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Responsive and animation-ready dashboard |
| `/api/demo/health` | API health |
| `POST /api/demo/runs` | Compute fresh 1,000-vs-10 atomic reservation race |
| `/api/demo/runs/:id/events` | SSE stream of paced visual replay |
| `/api/demo/runs/:id` | Server-side result summary |

All payment and branding elements are fictional showcase material. The service binds to `127.0.0.1` by default to limit exposure.
