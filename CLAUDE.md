# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ParseShort is a short video parsing and download service built with **Next.js 15** (App Router, React 19). It parses video links from 22+ Chinese social media platforms (Douyin, Bilibili, Kuaishou, Weibo, Xiaohongshu, etc.) and Twitter/X. The frontend is a single-page app; the backend is a collection of API route handlers.

## Commands

```bash
npm run dev       # Dev server with Turbopack
npm run build     # Production build
npm start         # Start production server
npm run lint      # ESLint (next lint)
npm test          # Unit tests via Vitest (no network)
npm run test:watch # Vitest in watch mode
npm run test:live  # Live integration tests (requires RUN_LIVE_PARSE=1 + URLs in .env)
```

Run a single test file: `npx vitest run tests/share.test.ts`

## Architecture

### Backend: Middleware + Parser Modules in lib

Platform parsers live as pure async functions in `src/lib/parsers/{platform}.js` (default export, no HTTP boundary). Each platform API route (`src/app/api/{platform}/route.js`) is a thin wrapper around one:

```
import douyin from "@/lib/parsers/douyin";
export const GET = createApiHandler(douyin);
```

Platform routes are **externally blocked** — `createApiHandler()` (in `src/lib/api-middleware.ts`) returns 403 for every route in its `ROUTE_DOMAIN_MAP` except `/api/parse`; they exist as shells for possible future re-exposure. The unified entry `/api/parse` does NOT forward over HTTP: it resolves parsers via `getPlatformParser()` (`src/lib/platformRoutes.js`, lazy `import()` of the lib modules) and calls the function directly. Never reintroduce an internal-forwarding marker header — a client-forgeable header (`x-parse-internal`) once bypassed auth/quota/analytics.

`createApiHandler()` wraps the unified entry with: WeChat auth guard (wxauth-token cookie / Bearer → remote check via wx-auth, 10-min per-token cache), IP-based rate limiting (60 req/min, in-memory), URL validation, SSRF protection, honeypot for blacklisted IPs, CORS, and error handling. Parsing is free and unlimited — there is no quota or billing gate (both the old free-quota/ad-unlock gate and the short-lived wx-auth points billing were removed); do not reintroduce one. `/api/parse` passes `sharedCache` — a 24-hour result cache (`src/lib/result-cache.js`; Cloudflare Cache API on Workers, in-memory Map fallback on Node) storing the normalized result; on hit it probes the direct URL and re-parses when the cached link is definitively dead (404/410). Note the in-memory Map (max 5000, LRU) **is the production path** — the site runs on Docker/Node, where `caches` does not exist — and the probe is memoized 60s per direct URL with a 1.2s budget, because it is a synchronous outbound call on the cache-hit path (logs showed cache hits averaging 752ms / peaking at 5s, across only 56 distinct URLs for 232 hits). All routes run on Node.js runtime.

Server-to-server calls to wx-auth (auth `check`/`userinfo`) go through `src/lib/wx-auth-endpoint.ts`, never `fetch` directly. Both containers live on the same host: the internal outlet (`WXAUTH_API_BASE=http://host.docker.internal:6702`, wx-auth's `6702` is bound to loopback + the docker0 gateway) is milliseconds, while the public domain round-trips through Cloudflare and intermittently hit the 5s timeout — which fail-closed the guard and rejected already-authenticated users with 401. The module resolves a comma-separated outlet list (`WX_AUTH_API_BASE` is accepted for parity with panhub), auto-appends the public outlet when only internal ones are configured, trips a 60s circuit breaker after 3 connection-level failures per outlet, and retries idempotent calls across outlets. Do not "simplify" it back to a single `fetch` on the public domain.

Analytics (`src/lib/analytics.js`) buffers parse events in memory and batch-flushes them to Turso (20 events or 30s, one pipeline request); `queryStats()` caches its full-table aggregation for 5 minutes — do not reintroduce per-request DB writes/reads.

Platform parsers are standalone async functions (not classes). They typically: follow short URL redirects → fetch HTML with spoofed User-Agents → extract video IDs → parse embedded JSON (`window._ROUTER_DATA`, `__APOLLO_STATE__`, etc.) → return structured JSON. Several keep module-level state for anonymous-cookie reuse (Douyin `ttwidCache`, Bilibili `anonCookieCache`, Weibo visitor cookie), persisted in the Turso `kv_store` table when configured. The Kuaishou core (`src/lib/kuaishouCore.js`) is a class with multi-strategy parsing.

User-Agent choice is load-bearing, not cosmetic — both platforms below break on desktop UA from a logged-out datacenter IP:
- **Xiaohongshu** (`src/lib/parsers/xhs.js`): the note page 302s to `/login?redirectPath=...` for desktop Chrome/Edge UA, but returns the full `__INITIAL_STATE__` for an iPhone Safari UA. Keep the mobile UA; optional `XHS_COOKIE` is only an extra.
- **Kuaishou** (`src/lib/kuaishouCore.js`): `www.kuaishou.com/short-video/<id>` answers a mobile UA with a 63-byte anti-bot JSON (`{"result":2,...}`). Always fetch the mobile share page `https://m.gifshow.com/fw/photo/<id>` (its data is escaped JSON — `unescapeEmbeddedJson`) and prefer `.mp4` over the HLS `.m3u8` it also contains. Bilibili bangumi (`/bangumi/play/ep|ss<id>`) cannot use `/x/player/playurl` (returns `-404`); it needs the PGC endpoints (`/pgc/view/web/season` + `/pgc/player/web/playurl`).

### Frontend: Single Page App

- `src/components/VideoParserForm.tsx` — Main form: auto-reads clipboard, extracts URLs with debounce, auto-detects platform, caches results in sessionStorage
- `src/components/videos/` — Platform-specific result display components, barrel-exported from `index.ts`
- `src/utils/share.ts` — URL extraction from Chinese social media share text, platform detection
- `src/config/video-platforms.ts` — Platform metadata (name, color, emoji) for UI
- `src/lib/platforms.js` — Platform registry with domain mapping (used server-side)

### Key Lib Files

- `src/lib/api-utils.js` — Cache, rate-limit, SSRF protection, response helpers
- `src/lib/redirect-location.js` — Follow 3xx redirects for short URLs
- `src/lib/meipai-decode.js` — Meipai video base64 decode algorithm

## Environment Variables

Configure in `.env` for full functionality:

- `DOUYIN_COOKIE`, `DOUYIN_USER_AGENT` — Douyin parsing
- `WEIBO_COOKIE` — Weibo parsing
- `TURSO_DB_URL`, `TURSO_AUTH_TOKEN` — Turso (libsql) database for parse analytics; when unset, analytics is silently disabled
- `STATS_API_KEY` — Bearer key protecting `GET /api/stats`; when unset, the stats endpoint returns 403

## Conventions

- **Mixed JS/TS**: Core lib files are plain JS (`src/lib/*.js`), API routes are JS, components are TSX, types in `src/types/`
- **Path alias**: `@/*` maps to `./src/*` (configured in tsconfig + vitest)
- **npm** is the package manager
- Test files use `@ts-nocheck` for flexibility
- API response format: `{ code: 200, msg: "...", data: {...}, platform: "..." }`

## Deployment

Three targets: Vercel (one-click), Cloudflare Workers (`wrangler.toml`), Docker (GHCR + Docker Hub via GitHub Actions). The Docker CI workflow runs unit tests before building.
