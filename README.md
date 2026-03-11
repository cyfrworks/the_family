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

[CYFR](https://github.com/cyfrworks/cyfr) is a secure runtime with full governance and control that serves as a single MCP backend. Instead of writing server code, you compose **catalysts** (API bridges), **reagents** (compute modules), and **formulas** (orchestration logic) that run in isolated sandboxes with full policy control. The Family is a reference project that builds a full multi-user, multi-AI chat application on CYFR without having to glue backend services together, no Express, no API routes, no Lambda.

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
│  │  moonmoon69.supabase    ──► Supabase GoTrue (auth)      │    │
│  │                         ──► Supabase PostgREST (db+RLS) │    │
│  │  moonmoon69.claude      ──► Anthropic API               │    │
│  │  moonmoon69.openai      ──► OpenAI API                  │    │
│  │  moonmoon69.gemini      ──► Google Gemini API           │    │
│  │  moonmoon69.grok        ──► xAI Grok API                │    │
│  │  moonmoon69.openrouter  ──► OpenRouter API              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Formulas (WASM-sandboxed orchestration, local + reg.)  │    │
│  │                                                         │    │
│  │  local.admin-api         ──► admin / catalog CRUD       │    │
│  │  local.members-api       ──► member CRUD + crews        │    │
│  │  local.sit-down          ──► CRUD, participants,        │    │
│  │                              messages, mention routing   │    │
│  │  local.family-member     ──► unified behavior engine    │    │
│  │                              (consul, capo, bookkeeper) │    │
│  │  local.bookkeeper-api    ──► bookkeeper entry CRUD      │    │
│  │  local.settings-api      ──► profile + password mgmt    │    │
│  │  local.commission-api    ──► commission contacts         │    │
│  │  local.informant-api     ──► informant token auth +     │    │
│  │                              message dispatch           │    │
│  │  local.list-models       ──► model discovery            │    │
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
- **The full hierarchy** — five member types, each with a distinct role in the family:
  - **Consuls** — one-shot advisors, @mentionable, respond with a single message
  - **Caporegimes** — orchestrators with agentic tool use, acknowledge orders immediately, work in the background, and post a report back to the sit-down
  - **Soldiers** — crew members nested under a Caporegime, not @mentionable by the Don, invoked only by their captain during operations
  - **Bookkeepers** — knowledge stores, @mentionable for queries, each with their own browsable entry database
  - **Informants** — push-only service members with API tokens for external integrations
- **Operations dashboard** — every Caporegime run is tracked: status, tool calls, token usage, and results. Live updates via realtime.
- **The Commission** — invite other Dons by email, form alliances, run inter-family sit-downs where multiple Dons bring their own crews to the same table.
- **The Godfather runs the catalog** — admin-curated model catalog with aliases that hide raw model IDs. Hot-swap the underlying model and nobody notices. Tier-gated access (Godfather / Boss / Associate).
- **Multi-provider muscle** — Claude, OpenAI, Gemini, Grok, and OpenRouter Members working the same sit-down, each routed to their own provider.
- **No backend code** — CYFR is the entire backend. Every operation is a JSON-RPC call to CYFR components. No Express, no API routes, no Lambda.

## The Hierarchy

```
Don (human user)
├── Consuls — advisors, @mentionable, one-shot responses
├── Caporegimes — orchestrators, @mentionable, agentic tool use
│   └── Soldiers — crew members, invoked only by their captain
├── Bookkeepers — knowledge stores, @mentionable for queries
└── Informants — external data, push-only via API token
```

### Member Templates

Templates for each role, ready to work. Pick a template, choose a model from the catalog, and they're made.

**Consul templates:**

| Template | Personality |
|----------|-------------|
| Il Consigliere | The wise counsel — measured advice drawn from history and strategy |
| Il Sottocapo | The underboss — bridges vision and execution, sees the full picture |
| Il Diplomatico | The smooth operator — finds common ground, builds bridges |
| L'Avvocato | The lawyer — sharp analytical mind, argues both sides, finds the angle |
| Il Ragioniere | The accountant — numbers, patterns, and the bottom line |

**Caporegime templates:**

| Template | Personality |
|----------|-------------|
| Il Capitano | The enforcer — direct, efficient, delegates and reports |
| Lo Stratega | The strategist — plans before acting, coordinates multiple angles |

**Bookkeeper templates:**

| Template | Personality |
|----------|-------------|
| Il Bibliotecario | The librarian — meticulous records, precise retrieval |
| L'Analista | The analyst — connects dots, synthesizes patterns across records |

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
  - xAI (`GROK_API_KEY`)
  - OpenRouter (`OPENROUTER_API_KEY`)

## Setup

### 1. Lay the foundation — Supabase

Create a project at [supabase.com](https://supabase.com), then run the migrations:

```
Run each SQL file from the migrations/ directory (001 through 014)
in order in your Supabase project → SQL Editor → New Query → Run
```

This sets up the whole operation: tables (`profiles`, `model_catalog`, `members`, `sit_downs`, `sit_down_participants`, `messages`, `commission_contacts`, `typing_indicators`, `informants`, `informant_tokens`, `operations`, `bookkeeper_entries`), RLS policies, triggers, and RPC functions.

After running the migrations, promote your first user to Godfather so they can manage the model catalog:

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
cyfr init                    # generates CYFR_SECRET_KEY_BASE → manual paste to .env
cyfr upgrade                 # pull latest CYFR CLI + Docker image
cyfr update                  # update project scaffolds (WIT, docs)
cyfr up                      # build & start CYFR server and (if enabled production profile) Caddy + web containers

# Authenticate
cyfr login                   # GitHub OAuth device flow — opens browser

# Create a frontend API key
cyfr key create --name "the-family" --type public
# Copy the printed cyfr_pk_... key to .env as EXPO_PUBLIC_CYFR_PUBLIC_KEY
# (Expo reads this at dev/build time — no CYFR restart needed)

# Register local components — also pulls registry dependencies automatically
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
#   ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, GROK_API_KEY, OPENROUTER_API_KEY
cyfr secret set

# ── Grant secrets to components (interactive — choose component + secret) ──
# Grant SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to the Supabase catalyst
# Grant each LLM key to its respective catalyst (claude, openai, gemini, grok, openrouter)
cyfr secret grant

# Set host policies (which domains each component can reach)
cyfr policy set c:moonmoon69.supabase:0.3.0 allowed_domains '["YOUR_PROJECT.supabase.co"]'
cyfr policy set c:moonmoon69.claude:1.0.0 allowed_domains '["api.anthropic.com"]'
cyfr policy set c:moonmoon69.openai:1.0.0 allowed_domains '["api.openai.com"]'
cyfr policy set c:moonmoon69.gemini:1.0.0 allowed_domains '["generativelanguage.googleapis.com"]'
cyfr policy set c:moonmoon69.grok:1.0.0 allowed_domains '["api.x.ai"]'
cyfr policy set c:moonmoon69.openrouter:1.0.0 allowed_domains '["openrouter.ai"]'

# Set allowed MCP tools for formulas (formulas dispatch sub-component calls via MCP tools)
cyfr policy set f:local.settings-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.commission-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.members-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.admin-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.sit-down:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.family-member:0.1.0 allowed_tools '["execution.run", "execution.list", "tools.list", "cron.create", "cron.list", "cron.update", "cron.delete"]'
cyfr policy set f:local.bookkeeper-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.informant-api:0.1.0 allowed_tools '["execution.run"]'
cyfr policy set f:local.list-models:0.5.0 allowed_tools '["execution.run"]'
```

</details>

You'll need these secrets:

| Secret | Grant to | Description |
|--------|----------|-------------|
| `SUPABASE_URL` | `moonmoon69.supabase` | Your Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | `moonmoon69.supabase` | Supabase anon/publishable key |
| `SUPABASE_SECRET_KEY` | `moonmoon69.supabase` | Supabase service role/secret key |
| `ANTHROPIC_API_KEY` | `moonmoon69.claude` | Anthropic API key |
| `OPENAI_API_KEY` | `moonmoon69.openai` | OpenAI API key (optional) |
| `GEMINI_API_KEY` | `moonmoon69.gemini` | Google Gemini API key (optional) |
| `GROK_API_KEY` | `moonmoon69.grok` | xAI Grok API key (optional) |
| `OPENROUTER_API_KEY` | `moonmoon69.openrouter` | OpenRouter API key (optional) |

And these host policies:

| Component | Allowed domains |
|-----------|----------------|
| `moonmoon69.supabase` | `YOUR_PROJECT.supabase.co` |
| `moonmoon69.claude` | `api.anthropic.com` |
| `moonmoon69.openai` | `api.openai.com` |
| `moonmoon69.gemini` | `generativelanguage.googleapis.com` |
| `moonmoon69.grok` | `api.x.ai` |
| `moonmoon69.openrouter` | `openrouter.ai` |

And these formula tool policies (formulas dispatch sub-component calls via MCP tools):

| Component | Allowed tools |
|-----------|--------------|
| All API formulas | `execution.run` |
| `local.family-member` | `execution.run`, `execution.list`, `tools.list`, `cron.*` |
| `local.informant-api` | `execution.run` |
| `local.list-models` | `execution.run` |

### 3. Open the doors — Development

```bash
cd client
npm install
npx expo start --web    # Expo dev server on port 8081, proxies /cyfr → CYFR
```

## Running the Family

1. **Make your bones** — sign up on the login page
2. **Become Godfather** — promote yourself via SQL (see Setup), then open the Admin page to discover models from your API keys and publish them to the catalog with user-facing aliases
3. **Recruit your crew** — go to Members and create Consuls, Caporegimes, or Bookkeepers. Pick a template or write a custom system prompt, then choose a model from the catalog
4. **Build a crew** — expand a Caporegime and add Soldiers to its crew. Each Soldier gets its own model and prompt, invoked only by its captain
5. **Stock the books** — create a Bookkeeper, then add entries via the Bookkeeper browser. Caporegimes can also write to bookkeepers during operations
6. **Set up informants** — create Informants from the Members page, get an API token, and integrate external tools that pass intel to sit-downs
7. **Call a sit-down** — create a new conversation from the dashboard or sidebar
8. **Bring them to the table** — open sit-down settings and add Members from your library
9. **Talk business** — type messages; use `@MemberName` to hear from a specific Member, or `@all` to let everyone speak. @mention a Caporegime to send it on a mission — it acknowledges, works in the background, and reports back
10. **Check operations** — view the Operations dashboard for live status, tool calls, and results from Caporegime runs
11. **Form the Commission** — invite other Dons by email, accept invites, and run inter-family sit-downs where multiple Dons bring their crews to the table

## How It Works

### Getting made — Auth

Sign up, sign in, and reset your password from the auth pages. Your account gets a tier (Associate, Boss, or Godfather) that controls which models you can access from the catalog.

### The books — Database

All operations (members, sit-downs, participants, messages, commissions) go through `Frontend → CYFR → Supabase catalyst → Supabase PostgREST`. Row Level Security policies keep each family's business private, with exceptions for shared commission sit-downs.

### The model catalog — Admin Control

The Godfather manages a `model_catalog` table that maps user-facing aliases (e.g., "Sonnet", "Pro") to actual model IDs (e.g., `claude-sonnet-4-5-20250514`). Users never see raw model IDs — they pick from aliases published by the admin. The Godfather can hot-swap the underlying model at any time; existing Members automatically use the new model on their next response. Catalog entries have a `min_tier` field that restricts access by user tier (Associate = everyone, Boss = Boss + Godfather only).

### Hearing from the crew — AI Responses

@mention a Member and they respond. @all and everyone at the table speaks. The `sit-down` formula routes each mention to the `family-member` formula, which handles behavior per member type:

- **Consuls** — single-shot LLM call, response appears directly in the sit-down
- **Caporegimes** — acknowledge immediately ("On it, boss."), run an agentic loop with MCP tools in the background, then post a summary report back to the sit-down. Full details tracked in the Operations table
- **Bookkeepers** — search their knowledge store for relevant entries, synthesize an answer with LLM context
- **Soldiers** — never invoked directly. A Caporegime delegates tasks to its soldiers during its agentic loop

### Operations

Every Caporegime run creates an operation record: status (running/completed/failed), task summary, tool calls, token usage, and results. The Operations dashboard shows live status updates via realtime subscriptions.

### Bookkeepers

Each Bookkeeper has its own knowledge store — a collection of titled entries with content and tags. Browse, search, create, and edit entries from the Bookkeeper screen. Caporegimes can read from and write to bookkeepers during operations via the bookkeeper-api formula.

### Keeping an ear out — Live Updates

Messages, typing indicators, and operation status updates appear in real time via Supabase Realtime channels.

### Informants

Informants are service members — bots, webhooks, or external tools that can post messages to sit-downs via a simple REST API. Create an Informant from the Members page, get an API token, and POST to `/inform`. They show up in the conversation like any other Member but can't be @mentioned. Useful for piping in alerts, notifications, or data from external systems.

#### Setting up an Informant

1. Go to **Members** → **Create Informant**
2. Give it a name (e.g., "TradingView Alerts", "GitHub Bot", "Server Monitor")
3. Copy the generated API token (`inf_...`) — you won't see it again
4. Add the Informant to a sit-down like any other Member

#### Sending messages

POST to your server's `/inform` endpoint:

```bash
curl -X POST https://yourdomain.com/inform \
  -H "Content-Type: application/json" \
  -d '{
    "token": "inf_your_token_here",
    "action": "send_message",
    "sit_down_id": "uuid-of-the-sit-down",
    "content": "BTC just crossed $100k"
  }'
```

In development, the proxy runs at `http://localhost:4002/inform` — start it with `node inform-proxy.js`.

#### Example: TradingView webhook

Set your TradingView alert webhook URL to `https://yourdomain.com/inform` with this JSON body:

```json
{
  "token": "inf_your_token_here",
  "action": "send_message",
  "sit_down_id": "uuid-of-your-trading-sit-down",
  "content": "{{ticker}} {{interval}} alert: {{strategy.order.action}} at {{close}}. Volume: {{volume}}"
}
```

TradingView replaces the `{{...}}` placeholders with live market data. The message lands in the sit-down in real time — and if you have AI Members at the table, you can @mention them to analyze the alert.

#### Example: GitHub webhook (via a small relay)

GitHub sends complex payloads, so use a small relay script (or a service like Pipedream/Make) to transform the payload and POST to `/inform`:

```json
{
  "token": "inf_your_token_here",
  "action": "send_message",
  "sit_down_id": "uuid-of-your-dev-sit-down",
  "content": "New PR opened by octocat: 'Fix login bug' — 3 files changed"
}
```

#### Example: Cron job / server monitor

```bash
# Pipe server health into a sit-down every hour
curl -X POST https://yourdomain.com/inform \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"inf_your_token_here\",
    \"action\": \"send_message\",
    \"sit_down_id\": \"uuid-of-your-ops-sit-down\",
    \"content\": \"Server health: CPU $(top -l1 | awk '/CPU usage/{print $3}'), Disk $(df -h / | awk 'NR==2{print $5}') used\"
  }"
```

Any service that can send an HTTP POST can be an Informant. The message appears in the sit-down like it came from any other Member.

### The Commission

Dons can invite other Dons by email to form cross-family alliances. Commission sit-downs (`is_commission = true`) let multiple Dons bring their crews to the same table. RLS policies are extended so commission members can see each other's Members within the shared sit-down.

## CYFR Components

| Component | Type | Source | Description |
|-----------|------|--------|-------------|
| `catalyst:moonmoon69.supabase:0.3.0` | Catalyst | Registry | Auth (GoTrue), database (PostgREST), storage, edge functions |
| `catalyst:moonmoon69.claude:1.0.0` | Catalyst | Registry | Anthropic Claude API — messages, streaming, model listing |
| `catalyst:moonmoon69.openai:1.0.0` | Catalyst | Registry | OpenAI API — responses, completions, model listing |
| `catalyst:moonmoon69.gemini:1.0.0` | Catalyst | Registry | Google Gemini API — generation, model listing |
| `catalyst:moonmoon69.grok:1.0.0` | Catalyst | Registry | xAI Grok API — chat completions, model listing |
| `catalyst:moonmoon69.openrouter:1.0.0` | Catalyst | Registry | OpenRouter API — 400+ models via unified API |
| `formula:local.admin-api:0.1.0` | Formula | Local | User listing, tier management, model catalog CRUD |
| `formula:local.members-api:0.1.0` | Formula | Local | Member CRUD, crew management, tier-based model access |
| `formula:local.sit-down:0.1.0` | Formula | Local | Sit-down CRUD, participants, messages, mention routing |
| `formula:local.family-member:0.1.0` | Formula | Local | Unified behavior engine — consul, caporegime, bookkeeper |
| `formula:local.bookkeeper-api:0.1.0` | Formula | Local | Bookkeeper entry CRUD and full-text search |
| `formula:local.settings-api:0.1.0` | Formula | Local | Profile updates, password changes, push token registration |
| `formula:local.commission-api:0.1.0` | Formula | Local | Commission contacts: invite, accept, decline, remove |
| `formula:local.informant-api:0.1.0` | Formula | Local | Informant token auth + message dispatch |
| `formula:local.list-models:0.5.0` | Formula | Local | Aggregates models across all AI provider catalysts |
| `reagent:local.mention-parser:0.1.0` | Reagent | Local | Parses @mentions, resolves names, handles @all |

## Project Structure

```
.
├── client/                         # Expo / React Native (Web) app
│   ├── app/                        # Expo Router file-based routing
│   │   ├── (app)/                  # Authenticated routes
│   │   │   ├── _layout.tsx         # App shell + sidebar
│   │   │   ├── index.tsx           # Dashboard
│   │   │   ├── admin.tsx           # Admin page
│   │   │   ├── members.tsx         # Members page (consuls, capos, bookkeepers)
│   │   │   ├── operations.tsx      # Operations dashboard
│   │   │   ├── bookkeeper.tsx      # Bookkeeper browser
│   │   │   ├── commission.tsx      # Commission page
│   │   │   ├── settings.tsx        # Settings page
│   │   │   └── (sitdowns)/         # Sit-down route group
│   │   │       ├── _layout.tsx     # Sit-down layout
│   │   │       ├── sitdowns.tsx    # Sit-down list
│   │   │       └── sitdown/[id].tsx  # Sit-down detail
│   │   ├── (auth)/                 # Auth routes (login, signup, reset-password)
│   │   └── _layout.tsx             # Root layout + providers
│   ├── components/
│   │   ├── admin/                  # ModelCatalogManager, AddModelModal, UserTierManager
│   │   ├── chat/                   # ChatView, MessageBubble, MessageComposer,
│   │   │                           # MessageContent, MentionPopover, TypingIndicator
│   │   ├── commission/             # CreateCommissionSitDownModal,
│   │   │                           # InviteToCommissionModal, PendingInvitesBanner
│   │   ├── common/                 # RunYourFamilyButton
│   │   ├── layout/                 # Sidebar, MobileTabBar
│   │   ├── members/                # MemberCard, MemberEditor, CaporegimeCard,
│   │   │                           # InformantCard, InformantUsage
│   │   ├── sitdown/                # CreateSitdownModal, MemberList
│   │   ├── sitdowns/               # SitDownList, SitDownListItem
│   │   └── ui/                     # Dropdown
│   ├── config/
│   │   └── constants.ts            # Member templates, tier labels, limits
│   ├── contexts/
│   │   ├── AuthContext.tsx          # Auth state, sign-up/sign-in, profile, tier
│   │   ├── CommissionContext.tsx    # Commission contacts + realtime
│   │   └── FamilySitDownContext.tsx # Sit-down state for family view
│   ├── hooks/                      # useMembers, useSitDowns, useSitDownData,
│   │                               # useOperations, useBookkeeperEntries,
│   │                               # useInformants, useCommissionSitDowns,
│   │                               # useRealtimeStatus, useMention, etc.
│   ├── lib/
│   │   ├── cyfr.ts                 # CYFR MCP client (JSON-RPC 2.0)
│   │   ├── realtime.ts             # Supabase Realtime via CYFR
│   │   ├── realtime-hub.ts         # Centralized realtime channel manager
│   │   ├── supabase.ts             # Supabase operations via CYFR catalyst
│   │   ├── types.ts                # TypeScript types
│   │   ├── mention-parser.ts       # Client-side @mention parsing
│   │   ├── alert.ts                # Cross-platform alert utility
│   │   ├── toast.ts                # Toast notification utility
│   │   └── error-messages.ts       # User-facing error messages
│   ├── providers/
│   │   └── RealtimeProvider.tsx     # Realtime connection provider
│   ├── assets/                     # Fonts, images (banner, logo, icons)
│   ├── global.css                  # Tailwind + dark mafia theme
│   ├── metro.config.js             # Metro bundler + /cyfr dev proxy
│   └── package.json
├── components/                     # CYFR WASM components
│   ├── catalysts/
│   │   └── moonmoon69/             # (pulled from registry via cyfr pull)
│   ├── reagents/local/
│   │   └── mention-parser/0.1.0/   # @mention text parsing reagent
│   └── formulas/
│       └── local/
│           ├── admin-api/0.1.0/        # Admin operations + model catalog CRUD
│           ├── bookkeeper-api/0.1.0/   # Bookkeeper entry CRUD + search
│           ├── commission-api/0.1.0/   # Commission contact management
│           ├── family-member/0.1.0/    # Unified behavior engine
│           ├── informant-api/0.1.0/    # Informant token auth + message dispatch
│           ├── list-models/0.5.0/      # Model listing aggregation (local)
│           ├── members-api/0.1.0/      # Member CRUD + crew management
│           ├── settings-api/0.1.0/     # Profile + password management
│           └── sit-down/0.1.0/         # Sit-down operations + mention routing
├── wit/                            # WebAssembly Interface Types
│   ├── catalyst/                   # Catalyst WIT (run, http, secrets)
│   ├── formula/                    # Formula WIT (run, invoke)
│   └── reagent/                    # Reagent WIT
├── migrations/                     # Database migrations (001 through 015)
├── inform-proxy.js                 # REST-to-CYFR proxy for /inform endpoint
├── docker-compose.yml              # CYFR + inform-proxy + web build + Caddy
├── Caddyfile                       # Caddy reverse proxy config (production)
├── cyfr.yaml                       # CYFR project config
├── .env.example                    # Environment variable template
├── integration-guide.md            # CYFR integration guide
└── component-guide.md              # CYFR component guide
```

## Taking It to the Streets — Production

After completing the dev setup above, production only requires a few extra steps:

1. Set in `.env`:
   - `COMPOSE_PROFILES=caddy`
   - `SITE_DOMAIN=yourdomain.com`
2. Point your DNS A record to your server's IP
3. `cyfr up` — starts CYFR, builds the web frontend, launches the inform-proxy, and starts Caddy (auto-provisions HTTPS via Let's Encrypt)

The web frontend rebuilds automatically on every `cyfr up` — no extra build commands needed. In local dev, omit `COMPOSE_PROFILES` and only CYFR starts.

| Port | Service | Purpose |
|------|---------|---------|
| 80 | Caddy | HTTP → HTTPS redirect |
| 443 | Caddy | HTTPS (auto TLS), frontend + API proxy |
| 4000 | CYFR Emissary | MCP endpoint (internal, proxied by Caddy) |
| 4001 | CYFR Prism | Admin dashboard (not public — SSH tunnel) |
| 4002 | inform-proxy | REST-to-CYFR proxy for `/inform` (internal) |

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
- **Auth**: Supabase (direct client-side via Supabase JS)
- **AI Providers**: Claude, OpenAI, Gemini, Grok, OpenRouter (each via dedicated CYFR catalyst)
- **Realtime**: Supabase Realtime channels
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
