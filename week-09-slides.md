---
marp: true
theme: default
paginate: true
header: 'CSC 394 — Week 9'
footer: 'Building LLM Systems: MCP and A2A'
---

<!-- _class: lead -->

# Week 9: Building LLM Systems
## MCP Servers and A2A

### CSC 394 — Software Projects
#### DePaul University

---

# Today's Agenda

1. **Why protocols?** The M × N integration problem
2. **MCP concepts** — roles, primitives, lifecycle
3. **Implementing an MCP server** — the how-to
4. **MCP best practices**
5. **MCP in Claude Code, Copilot, ChatGPT**
6. **MCP use cases**
7. **A2A concepts** — Agent Cards, tasks, artifacts
8. **Implementing an A2A agent**
9. **A2A best practices and use cases**
10. **MCP vs. A2A** — how they stack
11. **Design exercise** for your capstone

---

# The M × N Problem

> M apps × N systems = too many bespoke integrations.

- M = Claude, Copilot, ChatGPT, Cursor, your chatbot…
- N = GitHub, Jira, your DB, your data warehouse…
- Without a protocol: every host re-implements every connector.
- Same problem **HTTP** solved for browsers, **LSP** for editors, **ODBC** for databases.

Two protocols emerged in 2024–2025 to solve different halves.

---

# Two Complementary Protocols

|  | **MCP** | **A2A** |
|---|---|---|
| Announced | Anthropic, Nov 2024 | Google, Apr 2025 |
| Connects | LLM app ↔ tools & data | Agent ↔ agent |
| Granularity | One tool = one function | Coarse skills, multi-turn |
| Caller | Model (inside a host) | Another agent |

They are **complementary**, not competing.

---

<!-- _class: lead -->

# Part 1: MCP — Model Context Protocol

---

# MCP: The Three Roles

| Role | What it is | Examples |
|---|---|---|
| **Host** | The LLM app the user sees. Owns the model + trust. | Claude Desktop, VS Code Copilot, ChatGPT |
| **Client** | Connector inside the host. 1:1 with a server. | The piece of Claude that talks to "GitHub MCP" |
| **Server** | Process exposing tools/resources/prompts. | Your code |

The **model never speaks MCP** — the host translates.

---

# The Five Primitives (+ Roots)

| Primitive | Who invokes | Purpose |
|---|---|---|
| **Tools** | Model (with host approval) | Do things; may have side effects |
| **Resources** | App / user | Provide readable context |
| **Prompts** | User | Reusable templates (slash commands) |
| **Sampling** | Server → host | Server asks host's LLM to generate |
| **Elicitation** | Server → user | Server asks user for structured input |

**Roots**: host tells server which URIs it may touch.
Note: tools/resources/prompts are *server* primitives; sampling/elicitation are *client* capabilities the server may invoke.

---

# Transport and Wire Format

- Wire format: **JSON-RPC 2.0**.
- Two standard transports:
  - **stdio** — host spawns server as subprocess. Local tools. Implicit auth.
  - **Streamable HTTP** — JSON-RPC over HTTPS + SSE. Remote. OAuth 2.1.
- Older "HTTP+SSE" transport exists; new servers should target Streamable HTTP.

---

# MCP Session Lifecycle

1. **Initialize** — exchange protocol version + capabilities.
2. **List** — `tools/list`, `resources/list`, `prompts/list`.
3. **Invoke** — `tools/call`, `resources/read`, …
4. **Notify** — change notifications, progress updates.
5. **Shutdown** — clean close.

The same shape for every server, every host.

---

<!-- _class: lead -->

# Implementing an MCP Server

---

# Step 0: Design Before You Code

Write a **one-page server design** that answers:

1. **Who is the user?** Developer in an IDE? End user?
2. **What system are you wrapping?** One bounded context per server.
3. **Which primitives?** Tools, resources, prompts — pick what fits.
4. **Local or remote?** stdio for personal/dev; HTTP for SaaS.
5. **Trust boundary?** Auth, scopes, destructive ops, secrets.

---

# Pick an SDK

Official SDKs: **TypeScript, Python, Go, C#/.NET, Java, Kotlin, Swift, Ruby, Rust**.

The pattern is the same across all of them — declare tools, resources, prompts; connect a transport. Tier and feature parity vary; check protocol version per SDK.

```ts
const server = new McpServer({ name: "weather", version: "1.0.0" });

server.tool("get_forecast",
  { city: z.string(), days: z.number().int().min(1).max(7) },
  async ({ city, days }) => fetchForecast(city, days)
);

await server.connect(new StdioServerTransport());
```

---

# Designing a Tool — Three Surfaces

| Part | Why it matters |
|---|---|
| **Name** | Model reads this to decide whether to call. Verb+noun. Stable. |
| **Description** | The model's only docs. Write **for an LLM** — when to call, what it returns, what it doesn't do. |
| **Input schema** | JSON Schema. Validates *before* your code runs. Be strict. |

Plus: read vs. write, idempotency, output shape, error contract.

---

# Resources vs. Tools

- **Tool** = the model can call it. Side effects OK.
- **Resource** = the *host* can attach it to context. Read-only data with a URI.
- **Prompt** = a *user*-triggered template (slash command).

> Rule of thumb: "let the model search my DB" → **tool**.
> "let the user pin a database table into chat" → **resource**.

---

# Auth, Secrets, Multi-Tenancy

- **stdio**: inherit user env. Read keys from env vars or OS keychain.
- **HTTP**: OAuth 2.1 is the recommended path. Validate bearer tokens, **check the audience**, use **PKCE**.
- **Local HTTP**: validate `Origin` and bind to loopback — defends against DNS rebinding.
- **Never accept secrets as tool args** — they'd land in chat logs.
- **Derive tenant from the token**, never from arguments. The model can be tricked.

---

# Versioning Your Server

- Advertise a server version at handshake.
- Treat tool schemas as a **public API**.

| Change | OK? |
|---|---|
| Add new tool | ✅ Free |
| Add optional parameter | ✅ Free |
| Add required parameter | ⚠️ Major bump |
| Rename / remove tool | ⚠️ Major bump + deprecation |

User prompts and host configs pin to tool names.

---

# Observability

**Log every call:**
- Tool name, caller identity, request ID, duration, success/error.
- Input *size* (not necessarily content — PII).
- Whether it was a retry.

**Metrics to expose:**
- p50/p95/p99 latency per tool.
- Error rate per tool, per host.
- Bytes/tokens returned (host's cost driver).

---

<!-- _class: lead -->

# MCP Best Practices

---

# Tool Design Best Practices

- **Fewer, sharper tools** beat many overlapping ones.
- **Self-documenting names**: `cancel_subscription_with_refund` > `cancel(flag=true)`.
- **Default to read-only**; add writes only with confirmation UX.
- **Return *just enough* data** — paginate big lists.
- **Prefer structured output** — JSON the model can index into.

---

# Security Best Practices

- Tool arguments are **untrusted input**. The model is a confused deputy.
- No path traversal, SQL concat, or shell `exec` inside a tool.
- Mark destructive tools clearly — hosts will gate them.
- Honor `roots`. Refuse paths outside.
- Never echo secrets back. Redact in resources.

---

# Performance & Reliability

- **Use progress + partial results** — MCP supports progress notifications and server-streamed messages. Don't assume token-level streaming uniformly.
- **Implement cancellation** so users can stop runaway calls.
- **Set timeouts** — per call and per session.
- **Cache** resource reads where appropriate.

Long, blocking tool calls are the #1 source of bad LLM UX.

---

# Testing Your Server

- **MCP Inspector** — official click-every-tool debugger. Use it *before* wiring to a real host.
- **Golden tests** — store (input → expected output) pairs per tool, run in CI.
- **Schema tests** — confirm bad input is rejected.
- **Host integration smoke test** — at minimum in one real host before each release.

---

# Documentation Has Two Audiences

1. **The LLM** — tool & parameter descriptions. Assume the model has never seen your product.
2. **Humans** — README with install, host config snippet, required scopes/secrets.

Tool descriptions are **product surface**, not afterthoughts.

---

<!-- _class: lead -->

# MCP in Claude Code, Copilot, ChatGPT

---

# Claude Desktop & Claude Code

- **Config**: `claude_desktop_config.json`, or per-project `.mcp.json`.
- **Transports**: stdio first-class; remote Streamable HTTP w/ OAuth.
- **Scopes** (Claude Code): user / project / local.
- **UX**: tools → model-callable; resources → attachment menu; prompts → slash commands.
- Destructive tools prompt the user.

---

# GitHub Copilot (VS Code, JetBrains, CLI)

- **Config**: workspace or user `mcp.json`; curated registry.
- **Transports**: stdio + Streamable HTTP with OAuth brokered by the host.
- **Where**: tools show up in **agent mode**; user can toggle per-chat.
- Workspace-trust gating + per-tool confirmation prompts.
- Copilot coding agent and Copilot CLI can reuse the same MCP server *configurations*, but supported transports and capabilities differ per surface — confirm in each.

---

# ChatGPT

- MCP via **connectors** — registered against a remote MCP server URL with OAuth.
- **Streamable HTTP only** — no stdio in a hosted product.
- Surfaces as connectors users enable per conversation, and as Deep Research data sources.
- **Implication**: ChatGPT-compatible servers must be hosted + OAuth-capable.

---

# Portability Promise — and Caveats

The same MCP server *can* work everywhere. In practice:

- **Auth** is the hardest portability problem.
- **Tool UX** varies — confirmation, streaming, resource rendering.
- **Capability support** varies — sampling, elicitation are not universal.

> Design for the lowest-common-denominator host you care about, then progressively enhance.

---

# MCP Use Cases

| Category | Examples |
|---|---|
| Developer tooling | git, GitHub, filesystem, language servers |
| Data access | Postgres, Snowflake, S3, vector DBs |
| SaaS connectors | Jira, Linear, Slack, Notion, Salesforce |
| Browser & web | Playwright, fetchers, search APIs |
| Internal platforms | deploy systems, feature flags, observability |
| Personal automation | calendar, email, home assistant |

Pattern: any LLM ↔ X integration is a candidate for an MCP server.

---

<!-- _class: lead -->

# Interlude: MCP Apps

When tools need a UI

---

# What Are MCP Apps?

An MCP server can attach an **interactive HTML/JS component** to a tool result. A supporting host renders it inline alongside chat — sandboxed and scoped.

- **ChatGPT Apps (Apps SDK)** — Oct 2025, first widely-shipped implementation. Built directly on MCP.
- **MCP UI / "Apps"** — community effort to standardize the same pattern across hosts.
- The model still drives. The component is what the *user* sees and clicks.

---

# How an MCP App Is Wired Up

Reuse all of MCP, add three things:

1. **A UI resource** — HTML at e.g. `ui://component/dashboard.html` with MIME `text/html;profile=mcp-app`.
2. **A tool that references it** — tool's `_meta.ui.resourceUri` points at the resource. (ChatGPT also accepts the legacy alias `_meta["openai/outputTemplate"]`.)
3. **A host ↔ component bridge** — sandboxed iframe gets a `ui/*` JSON-RPC API (and `window.openai` in ChatGPT) to read structured content, call MCP tools, request follow-up turns, persist state.

---

# Designing MCP Apps Well

- **Pick the right surface.** Add UI when output (chart, map, dashboard) or input (form, picker, confirmation) is clunky as text.
- **Degrade gracefully.** Always return useful `structuredContent` too — non-Apps hosts still get a sensible answer.
- **Thin client.** No business logic in the iframe — call back to MCP tools for data and writes.
- **Mind the network boundary.** Outbound calls governed by CSP + declared domains.
- **Version your UI URIs.** Cache-bust on each release.

---

# MCP Apps vs. Plain Tools

| Question | Plain tool | MCP App |
|---|---|---|
| User has to *do* something? | Awkward | Natural |
| Model can chain the output? | Yes | Yes (via `structuredContent`) |
| Portable across all MCP hosts? | Yes | Only on hosts that render Apps |
| Right for charts / maps / forms? | No | Yes |

---

# Trade-offs to Be Honest About

- **Portability today is uneven** — host support is moving fast; check current docs.
- **You're now also a front-end engineer.** Components need design, accessibility, CSP, dep hygiene.
- **Auth & tenancy stay on the server.** Model and component are both *clients* — never trust either to enforce permissions.

> If your value is data the model reasons over → plain tool.
> If your value is something the user sees or interacts with → MCP App.

---

<!-- _class: lead -->

# Part 3: A2A — Agent-to-Agent

---

# Why A2A?

You run:
- A travel agent on LangChain
- An expense agent on Copilot Studio
- A calendar agent from a vendor

You want a fourth agent to **coordinate** them.

Without a protocol → 3 custom integrations. With **A2A** → each advertises an **Agent Card**; any A2A client can discover and delegate.

Introduced by **Google (Apr 2025)**, governed by the **Linux Foundation** since mid-2025.

---

# A2A Is Opaque About Internals

The calling agent does **not** see the called agent's:

- Prompts
- Model
- Tools
- Memory

It sees only the contract: **skills, inputs, outputs, lifecycle**.

This is what makes cross-vendor delegation safe.

---

# A2A Core Concepts

| Concept | Meaning |
|---|---|
| **Agent Card** | JSON at `/.well-known/agent-card.json`. Name, skills, endpoints, auth. The "menu". |
| **Skill** | Named capability — coarse-grained, often multi-turn. |
| **Task** | Unit of work. Lifecycle: `submitted → working → input-required → completed/failed/canceled`. Also: `auth-required`, `rejected`. |
| **Message / Part** | A turn; carries text, file, or structured data parts. |
| **Artifact** | Durable output of a task (PDF, patch, dataset). |
| **Push notification** | Webhook for async progress. |

---

# A2A Transport — Multiple Bindings

- **Transport-agnostic** by design: choose one binding
  - **JSON-RPC 2.0** over HTTP(S)
  - **gRPC** binding
  - **HTTP+JSON / REST** binding
- **SSE** layered for streaming responses
- **Webhooks** for push notifications on long tasks
- **Auth**: whatever HTTP supports — OAuth, API keys, mTLS — **declared in the Agent Card**.

> This lecture uses the JSON-RPC binding for examples.

---

# A2A Collaboration Lifecycle

1. **Discover** — fetch Agent Card.
2. **Authenticate** — per scheme in the card.
3. **Send task** — `message/send` or `message/stream`.
4. **Iterate** — agent may go `input-required`; respond.
5. **Receive artifacts** — durable outputs.
6. **Close** — `completed` / `failed` / `canceled`.

---

<!-- _class: lead -->

# Implementing an A2A Agent

---

# Server Side: Expose Your Agent

1. **Write the Agent Card.** Choose which skills to expose — not every internal capability.
2. **Pick modes.** Text only? Files? Structured JSON? Streaming?
3. **Implement endpoints** for your binding — JSON-RPC `message/send`, `message/stream`, `tasks/get`, `tasks/cancel`; REST `POST /message:send`, `GET /tasks/{id}`; or the gRPC equivalents. Use an SDK.
4. **Choose auth.** API keys (internal) or OAuth / JWT (cross-org).
5. **Push notifications** for long tasks.
6. **Serve the card** at `/.well-known/agent-card.json`.

---

# Client Side: Call Other Agents

1. **Registry of known agents** — list, catalog, or discovery service.
2. **Fetch & cache Agent Cards.** Refresh periodically.
3. **Treat remote agents as a tool type** in your planner — often surfaced as an MCP tool.
4. **Handle `input-required`** — bubble up or answer from context.
5. **Propagate user identity carefully** — OBO tokens when acting as the user.

---

# Design Decisions That Matter

- **Coarse vs. fine skills.** A2A skill = "plan a trip", not "look up an airport code".
- **Sync vs. async.** Long task? Streaming + push notifications from day one.
- **State boundary.** What lives in the remote agent vs. what the client passes every call.

---

<!-- _class: lead -->

# A2A Best Practices

---

# Agent Card Hygiene

- **Write skills for an LLM reader.** Like MCP tool descriptions, the card is documentation a delegating LLM reads.
- **Don't lie.** If you can't really do X, don't list X — real requests will be routed to you.
- **Version the card.** Bump on breaking changes; clients can pin.

---

# Safety and Trust

- **Authenticate every request** — never trust a caller's identity claim alone.
- **Re-authorize on the user's behalf** — check the *human* can do this, not just the calling agent.
- **End-to-end task correlation IDs** — cross-agent debugging is impossible without them.
- **Treat agent responses as untrusted input** — prompt-injection crosses agent boundaries.

---

# Operational Concerns

- **Per-skill quotas and rate limits.** A misbehaving caller can DDoS via task creation.
- **Cancellation must actually cancel.** Don't keep burning tokens.
- **Surface cost.** Return cost metadata in artifacts so callers can budget.

---

# A2A Use Cases

| Use case | Why A2A fits |
|---|---|
| Vendor-built specialist agents | Collaborate without sharing source. |
| Cross-team agents inside a company | Each team owns its stack. |
| Marketplaces of agents | Agent Card = marketplace listing. |
| Long-running, human-in-the-loop | Native lifecycle for `input-required` and async. |
| Multi-modal hand-offs | Pass image → vision agent → structured artifact. |

---

# MCP vs. A2A at a Glance

| Aspect | MCP | A2A |
|---|---|---|
| Connects | LLM app ↔ tools | Agent ↔ agent |
| Granularity | Fine: 1 tool = 1 function | Coarse: skills span turns |
| Caller | Model in a host | An agent client |
| State | Mostly stateless | Stateful tasks |
| Discovery | List APIs at session start | Agent Card at well-known URL |
| Transport | stdio or Streamable HTTP | HTTP with JSON-RPC, REST, or gRPC bindings |

---

# How They Stack

```
[ User ]
   │
[ Host application + LLM ]
   │  speaks MCP to tools
   ├──► [ MCP server: filesystem ]
   ├──► [ MCP server: postgres  ]
   └──► [ MCP server: "delegate to agent" ]
            │  speaks A2A
            ├──► [ Remote agent: travel ]
            └──► [ Remote agent: expenses ]
                    └── uses MCP internally
```

**MCP**: how an agent uses tools.
**A2A**: how an agent uses another agent.

---

<!-- _class: lead -->

# Putting It Together

---

# Which Protocol Do I Build?

Ask, in order:

1. Tool/data source for hosts you don't own? → **MCP server**.
2. Self-contained agent for other agents to call? → **A2A agent**.
3. Building the host? → **Consume both**.
4. One-shot internal feature for one app? → **Maybe neither** yet.

Use protocols when you need **portability, decoupling, or third-party reach**.

---

# Capstone Design Exercise

Sketch for your project:

1. One **MCP server** exposing your app's data + actions to an LLM (3–5 tools, 0–3 resources).
2. *(Optional)* One **A2A skill** other agents could delegate to you.
3. The **trust model**: who authenticates, what scopes, what is destructive.

Bring it to next class.

---

<!-- _class: lead -->

# Live Demo

DePaul Library — MCP + MCP App + A2A

---

# What the Demo Contains

`demo-library-mcp/` in the lectures repo — all three layers, one fake catalog.

- **MCP server** (stdio): `search_books`, `get_student_account`, `list_overdue`, `check_out_book` + 4 resources.
- **MCP App**: student dashboard at `ui://component/student-dashboard.html`, referenced by `_meta.ui.resourceUri`.
- **A2A agent**: Agent Card at `/.well-known/agent-card.json`; skill `build_reading_list` over JSON-RPC.
- Shared **fake data layer** — same domain, two interfaces.
- Smoke test + MCP Inspector launcher included.

---

# Connecting the Demo to Copilot

Drop this in `.vscode/mcp.json`, reload, switch Copilot Chat to **Agent** mode:

```json
{
  "servers": {
    "depaul-library": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/demo-library-mcp/mcp-server.js"]
    }
  }
}
```

Then try: *"What's on the featured shelf?"* · *"Who has overdue books?"* · *"Check out DDD for S-1003."*

---

# Key Takeaways

- LLM apps are **orchestrators** of tools and agents — not monoliths.
- **MCP** = LLM ↔ tools/data. Small set of well-defined primitives.
- **A2A** = agent ↔ agent. Coarse skills, explicit task lifecycle.
- The hard parts are **auth, safety, confirmation UX**.
- Treat tool descriptions and Agent Cards as **product surface**.
- **Pin the protocol version** — both specs evolved rapidly in 2024–2025.
- Use SDKs. Use the Inspector. Test before shipping.

---

# Further Reading

- **MCP** — `modelcontextprotocol.io`, official spec + SDKs.
- **MCP Inspector** — `github.com/modelcontextprotocol/inspector`.
- **A2A** — `a2a-protocol.org`, Linux Foundation A2A project.
- Anthropic / GitHub / OpenAI engineering blogs on host-side MCP.

---

<!-- _class: lead -->

# Questions?

### Reflection
*Pick one host (Claude Code / Copilot / ChatGPT) and one external system you actually use. If you had a week to build the MCP server, what would the first three tools be — and which would be destructive vs. read-only?*
