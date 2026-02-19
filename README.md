<p align="center">
  <img src="frontend/public/logo.png" alt="The Family" width="200" />
</p>

<h1 align="center">The Family</h1>

<p align="center">
  A multiplayer AI chat app where every Don runs their own crew — built on <a href="https://github.com/cyfrworks/cyfr">CYFR</a>.
</p>

<p align="center">
  <strong>A CYFR Reference Project</strong><br/>
  No custom backend code. CYFR is the backend.
</p>

---

## What This Demonstrates

[CYFR](https://github.com/cyfrworks/cyfr) is a sandboxed WASM runtime that serves as a single MCP backend. Instead of writing server code, you compose **catalysts** (API bridges) and **formulas** (orchestration logic) that run in isolated WASM sandboxes.

This project shows how to build a full app on CYFR with zero backend code:

- **Auth & database** via the Supabase catalyst — signup, signin, CRUD, RPC, RLS enforcement
- **Multi-provider AI** via LLM catalysts — Claude, OpenAI, and Gemini through a unified interface
- **Multi-provider AI routing** — client-side provider mapping calls each LLM catalyst directly through CYFR
- **Frontend-only architecture** — the React app talks to a single `/mcp` endpoint; no Express, no Next.js API routes, no custom server
- **Secret management & host policies** — API keys are granted per-component, outbound domains are allowlisted

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  React / Vite / TypeScript Frontend                             │
│  (all requests go to /cyfr, proxied to localhost:4000/mcp)      │
└────────────────────────────┬────────────────────────────────────┘
                             │  JSON-RPC 2.0
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  CYFR Server  (Docker, port 4000)                               │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Catalysts (WASM-sandboxed API bridges)                 │    │
│  │                                                         │    │
│  │  local.supabase ──► Supabase GoTrue (auth)              │    │
│  │                 ──► Supabase PostgREST (database + RLS) │    │
│  │  local.claude   ──► Anthropic API                       │    │
│  │  local.openai   ──► OpenAI API                          │    │
│  │  local.gemini   ──► Google Gemini API                   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Formulas (WASM-sandboxed orchestration)                │    │
│  │                                                         │    │
│  │  local.list-models ──► model discovery across providers │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

Everything goes through CYFR. The frontend **never** talks to Supabase or any LLM directly — every operation routes through the sandboxed components. One endpoint to rule them all.

## Features

- **Become a Don** — sign up and build your own family of AI personas
- **Recruit your crew** — create Members with custom system prompts, providers, and models
- **5 made members** — built-in templates spanning Claude, OpenAI, and Gemini, ready to earn
- **Call a sit-down** — start conversation threads and bring your Members to the table
- **@mention to speak** — `@MemberName` calls on a specific Member; `@all` lets everyone at the table have their say
- **They're thinking it over** — typing indicators show when a Member is composing a response
- **Typewriter delivery** — AI responses arrive character by character, like a message being read aloud
- **The Commission** — invite other Dons by email, form alliances, run inter-family sit-downs
- **Multi-provider muscle** — Claude, OpenAI, and Gemini working the same sit-down
- **Clean talk** — markdown rendering with code blocks, GFM tables, and syntax highlighting
- **Works everywhere** — dark-themed, mobile-responsive UI with Playfair Display + Inter typography

## The Outfit — Member Templates

Five made members, ready to work. Pick a template or build your own from scratch.

| Member | Provider | Model | Personality |
|------|----------|-------|-------------|
| The Consigliere | Claude | claude-sonnet-4-5 | Measured advisor, strategic counsel, speaks in metaphors |
| The Caporegime | OpenAI | gpt-4o | Direct, action-oriented captain, street-smart |
| The Underboss | Claude | claude-opus-4 | Second in command, balances strategy with operations |
| The Soldato | Gemini | gemini-2.5-flash | Loyal soldier, quick-witted and resourceful |
| The Accountant | OpenAI | gpt-4o-mini | Analytical financial mind, data-driven, precise |

## What You'll Need

- **CYFR CLI** — install with:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/cyfrworks/cyfr/main/scripts/install.sh | sh
  ```
- **Node.js** 18+
- **Docker** (runs the CYFR server)
- A **Supabase** project ([free tier works](https://supabase.com))
- API keys for at least one LLM provider:
  - Anthropic (`ANTHROPIC_API_KEY`)
  - OpenAI (`OPENAI_API_KEY`)
  - Google (`GEMINI_API_KEY`)

## Setup

### 1. Lay the foundation — Supabase

Create a project at [supabase.com](https://supabase.com), then run the migration:

```
Copy the contents of supabase/migration.sql into your
Supabase project → SQL Editor → New Query → Run
```

This sets up the whole operation: tables (`profiles`, `roles`, `sit_downs`, `sit_down_members`, `messages`, `commission_contacts`, `typing_indicators`), RLS policies, triggers, and RPC functions.

Then configure auth redirects:

- Go to **Authentication** → **URL Configuration**
- Set **Site URL** to `http://localhost:5173` (or your production URL)

### 2. Open for business — CYFR Server

```bash
# Create .env from the template
cp .env.example .env

# Initialize CYFR (generates CYFR_SECRET_KEY_BASE and writes it to .env)
cyfr init

# Start the CYFR server
cyfr up

# Log in (opens GitHub OAuth flow)
cyfr login

# Register all components (catalysts + formulas)
cyfr register

# ── Set secrets (interactive — prompts for name and value) ──
# You'll need these from your Supabase project → Settings → API:
#   SUPABASE_URL, SUPABASE_ANON_KEY
# And at least one LLM key:
#   ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
cyfr secret set

# ── Grant secrets to components (interactive — choose component + secret) ──
# Grant SUPABASE_URL and SUPABASE_ANON_KEY to the Supabase catalyst
# Grant each LLM key to its respective catalyst (claude, openai, gemini)
cyfr secret grant

# Set host policies (which domains each component can reach)
cyfr policy set c:local.supabase:0.1.0 allowed_domains '["YOUR_PROJECT.supabase.co"]'
cyfr policy set c:local.claude:0.1.0 allowed_domains '["api.anthropic.com"]'
cyfr policy set c:local.openai:0.1.0 allowed_domains '["api.openai.com"]'
cyfr policy set c:local.gemini:0.1.0 allowed_domains '["generativelanguage.googleapis.com"]'

# Create a public API key for the frontend
cyfr key create --name "the-family" --type public --scope execution
# This prints a cyfr_pk_... key — copy it and set it in .env:
#   VITE_CYFR_PUBLIC_KEY=cyfr_pk_...
```

### 3. Open the doors — Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/cyfr` requests to `localhost:4000/mcp`, so no CORS configuration is needed during development.

## Running the Family

1. **Make your bones** — sign up on the login page
2. **Recruit your crew** — go to Members and pick from The Outfit or create your own with a custom system prompt, provider, and model
3. **Call a sit-down** — create a new conversation from the dashboard or sidebar
4. **Bring them to the table** — open sit-down settings and add Members from your library
5. **Talk business** — type messages; use `@MemberName` to hear from a specific Member, or `@all` to let everyone speak
6. **Form the Commission** — invite other Dons by email, accept invites, and run inter-family sit-downs where multiple Dons bring their crews to the table

## How It Works

### Getting made — Auth

Sign-up and sign-in calls go through `Frontend → CYFR → Supabase catalyst → Supabase GoTrue`. The frontend stores the returned JWT access token and passes it on all subsequent requests for RLS enforcement.

### The books — Database

All operations (roles, sit-downs, members, messages, commissions) go through `Frontend → CYFR → Supabase catalyst → Supabase PostgREST`. Row Level Security policies keep each family's business private, with exceptions for shared commission sit-downs.

### Hearing from the crew — AI Responses

When a Don @mentions a Member, the frontend maps the Member's provider to the corresponding LLM catalyst and calls it directly: `Frontend → CYFR → LLM catalyst (Claude/OpenAI/Gemini)`. The client-side `CATALYST_MAP` handles provider-specific request formatting (message structure, tool declarations, content extraction). The response is then written back to the database via the Supabase catalyst's RPC function.

### Keeping an ear out — Live Updates

Messages and typing indicators are polled every 3 seconds through the Supabase catalyst. All Dons at the table see new messages and "Member is thinking..." indicators as they come in.

### The Commission

Dons can invite other Dons by email to form cross-family alliances. Commission sit-downs (`is_commission = true`) let multiple Dons bring their crews to the same table. RLS policies are extended so commission members can see each other's Members within the shared sit-down.

## CYFR Components

| Component | Type | Description |
|-----------|------|-------------|
| `catalyst:local.supabase` | Catalyst | Auth (GoTrue), database (PostgREST), and storage bridge to Supabase |
| `catalyst:local.claude` | Catalyst | Anthropic Claude API bridge — chat completions, model listing |
| `catalyst:local.openai` | Catalyst | OpenAI API bridge — chat completions, model listing |
| `catalyst:local.gemini` | Catalyst | Google Gemini API bridge — content generation, model listing |
| `catalyst:local.web` | Catalyst | General HTTP request utility |
| `formula:local.list-models` | Formula | Aggregates available models across all registered LLM catalysts |

## Project Structure

```
.
├── frontend/                    # React/Vite/TypeScript app
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/            # AuthGuard, LoginForm, SignupForm
│   │   │   ├── chat/            # ChatView, MessageBubble, MessageComposer,
│   │   │   │                    # MessageContent, MentionPopover,
│   │   │   │                    # TypewriterText, TypingIndicator
│   │   │   ├── commission/      # CreateCommissionSitDownModal,
│   │   │   │                    # InviteToCommissionModal, PendingInvitesBanner
│   │   │   ├── layout/          # AppShell, Sidebar
│   │   │   ├── roles/           # RoleCard, RoleEditor, RoleTemplateSelector
│   │   │   └── sitdown/         # CreateSitdownModal, MemberList
│   │   ├── config/
│   │   │   └── constants.ts     # Member templates, model lists, limits
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx   # Auth state, sign-up/sign-in, profile
│   │   │   └── CommissionContext.tsx  # Commission contacts + polling
│   │   ├── hooks/
│   │   │   ├── useAIResponse.ts      # AI invocation, rate limiting, typing indicators
│   │   │   ├── useCommission.ts      # Invite/accept commission contacts
│   │   │   ├── useCommissionSitDowns.ts
│   │   │   ├── useMention.ts         # @mention autocomplete state
│   │   │   ├── useMessages.ts        # Message fetching (3s poll) + sending
│   │   │   ├── useModels.ts          # List available LLM models
│   │   │   ├── useRoles.ts           # Member CRUD
│   │   │   ├── useSitDown.ts         # Single sit-down + members
│   │   │   └── useSitDowns.ts        # Sit-down list
│   │   ├── lib/
│   │   │   ├── cyfr.ts          # CYFR MCP client (JSON-RPC 2.0)
│   │   │   ├── mention-parser.ts # @mention text parsing
│   │   │   ├── supabase.ts      # Supabase operations via CYFR catalyst
│   │   │   └── types.ts         # TypeScript types
│   │   ├── pages/               # Dashboard, Login, Signup, Members, Settings, Sitdown
│   │   ├── styles/
│   │   │   └── globals.css      # Tailwind + dark mafia theme
│   │   ├── App.tsx              # Router setup
│   │   └── main.tsx             # Entry point
│   ├── public/
│   │   └── logo.png             # Project logo
│   ├── index.html
│   ├── vite.config.ts           # Vite + Tailwind + /cyfr proxy
│   └── package.json
├── components/                  # CYFR WASM components
│   ├── catalysts/local/
│   │   ├── claude/0.1.0/        # Anthropic Claude API bridge
│   │   ├── openai/0.1.0/        # OpenAI API bridge
│   │   ├── gemini/0.1.0/        # Google Gemini API bridge
│   │   ├── supabase/0.1.0/      # Supabase (PostgREST, GoTrue, Storage) bridge
│   │   └── web/0.1.0/           # HTTP request utility
│   └── formulas/local/
│       ├── agent/0.1.0/         # Agentic loop formula (not used by frontend currently)
│       └── list-models/0.1.0/   # Model listing aggregation
├── wit/                         # WebAssembly Interface Types
│   ├── catalyst/                # Catalyst WIT (run, http, secrets)
│   ├── formula/                 # Formula WIT (run, invoke, mcp tools)
│   └── reagent/                 # Reagent WIT
├── supabase/
│   └── migration.sql            # Database schema, RLS policies, triggers, RPC functions
├── docker-compose.yml           # CYFR server container
├── cyfr.yaml                    # CYFR project config
├── .env.example                 # Environment variable template
├── integration-guide.md         # CYFR integration guide
└── component-guide.md           # CYFR component guide
```

## Taking It to the Streets — Production

### Build the frontend

```bash
cd frontend
npm run build
```

This outputs a static build to `frontend/dist/`. Serve it with any static file host (Nginx, Caddy, Vercel, Cloudflare Pages, etc.).

In production, set `VITE_CYFR_URL` to the full URL of your CYFR server's MCP endpoint (e.g. `https://cyfr.example.com/mcp`) so the frontend calls it directly instead of relying on Vite's dev proxy.

### TLS & reverse proxy

CYFR runs [Bandit](https://github.com/mtrudel/bandit) (a pure-Elixir HTTP server) on two ports:

| Port | Service | Purpose |
|------|---------|---------|
| 4000 | Emissary | MCP/API endpoint (`/mcp`) |
| 4001 | Prism | Admin dashboard (Phoenix LiveView) |

CYFR does not handle TLS itself. For production, put a reverse proxy in front to terminate HTTPS.

**Caddy** (simplest — automatic HTTPS via Let's Encrypt):

```
example.com {
    reverse_proxy /prism/* localhost:4001
    reverse_proxy * localhost:4000
}
```

**Nginx** (needs explicit SSE/WebSocket config):

```nginx
# MCP endpoint — SSE requires buffering off
location /mcp/sse {
    proxy_pass http://localhost:4000;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_set_header Connection '';
    proxy_read_timeout 300s;
}

# Prism dashboard — LiveView uses WebSockets
location /live {
    proxy_pass http://localhost:4001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

**Watch your back:**

- **SSE buffering** — CYFR sends `x-accel-buffering: no` on SSE responses, but also set `proxy_buffering off` in Nginx
- **WebSocket upgrade** — Prism uses Phoenix LiveView over WebSockets; Nginx needs `Upgrade`/`Connection` headers forwarded
- **Timeouts** — Bandit sends SSE keep-alive every 15s, so set `proxy_read_timeout` well above that (e.g. 300s)
- **Prism access** — keep port 4001 on an internal network if the dashboard shouldn't be public

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 7, Tailwind CSS v4
- **Backend**: CYFR (single MCP endpoint, WASM-sandboxed components)
- **Database**: Supabase PostgreSQL with Row Level Security
- **Auth**: Supabase GoTrue (via CYFR Supabase catalyst)
- **AI Providers**: Claude, OpenAI, Gemini (each via dedicated CYFR catalyst)
- **State**: Zustand, Zod for validation
- **UI**: Lucide icons, Sonner toasts, react-markdown, Playfair Display + Inter fonts

## Scripts

Run from the `frontend/` directory:

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (port 5173) |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

## Learn More

- [CYFR](https://github.com/cyfrworks/cyfr) — the WASM runtime this project is built on
- [integration-guide.md](integration-guide.md) — how to integrate CYFR into your own project
- [component-guide.md](component-guide.md) — how to build CYFR catalysts and formulas
