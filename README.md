# DePaul Library — MCP / MCP Apps / A2A Demo

A small, self-contained demo for **CSC 394 — Week 9**. It shows three things
side-by-side, backed by a fictional DePaul library catalog:

1. **An MCP server** with four tools and four resources (stdio transport).
2. **An MCP App** — a sandboxed HTML widget delivered as a UI resource and
   referenced by a tool result (`_meta.ui.resourceUri`).
3. **An A2A agent** that exposes a single skill (`build_reading_list`) with
   an Agent Card at `/.well-known/agent-card.json` over the JSON-RPC binding.

No real data is used. All books, students, due dates, and fines are made up.

---

## Prerequisites

- **Node.js 20+** (uses ES modules and `node:` builtins)
- **npm**
- One of the following MCP hosts to "see" the server interactively:
  - **GitHub Copilot in VS Code** — recommended for this course
  - **Claude Desktop** (config snippet provided below)
  - **MCP Inspector** — no host required; great for debugging

---

## Install

```powershell
cd lectures_v2\demo-library-mcp
npm install
```

---

## Run

| What | Command | Notes |
|---|---|---|
| MCP server (stdio) | `npm run mcp` | Speaks JSON-RPC over stdin/stdout. Don't run it standalone — hosts launch it. |
| A2A server (HTTP) | `npm run a2a` | Listens on `http://localhost:7042/`. |
| Smoke test the MCP server | `npm run smoke` | Spawns the server, lists tools/resources, calls a few tools. |
| MCP Inspector | `npm run inspect` | Launches the official debugger UI. |

You can leave both servers running simultaneously — they share data files but
not state.

---

## Connect from GitHub Copilot (VS Code)

> Tested with the GitHub Copilot extension's **agent mode** + MCP support.

1. Open the `lectures_v2` folder (the parent of this demo) in VS Code.
2. Create the file `lectures_v2\.vscode\mcp.json` with this content
   (adjust the path if your checkout lives elsewhere):

   ```json
   {
     "servers": {
       "depaul-library": {
         "type": "stdio",
         "command": "node",
         "args": [
           "${workspaceFolder}/demo-library-mcp/mcp-server.js"
         ]
       }
     }
   }
   ```

3. Reload VS Code. Open Copilot Chat and switch to **Agent** mode.
4. Click the tools (🛠) icon in the chat input. You should see four tools
   listed under `depaul-library`:
   - `search_books`
   - `get_student_account`
   - `list_overdue`
   - `check_out_book` (marked destructive — Copilot will ask before running)
5. Try the demo prompts below.

If Copilot says the server failed to start, run `npm run smoke` to confirm the
server itself is healthy, then check the path in `mcp.json` is correct.

### Demo prompts

```
What's on the library's featured shelf?
Find me books on distributed systems.
Who has overdue books right now?
Show me Jamal Carter's account. (his id is S-1002)
Check out "Domain-Driven Design" for student S-1003.
```

Notice that:

- The **resource browser** in Copilot's MCP panel lists `library://catalog/featured`,
  `library://policies`, `library://catalog/index`, and the UI resource
  `ui://component/student-dashboard.html`.
- `check_out_book` triggers a **confirmation prompt** because of its
  `destructiveHint` annotation.
- The `get_student_account` tool returns `structuredContent` *and*
  `_meta.ui.resourceUri` pointing at the dashboard widget — hosts that render
  MCP Apps will show the dashboard inline.

---

## Connect from Claude Desktop (optional)

Edit `claude_desktop_config.json` (location varies by OS — see Anthropic's docs):

```json
{
  "mcpServers": {
    "depaul-library": {
      "command": "node",
      "args": ["C:/Users/you/.../lectures_v2/demo-library-mcp/mcp-server.js"]
    }
  }
}
```

Restart Claude Desktop. The four tools should appear in the tools panel and
resources should be browsable.

---

## Try the MCP App rendering

The student-dashboard widget lives at `apps/student-dashboard.html`. To see
how it looks on its own (without an MCP host):

```powershell
start apps\student-dashboard.html
```

It will render with built-in fallback demo data so the visualization works
standalone. In a real host, the host injects the tool's `structuredContent`
into the iframe (e.g., via `window.openai.toolOutput`) and the widget reads
that instead.

### Host compatibility notes (late 2025 → early 2026)

MCP Apps rendering is the **fastest-moving** part of this whole stack. As of
the latest checks:

- **ChatGPT** (Apps SDK) renders MCP App widgets natively. Built directly on
  MCP; uses both `_meta.ui.resourceUri` and the legacy alias
  `_meta["openai/outputTemplate"]`.
- **VS Code / GitHub Copilot** — inline MCP App rendering has been rolling out;
  current support varies by build. The server provides the UI resource so it
  shows up either way; non-rendering hosts still get the plain text + structured
  content from the same tool call. That's the "graceful degradation" pattern.
- **Claude Desktop** — does not render MCP Apps inline at time of writing.
  HTML resources are listed and can be opened, not inlined.

When in doubt, design tools to be useful **without** the UI. The widget is a
bonus, not the contract.

---

## Try the A2A agent

Start the A2A server in one terminal:

```powershell
npm run a2a
```

Then, from another terminal, fetch the Agent Card:

```powershell
curl http://localhost:7042/.well-known/agent-card.json | jq .
```

Send a task to the `build_reading_list` skill:

```powershell
$body = @{
  jsonrpc='2.0'; id=1; method='message/send';
  params=@{ message=@{ role='user'; parts=@(@{ kind='text'; text='Build me a reading list on distributed systems for a grad seminar.' }) } }
} | ConvertTo-Json -Depth 6 -Compress

Invoke-RestMethod -Uri http://localhost:7042/ -Method Post -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 8
```

You will get back a completed `Task` with one `Artifact` containing:

- A `text` part (human-readable reading list)
- A `data` part (machine-readable JSON)

Then fetch the same task by id:

```powershell
$id = "<paste the task id from above>"
$body = @{ jsonrpc='2.0'; id=2; method='tasks/get'; params=@{ id=$id } } | ConvertTo-Json -Depth 6 -Compress
Invoke-RestMethod -Uri http://localhost:7042/ -Method Post -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 8
```

This is enough A2A to discuss every concept on the slides: **Agent Card,
Skill, Task lifecycle, Message / Part, Artifact**, all using the JSON-RPC
binding.

---

## How it maps to the lecture

| Concept from Week 9 | Where in this repo |
|---|---|
| **MCP server** with tools | `mcp-server.js` → `server.registerTool(...)` |
| **MCP server** with resources | `mcp-server.js` → `server.registerResource(...)` |
| **stdio transport** | `mcp-server.js` → `new StdioServerTransport()` |
| **Tool descriptions written for an LLM** | The `description` strings in `mcp-server.js` |
| **Destructive tool annotation** | `check_out_book` → `annotations.destructiveHint: true` |
| **MCP App / UI resource** | `apps/student-dashboard.html` + the `ui://component/...` resource |
| **MCP App linkage** | `get_student_account` returns `_meta.ui.resourceUri` |
| **A2A Agent Card** | `GET /.well-known/agent-card.json` in `a2a-server.js` |
| **A2A JSON-RPC binding** | `POST /` with `message/send` and `tasks/get` |
| **A2A Task → Artifact** | `a2a-server.js` → `newTask(...)` |
| **Fake data layer (separation of concerns)** | `data/library.js` — same data, two interfaces |

---

## Troubleshooting

- **"Cannot find module '@modelcontextprotocol/sdk/...'"** — run `npm install`
  in this directory.
- **Copilot doesn't see the server** — check the absolute path in your
  `mcp.json`, then run `npm run smoke` to confirm the server starts cleanly.
- **Port 7042 already in use** — set `A2A_PORT=NNNN` before `npm run a2a`.
- **`check_out_book` always succeeds twice in a row** — state is in-memory.
  Restart the MCP server to reset the catalog.

---

## What this demo deliberately leaves out

So you know where the surface is thin:

- **No OAuth.** The MCP server is stdio (implicit auth) and the A2A server is
  unauthenticated. A real deployment would use OAuth 2.1 (MCP HTTP) and a
  declared security scheme in the Agent Card.
- **No persistence.** All state lives in process memory.
- **No real agent logic.** The A2A "agent" doesn't call an LLM — it parses
  text with regex. That keeps the focus on the protocol shape.
- **No streaming.** Both servers return whole responses. Production-grade
  versions would stream long tool results and long tasks.

These are exactly the dimensions you'd extend in a capstone build.
