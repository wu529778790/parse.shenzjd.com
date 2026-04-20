# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ParseShort is a short video parsing and download service built with **Next.js 15** (App Router, React 19). It parses video links from 22+ Chinese social media platforms (Douyin, Bilibili, Kuaishou, Weibo, Xiaohongshu, etc.) and Twitter/X. The frontend is a single-page app; the backend is a collection of API route handlers.

## Commands

```bash
pnpm dev           # Dev server with Turbopack
pnpm build         # Production build
pnpm start         # Start production server
pnpm lint          # ESLint (next lint)
pnpm test          # Unit tests via Vitest (no network)
pnpm test:watch    # Vitest in watch mode
pnpm test:live     # Live integration tests (requires RUN_LIVE_PARSE=1 + URLs in .env.local)
```

Run a single test file: `pnpm vitest run tests/share.test.ts`

## Architecture

### Backend: Middleware + Per-Platform Parsers

All platform API routes (`src/app/api/{platform}/route.js`) follow the same pattern:

```
export const GET = createApiHandler(parseFunction)
```

`createApiHandler()` (in `src/lib/api-middleware.js`) wraps each parser with: optional Basic Auth, IP-based rate limiting (10 req/min), URL validation, SSRF protection, 5-minute in-memory cache, CORS, and error handling.

Platform parsers are standalone async functions (not classes). They typically: follow short URL redirects → fetch HTML with spoofed User-Agents → extract video IDs → parse embedded JSON (`window._ROUTER_DATA`, `__APOLLO_STATE__`, etc.) → return structured JSON. The Kuaishou parser (`src/lib/kuaishouCore.js`) is the exception — it's a class with multi-strategy parsing.

The unified endpoint `/api/parse` auto-detects the platform from a URL and dynamically imports the correct parser. It runs on Edge runtime. Most routes use Edge runtime; the Douyin route explicitly uses Node.js runtime for Docker compatibility.

The proxy route (`/api/proxy/route.ts`) forwards media requests with appropriate Referer/Cookie headers, with special handling for Bilibili and Douyin CDNs.

### Frontend: Single Page App

- `src/components/VideoParserForm.tsx` — Main form: auto-reads clipboard, extracts URLs with debounce, auto-detects platform, caches results in sessionStorage
- `src/components/videos/` — Platform-specific result display components, barrel-exported from `index.ts`
- `src/utils/share.ts` — URL extraction from Chinese social media share text, platform detection
- `src/config/video-platforms.ts` — Platform metadata (name, color, emoji) for UI
- `src/lib/platforms.js` — Platform registry with domain mapping (used server-side)

### Key Lib Files

- `src/lib/parser-core.js` — BaseParser class + ParserRegistry (not universally used by all parsers)
- `src/lib/api-utils.js` — Cache, rate-limit, SSRF protection, response helpers
- `src/lib/redirect-location.js` — Follow 3xx redirects for short URLs
- `src/lib/meipai-decode.js` — Meipai video base64 decode algorithm

## Environment Variables

Configure in `.env.local` for full functionality:

- `DOUYIN_COOKIE`, `DOUYIN_USER_AGENT` — Douyin parsing
- `BILIBILI_COOKIE` — Bilibili parsing
- `WEIBO_COOKIE` — Weibo parsing
- `API_AUTH_USERNAME`, `API_AUTH_PASSWORD` — Optional Basic Auth for API
- `LIVE_URL_*` (23 variables) — Real share URLs for live tests (see `tests/live/urls.example.env`)

## Conventions

- **Mixed JS/TS**: Core lib files are plain JS (`src/lib/*.js`), API routes are JS, components are TSX, types in `src/types/`
- **Path alias**: `@/*` maps to `./src/*` (configured in tsconfig + vitest)
- **pnpm** is the package manager
- Test files use `@ts-nocheck` for flexibility
- API response format: `{ code: 200, msg: "...", data: {...}, platform: "..." }`

## Deployment

Three targets: Vercel (one-click), Cloudflare Workers (`wrangler.toml`), Docker (GHCR + Docker Hub via GitHub Actions). The Docker CI workflow runs unit tests before building.
