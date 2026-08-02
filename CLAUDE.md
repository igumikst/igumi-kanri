# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start Vite dev server (frontend)
npm run build     # Production build
npm run lint      # ESLint check
npm run preview   # Preview production build locally
```

There are no tests. The `api/` directory has its own `package.json` (`igumi-api`) — run `npm install` inside it separately if needed for local API work.

## Architecture

This is a **React 19 + Vite SPA** deployed on Vercel, backed by **Supabase** as the primary database/storage. The app is a construction project management system (案件管理) for 株式会社IGUMI.

### Routing

There is **no React Router**. Navigation is a `page` state string in `App.jsx`, toggled via a `nav(pageName)` function passed as a prop to every page component. All page components live in `src/pages/`.

### State management

All global state (projects, companies, tasks, files, settings, etc.) is owned by `App.jsx` and fetched once on mount via `loadAll()`. State and setters are drilled down as props — there is no context, Redux, or Zustand.

### Data layer

Supabase tables used:
- `projects` — construction jobs (案件)
- `companies` — clients and subcontractors
- `tasks` — task checklist items
- `finance_files` / `finance_folders` — document storage
- `home_settings` — key-value store for app config (passwords, LINE settings, AI personas, etc.)
- `links` — launcher bookmarks
- `template_files` — notification/document templates
- `board_posts` / `board_comments` — internal bulletin board
- `calls` — incoming phone call records (created by Twilio webhook)

### Components

- `src/components/UI.jsx` — primitive UI components: `Badge`, `Inp`, `Sel`, `Modal`, `Hdr`, `Confirm`. All inline-styled; no CSS framework.
- `src/components/Layout.jsx` — layout shells: `PCSidebar`, `PCRightPanel`, `FloatLauncher`, `usePCLayout`. PC/mobile detection is `window.innerWidth >= 768`.
- `src/components/AiAssistModal.jsx` — chat modal for AI mentor/review modes (mentor vs. review × report vs. estimate).
- `src/lib/constants.js` — all app-wide constants: statuses, status styles, default configs, tile layout, utility formatters (`fmt`, `pct`).
- `src/lib/supabase.js` — single exported Supabase client.

### API (Vercel Serverless Functions)

`api/` contains Node.js serverless functions in **CommonJS** format (not ESM). These handle:
- `recording.js` / `recording-proxy.js` — Twilio voice call recording
- `transcribe.js` — speech-to-text via OpenAI Whisper
- `analyze.js` — call transcript analysis via **Claude** (Anthropic API), Supabase registration, and LINE push notification
- `chat.js` — proxy to OpenAI Chat Completions (used by AiAssistModal)
- `voice.js` — Twilio TwiML response
- `pipeline.js` — orchestrates voice → transcribe → analyze flow
- `linegroup.js` — LINE group messaging
- `auto-edit.js` — AI-powered app code modification feature
- `blog-feed.js` — RSS/blog fetch proxy (CORS workaround)

### Environment variables

Frontend (`.env`, prefixed `VITE_`):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Backend API (Vercel env vars, no `VITE_` prefix):
- `OPENAI_API_KEY` — Chat and Whisper
- `ANTHROPIC_API_KEY` — Claude API (model: `claude-sonnet-4-6`)
- `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` — server-side Supabase access
- `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_USER_ID` — LINE push notifications

### Styling conventions

All styles are **inline JSX style objects** — no Tailwind, no CSS modules, no styled-components. Brand colors come from `DEFAULT_CUST` in constants: navy `#1A3A5C`, accent orange `#E07B39`, link blue `#2563EB`. The font stack is `'Hiragino Sans','Yu Gothic',sans-serif`.
