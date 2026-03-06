<p align="center">
  <img src="client/assets/images/banner.png" alt="The Family" width="600" />
</p>

<h1 align="center">The Family</h1>

<p align="center">
  A multi user multi AI chat app where every Don runs their family — built on <a href="https://github.com/cyfrworks/cyfr">CYFR</a>.
</p>

<p align="center">
  <strong>A CYFR Reference Project</strong><br/>
  No custom backend code. CYFR is the backend.
</p>

---

## What This Demonstrates

[CYFR](https://github.com/cyfrworks/cyfr) is a sandboxed WASM runtime that serves as a single MCP backend. Instead of writing server code, you compose **catalysts** (API bridges), **reagents** (compute modules), and **formulas** (orchestration logic) that run in isolated sandboxes with full policy control. The Family is a reference project that builds a full multi-user, multi-AI chat application on CYFR with zero backend code — no Express, no API routes, no Lambda.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Expo / React Native (Web) / TypeScript Client                  │
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
│  │  moonmoon69.supabase ──► Supabase GoTrue (auth)         │    │
│  │                       ──► Supabase PostgREST (db + RLS) │    │
│  │  moonmoon69.claude    ──► Anthropic API                 │    │
│  │  moonmoon69.openai    ──► OpenAI API                    │    │
│  │  moonmoon69.gemini    ──► Google Gemini API             │    │
│  │  moonmoon69.web       ──► Web page fetching             │    │
│  │  local.files           ──► File storage operations       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Formulas (WASM-sandboxed orchestration, local + reg.)  │    │
│  │                                                         │    │
│  │  local.auth-api          ──► auth operations            │    │
│  │  local.admin-api         ──► admin / catalog CRUD       │    │
│  │  local.members-api       ──► member CRUD                │    │
│  │  local.sit-down          ──► CRUD, participants,        │    │
│  │                              messages, AI responses     │    │
│  │  local.settings-api      ──► profile + password mgmt    │    │
│  │  local.commission-api    ──► commission contacts         │    │
│  │  local.agent             ──► AI agent w/ file ops        │    │
│  │  moonmoon69.list-models  ──► model discovery            │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Reagents (WASM-sandboxed pure functions)               │    │
│  │                                                         │    │
│  │  local.mention-parser ──► @mention text parsing         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Features

- **Made members, not chatbots** — AI Members are first-class participants. Same table, same message schema as humans. They don't assist — they sit down with you.
- **@mention to summon** — `@MemberName` calls on a specific Member; `@all` lets everyone at the table have their say. The server decides who talks.
- **The whole table talks** — call on multiple Members and the server spawns them asynchronously. Each responds independently with their own personality, model, and provider.
- **The Commission** — invite other Dons by email, form alliances, run inter-family sit-downs where multiple Dons bring their own crews to the same table.
- **The Godfather runs the catalog** — admin-curated model catalog with aliases that hide raw model IDs. Hot-swap the underlying model and nobody notices. Tier-gated access (Godfather / Boss / Associate).
- **Multi-provider muscle** — Claude, OpenAI, and Gemini Members working the same sit-down, each routed to their own provider.
- **No backend code** — CYFR is the entire backend. Every operation is a JSON-RPC call to CYFR components. No Express, no API routes, no Lambda.
- **5 made members ready to earn** — The Outfit: Consigliere, Caporegime, Underboss, Soldato, Accountant. Pick a template, choose a model, they're made.

## The Outfit — Member Templates

Five personality templates, ready to work. Pick a template, choose a model from the catalog, and they're made.

| Member | Personality |
|------|-------------|
| The Consigliere | Measured advisor, strategic counsel, speaks in metaphors |
| The Caporegime | Direct, action-oriented captain, street-smart |
| The Underboss | Second in command, balances strategy with operations |
| The Soldato | Loyal soldier, quick-witted and resourceful |
| The Accountant | Analytical financial mind, data-driven, precise |

Templates are personality-only — the model is chosen at creation time from whatever the Godfather has published in the catalog.

## Prerequisites

- **CYFR CLI** — install with:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/cyfrworks/cyfr/main/scripts/install.sh | sh
  ```
- **Node.js** 18+
- **Docker** (runs the CYFR server)
- A **Supabase** project — [cloud](https://supabase.com) (free tier works)
- API keys for at least one LLM provider:
  - Anthropic (`ANTHROPIC_API_KEY`)
  - OpenAI (`OPENAI_API_KEY`)
  - Google (`GEMINI_API_KEY`)

## Setup

### 1. Lay the foundation — Supabase

Create a project at [supabase.com](https://supabase.com), then run the migration:

```
Copy the contents of migrations/001-migration.sql into your
Supabase project → SQL Editor → New Query → Run
```

This sets up the whole operation: tables (`profiles`, `model_catalog`, `members`, `sit_downs`, `sit_down_participants`, `messages`, `commission_contacts`, `typing_indicators`), RLS policies, triggers, and RPC functions.

After running the migration, promote your first user to Godfather so they can manage the model catalog:

```sql
UPDATE public.profiles SET tier = 'godfather' WHERE id = 'YOUR_USER_UUID';
```

Then configure auth redirects:

- Go to **Authentication** → **URL Configuration**
- Set **Site URL** to `http://localhost:8081` (or your production URL)

### 2. Open for business — CYFR Server

```bash
# Clone and configure
git clone <repo-url> && cd the_family
cp .env.example .env
# Fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY from your Supabase project

# Initialize CYFR
cyfr init                    # generates CYFR_SECRET_KEY_BASE → writes to .env
cyfr upgrade                 # pull latest CYFR CLI + Docker image
cyfr update                  # update project scaffolds (WIT, docs)
cyfr up                      # start CYFR server (port 4000/4001)

# Authenticate
cyfr login                   # GitHub OAuth device flow — opens browser

# Create a frontend API key
cyfr key create --name "the-family" --type public
# Copy the printed cyfr_pk_... key to .env as EXPO_PUBLIC_CYFR_PUBLIC_KEY
# (Expo reads this at dev/build time — no CYFR restart needed)

# Pull registry components
cyfr pull catalyst:moonmoon69.supabase:0.2.0
cyfr pull catalyst:moonmoon69.claude:0.2.0
cyfr pull catalyst:moonmoon69.openai:0.2.0
cyfr pull catalyst:moonmoon69.gemini:0.2.0
cyfr pull catalyst:moonmoon69.web:0.2.0
cyfr pull formula:moonmoon69.list-models:0.3.0
# Or pull via Prism: open http://localhost:4001/Components, search by name, and pull from the UI

# Register local components (formulas + reagent)
cyfr register
```

#### Configure secrets, grants, and host policies

Three options:

- **Option A — `cyfr setup`** (recommended): interactive wizard that walks through secrets, grants, and policies per component. Run `cyfr setup` and follow the prompts.
- **Option B — Prism dashboard**: SSH tunnel to the admin UI (`ssh -L 4001:localhost:4001 user@server`), open `http://localhost:4001`, configure visually. Prism also serves as a live real-time dashboard for monitoring execution.
- **Option C — Manual CLI**: individual `cyfr secret set`, `cyfr secret grant`, `cyfr policy set` commands (see reference below).

<details>
<summary>Option C — Manual CLI commands</summary>

```bash
# ── Set secrets (interactive — prompts for name and value) ──
# You'll need these from your Supabase project → Settings → API:
#   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY
# And at least one LLM key:
#   ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY
cyfr secret set

# ── Grant secrets to components (interactive — choose component + secret) ──
# Grant SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the Supabase catalyst
# Grant each LLM key to its respective catalyst (claude, openai, gemini)
cyfr secret grant

# Set host policies (which domains each component can reach)
cyfr policy set c:moonmoon69.supabase:0.2.0 allowed_domains '["YOUR_PROJECT.supabase.co"]'
cyfr policy set c:moonmoon69.claude:0.2.0 allowed_domains '["api.anthropic.com"]'
cyfr policy set c:moonmoon69.openai:0.2.0 allowed_domains '["api.openai.com"]'
cyfr policy set c:moonmoon69.gemini:0.2.0 allowed_domains '["generativelanguage.googleapis.com"]'

# Set allowed MCP tools for formulas (formulas dispatch via MCP tool calls)
cyfr policy set f:local.auth-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.settings-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.commission-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.members-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.admin-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.sit-down:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.agent:0.4.0 allowed_tools '["execution.run", "component.search", "component.inspect", "guide.get", "tools.list"]'
cyfr policy set f:moonmoon69.list-models:0.3.0 allowed_tools '["execution.run"]'
```

</details>

You'll need these secrets:

| Secret | Grant to | Description |
|--------|----------|-------------|
| `SUPABASE_URL` | `moonmoon69.supabase` | Your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | `moonmoon69.supabase` | Supabase anon/publishable key |
| `ANTHROPIC_API_KEY` | `moonmoon69.claude` | Anthropic API key |
| `OPENAI_API_KEY` | `moonmoon69.openai` | OpenAI API key (optional) |
| `GEMINI_API_KEY` | `moonmoon69.gemini` | Google Gemini API key (optional) |

And these host policies:

| Component | Allowed domains |
|-----------|----------------|
| `moonmoon69.supabase` | `YOUR_PROJECT.supabase.co` |
| `moonmoon69.claude` | `api.anthropic.com` |
| `moonmoon69.openai` | `api.openai.com` |
| `moonmoon69.gemini` | `generativelanguage.googleapis.com` |

And these formula tool policies (formulas dispatch sub-component calls via MCP tools):

| Component | Allowed tools |
|-----------|--------------|
| All API formulas | `execution.run` |
| `local.agent` | `execution.run`, `component.search`, `component.inspect`, `guide.get`, `tools.list` |
| `moonmoon69.list-models` | `execution.run` |

### 3. Open the doors — Development

```bash
cd client
npm install
npx expo start --web    # Expo dev server on port 8081, proxies /cyfr → CYFR
```

## Running the Family

1. **Make your bones** — sign up on the login page
2. **Become Godfather** — promote yourself via SQL (see Setup), then open the Admin page to discover models from your API keys and publish them to the catalog with user-facing aliases
3. **Recruit your crew** — go to Members and pick from The Outfit or create your own with a custom system prompt, then choose a model from the catalog
4. **Call a sit-down** — create a new conversation from the dashboard or sidebar
5. **Bring them to the table** — open sit-down settings and add Members from your library
6. **Talk business** — type messages; use `@MemberName` to hear from a specific Member, or `@all` to let everyone speak
7. **Form the Commission** — invite other Dons by email, accept invites, and run inter-family sit-downs where multiple Dons bring their crews to the table

## How It Works

### Getting made — Auth

Sign-up and sign-in calls go through `Frontend → CYFR → Supabase catalyst → Supabase GoTrue`. The frontend stores the returned JWT access token and passes it on all subsequent requests for RLS enforcement.

### The books — Database

All operations (members, sit-downs, participants, messages, commissions) go through `Frontend → CYFR → Supabase catalyst → Supabase PostgREST`. Row Level Security policies keep each family's business private, with exceptions for shared commission sit-downs.

### The model catalog — Admin Control

The Godfather manages a `model_catalog` table that maps user-facing aliases (e.g., "Sonnet", "Pro") to actual model IDs (e.g., `claude-sonnet-4-5-20250514`). Users never see raw model IDs — they pick from aliases published by the admin. The Godfather can hot-swap the underlying model at any time; existing Members automatically use the new model on their next response. Catalog entries have a `min_tier` field that restricts access by user tier (Associate = everyone, Boss = Boss + Godfather only).

### Hearing from the crew — AI Responses

When a Don @mentions a Member, the frontend resolves the actual model ID from the Member's catalog entry, maps the provider to the corresponding LLM catalyst, and calls it directly: `Frontend → CYFR → LLM catalyst (Claude/OpenAI/Gemini)`. The client-side `CATALYST_MAP` handles provider-specific request formatting (message structure, tool declarations, content extraction). The response is then written back to the database via the Supabase catalyst's RPC function.

### Keeping an ear out — Live Updates

Messages and typing indicators are polled every 3 seconds through the Supabase catalyst. All Dons at the table see new messages and "Member is thinking..." indicators as they come in.

### The Commission

Dons can invite other Dons by email to form cross-family alliances. Commission sit-downs (`is_commission = true`) let multiple Dons bring their crews to the same table. RLS policies are extended so commission members can see each other's Members within the shared sit-down.

## CYFR Components

| Component | Type | Source | Description |
|-----------|------|--------|-------------|
| `catalyst:moonmoon69.supabase:0.2.0` | Catalyst | Registry | Auth (GoTrue), database (PostgREST), storage, edge functions |
| `catalyst:moonmoon69.claude:0.2.0` | Catalyst | Registry | Anthropic Claude API — messages, streaming, model listing |
| `catalyst:moonmoon69.openai:0.2.0` | Catalyst | Registry | OpenAI API — responses, completions, model listing |
| `catalyst:moonmoon69.gemini:0.2.0` | Catalyst | Registry | Google Gemini API — generation, model listing |
| `catalyst:moonmoon69.web:0.2.0` | Catalyst | Registry | General web reader — fetch pages, extract text |
| `catalyst:local.files:0.1.0` | Catalyst | Local | File storage operations — read, write, list, delete |
| `formula:moonmoon69.list-models:0.3.0` | Formula | Registry | Aggregates models across all AI provider catalysts |
| `formula:local.auth-api:0.1.0` | Formula | Local | Sign up, sign in, sign out, token refresh, password reset |
| `formula:local.admin-api:0.1.0` | Formula | Local | User listing, tier management, model catalog CRUD |
| `formula:local.members-api:0.1.0` | Formula | Local | Member CRUD with tier-based model access checks |
| `formula:local.sit-down:0.1.0` | Formula | Local | Consolidated sit-down: CRUD, participants, messages, AI responses |
| `formula:local.settings-api:0.1.0` | Formula | Local | Profile updates, password changes |
| `formula:local.commission-api:0.1.0` | Formula | Local | Commission contacts: invite, accept, decline, remove |
| `formula:local.agent:0.4.0` | Formula | Local | AI agent with file ops, multi-provider LLM, CYFR-aware context |
| `reagent:local.mention-parser:0.1.0` | Reagent | Local | Parses @mentions, resolves names, handles @all |

## Project Structure

```
.
├── client/                      # Expo / React Native (Web) app
│   ├── app/                     # Expo Router file-based routing
│   │   ├── (app)/               # Authenticated routes
│   │   │   ├── _layout.tsx      # App shell + sidebar
│   │   │   ├── index.tsx        # Dashboard
│   │   │   ├── admin.tsx        # Admin page
│   │   │   ├── members.tsx      # Members page
│   │   │   ├── settings.tsx     # Settings page
│   │   │   └── sitdown/         # Sit-down routes
│   │   ├── (auth)/              # Auth routes (login, signup, reset-password)
│   │   └── _layout.tsx          # Root layout + providers
│   ├── components/
│   │   ├── admin/               # ModelCatalogManager, AddModelModal, UserTierManager
│   │   ├── chat/                # ChatView, MessageBubble, MessageComposer,
│   │   │                        # MessageContent, MentionPopover, TypingIndicator
│   │   ├── commission/          # CreateCommissionSitDownModal,
│   │   │                        # InviteToCommissionModal, PendingInvitesBanner
│   │   ├── layout/              # Sidebar
│   │   ├── members/             # MemberCard, MemberEditor, MemberTemplateSelector
│   │   └── sitdown/             # CreateSitdownModal, MemberList
│   ├── config/
│   │   └── constants.ts         # Member templates, tier labels, limits
│   ├── contexts/
│   │   ├── AuthContext.tsx       # Auth state, sign-up/sign-in, profile, tier
│   │   └── CommissionContext.tsx # Commission contacts + realtime
│   ├── hooks/                   # React hooks (useMembers, useSitDowns, useMention, etc.)
│   ├── lib/
│   │   ├── cyfr.ts              # CYFR MCP client (JSON-RPC 2.0)
│   │   ├── realtime.ts          # Supabase Realtime via CYFR
│   │   ├── supabase.ts          # Supabase operations via CYFR catalyst
│   │   └── types.ts             # TypeScript types
│   ├── assets/                  # Fonts, images (banner, logo, icons)
│   ├── global.css               # Tailwind + dark mafia theme
│   ├── metro.config.js          # Metro bundler + /cyfr dev proxy
│   └── package.json
├── components/                  # CYFR WASM components
│   ├── catalysts/
│   │   ├── local/
│   │   │   └── files/0.1.0/          # File storage operations catalyst
│   │   └── moonmoon69/               # (pulled from registry via cyfr pull)
│   ├── reagents/local/
│   │   └── mention-parser/0.1.0/  # @mention text parsing reagent
│   └── formulas/
│       ├── local/
│       │   ├── admin-api/0.1.0/       # Admin operations + model catalog CRUD
│       │   ├── agent/0.4.0/           # AI agent w/ file ops + multi-provider LLM
│       │   ├── auth-api/0.1.0/        # Authentication operations
│       │   ├── commission-api/0.1.0/  # Commission contact management
│       │   ├── members-api/0.1.0/     # Member CRUD
│       │   ├── settings-api/0.1.0/    # Profile + password management
│       │   └── sit-down/0.1.0/        # Consolidated sit-down operations
│       └── moonmoon69/
│           └── list-models/0.3.0/     # Model listing aggregation (registry)
├── wit/                         # WebAssembly Interface Types
│   ├── catalyst/                # Catalyst WIT (run, http, secrets)
│   ├── formula/                 # Formula WIT (run, invoke)
│   └── reagent/                 # Reagent WIT
├── migrations/
│   └── 001-migration.sql        # Database schema, RLS policies, triggers, RPC functions
├── docker-compose.yml           # CYFR + web build + Caddy
├── Caddyfile                    # Caddy reverse proxy config (production)
├── cyfr.yaml                    # CYFR project config
├── .env.example                 # Environment variable template
├── integration-guide.md         # CYFR integration guide
└── component-guide.md           # CYFR component guide
```

## Taking It to the Streets — Production

After completing the dev setup above, production only requires a few extra steps:

1. Set in `.env`:
   - `COMPOSE_PROFILES=caddy`
   - `SITE_DOMAIN=yourdomain.com`
2. Point your DNS A record to your server's IP
3. `cyfr up` — starts CYFR, builds the web frontend, and launches Caddy (auto-provisions HTTPS via Let's Encrypt)

The web frontend rebuilds automatically on every `cyfr up` — no extra build commands needed. In local dev, omit `COMPOSE_PROFILES` and only CYFR starts.

| Port | Service | Purpose |
|------|---------|---------|
| 80 | Caddy | HTTP → HTTPS redirect |
| 443 | Caddy | HTTPS (auto TLS), frontend + API proxy |
| 4000 | CYFR Emissary | MCP endpoint (internal, proxied by Caddy) |
| 4001 | CYFR Prism | Admin dashboard (not public — SSH tunnel) |

**Watch your back:**

- **Development** — use `cd client && npx expo start --web` for hot reloading (port 8081)
- **Prism** — not exposed publicly. Access it via SSH tunnel:
  ```bash
  ssh -L 4001:localhost:4001 user@your-server
  ```
  Then open `http://localhost:4001`

## Tech Stack

- **Client**: Expo, React Native (Web), TypeScript, Expo Router, NativeWind (Tailwind CSS)
- **Backend**: CYFR (single MCP endpoint, WASM-sandboxed components)
- **Database**: Supabase PostgreSQL with Row Level Security
- **Auth**: Supabase GoTrue (via CYFR Supabase catalyst)
- **AI Providers**: Claude, OpenAI, Gemini (each via dedicated CYFR catalyst)
- **State**: TanStack Query v5, Zod for validation
- **UI**: Lucide icons, react-markdown, Playfair Display + Inter fonts

## Scripts

Run from the `client/` directory:

| Command | Description |
|---------|-------------|
| `npx expo start --web` | Start dev server (port 8081) |
| `npx expo export --platform web` | Build for production |

## Learn More

- [CYFR](https://github.com/cyfrworks/cyfr) — the WASM runtime this project is built on
- [integration-guide.md](integration-guide.md) — how to integrate CYFR into your own project
- [component-guide.md](component-guide.md) — how to build CYFR catalysts and formulas
