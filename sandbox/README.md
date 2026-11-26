# Claude Coding Agent Sandbox Service

A high-performance **FastAPI** backend service for interacting with Claude coding agents using the **Claude Agent SDK** (`claude-agent-sdk`). Built for containerized per-developer pod environments with **multi-repository sandbox management**, automated **remote Git repository cloning**, **`code-server`** (VS Code web) multi-root integration, and **real-time Server-Sent Events (SSE)** streaming.

---

## Architecture Overview: One Ticket / Task → One Sandbox (Multi-Repo)

Each developer sandbox pod is designed to support single or multiple Git repositories residing under `/workspace/<repo_name>`:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        Developer Pod (Ticket Sandbox e.g. AUTH-1024)                   │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                     FastAPI Agent Service (Port 8000)                            │  │
│  │                                                                                  │  │
│  │  ┌──────────────────────┐  ┌─────────────────────┐  ┌─────────────────────────┐  │  │
│  │  │   Session Manager    │  │    Agent Runner     │  │  Workspace Git Manager  │  │  │
│  │  │  - Multiple sessions │  │  - Claude SDK Loop  │  │  - Multi-repo cloning   │  │  │
│  │  │  - Target repo cwd   │  │  - Rich SSE Stream  │  │  - Isolated diff/status │  │  │
│  │  │  - add_dirs resolver │  │  - Tool approvals   │  │  - .code-workspace gen │  │  │
│  │  └──────────┬───────────┘  └──────────┬──────────┘  └────────────┬────────────┘  │  │
│  │             │                         │                          │               │  │
│  │             ▼                         ▼                          ▼               │  │
│  │       ┌──────────────────────────────────────────────────────────────┐           │  │
│  │       │                   Claude Agent SDK Runner                    │           │  │
│  │       │  - Primary cwd: /workspace/auth-service                      │           │  │
│  │       │  - add_dirs: [/workspace/gateway-service, ...]               │           │  │
│  │       │  - Tools: Read, Edit, Write, Glob, Grep, Bash                │           │  │
│  │       └──────────────────────────────┬───────────────────────────────┘           │  │
│  └──────────────────────────────────────┼───────────────────────────────────────────┘  │
│                                         │                                              │
│                                         ▼                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                         Shared Workspace (`/workspace`)                          │  │
│  │                                                                                  │  │
│  │   ├── workspace.code-workspace  (Unified multi-root configuration for VS Code)   │  │
│  │   ├── auth-service/             (Primary repo: hotfix/AUTH-1024 branch)          │  │
│  │   │   ├── .git/                                                                  │  │
│  │   │   └── src/...                                                                │  │
│  │   └── gateway-service/          (Secondary repo: master branch)                  │  │
│  │       ├── .git/                                                                  │  │
│  │       └── src/...                                                                │  │
│  └──────────────────────────────────────▲───────────────────────────────────────────┘  │
│                                         │ Shared Mount                                 │
│  ┌──────────────────────────────────────┴───────────────────────────────────────────┐  │
│  │                     code-server Instance (Port 8080)                             │  │
│  │   - Full VS Code web IDE displaying all cloned repositories in explorer tree     │  │
│  │   - Real-time file sync with Claude edits across all repositories                │  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Multi-Repo Capabilities:
1. **Ticket-to-Sandbox Alignment**: Spin up a pod for a specific ticket (e.g. `AUTH-1024`) with all necessary services cloned into `/workspace/<repo>`.
2. **Multiple Sessions per Sandbox**: Create and switch between multiple Claude sessions in the same sandbox pod, each potentially focusing on a different `target_repo`.
3. **Cross-Repo Intelligence**: Claude's `effective_cwd` is set to the primary repository while all other cloned repositories are passed via `add_dirs`. Claude can read, grep, compare, and modify code across all services.
4. **Unified VS Code Multi-Root Workspace**: The system dynamically maintains `/workspace/workspace.code-workspace`. Opening code-server displays all cloned repositories side-by-side in the file explorer.
5. **Per-Repository Git Operations**: Separate endpoints allow querying git status, isolated diffs, and branch creation/checkouts per repository.

---

## Quickstart

### 1. Local Environment

```bash
# 1. Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Set your Anthropic API Key in .env
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY=your_key_here

# 4. Start the service
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The interactive Swagger documentation is available at: `http://localhost:8000/docs`

---

### 2. Containerized Pod (Docker Compose)

The Dockerfile packages **Python 3.12**, **Node.js 20**, **Claude Code CLI** (`@anthropic-ai/claude-code`), **supervisord**, the **FastAPI Agent Service**, and **`code-server`** running as the non-root `developer` user:

```bash
# Build and start developer pod
cd docker
docker-compose up --build -d
```

- **FastAPI Agent Service**: `http://localhost:8000`
- **Interactive API Docs**: `http://localhost:8000/docs`
- **code-server (VS Code web)**: `http://localhost:8080`

---

## API Reference

### 1. Multi-Repo Workspace Management (`/api/repos`)

#### `GET /api/repos`
List all cloned repositories in the workspace, their active branches, dirty status, commit hashes, and `.code-workspace` file location.

**Response:**
```json
{
  "workspace_dir": "/workspace",
  "repositories": [
    {
      "name": "auth-service",
      "path": "/workspace/auth-service",
      "git_url": "https://github.com/org/auth-service.git",
      "branch": "hotfix/AUTH-1024",
      "is_clean": false,
      "modified_files_count": 1,
      "latest_commit": {
        "hash": "a1b2c3d4",
        "message": "Fix authentication token expiry",
        "author": "Alice Developer",
        "date": "2026-09-07 10:00:00 +0000"
      }
    },
    {
      "name": "gateway-service",
      "path": "/workspace/gateway-service",
      "git_url": "https://github.com/org/gateway-service.git",
      "branch": "master",
      "is_clean": true,
      "modified_files_count": 0,
      "latest_commit": { ... }
    }
  ],
  "code_workspace_file": "/workspace/workspace.code-workspace"
}
```

#### `POST /api/repos`
Clone a repository into `/workspace/<repo_name>` and automatically update `workspace.code-workspace`.

**Request Body:**
```json
{
  "git_url": "https://github.com/org/auth-service.git",
  "branch": "master",
  "create_branch": "hotfix/AUTH-1024",
  "repo_name": "auth-service"
}
```

#### `GET /api/repos/{repo_name}/git-status`
Get Git status (branch, modified/staged/untracked files) specifically for `/workspace/{repo_name}`.

#### `GET /api/repos/{repo_name}/git-diff`
Get the isolated unified git diff of uncommitted changes inside `/workspace/{repo_name}`.

#### `POST /api/repos/{repo_name}/git-checkout`
Checkout or create a branch in `/workspace/{repo_name}`:
```json
{
  "branch": "hotfix/AUTH-1024",
  "create_if_missing": true
}
```

---

### 2. Sessions (`/api/sessions`)

#### `POST /api/sessions`
Initialize a session within the sandbox pod. You can batch-clone multiple repos or target an existing repo.

**Request Body (Multi-Repo & Ticket Support):**
```json
{
  "ticket_id": "AUTH-1024",
  "target_repo": "auth-service",
  "session_name": "Hotfix Auth Expiry",
  "model": "haiku",
  "permission_mode": "acceptEdits",
  "repos": [
    {
      "git_url": "https://github.com/org/auth-service.git",
      "branch": "master",
      "create_branch": "hotfix/AUTH-1024"
    },
    {
      "git_url": "https://github.com/org/gateway-service.git",
      "branch": "master"
    }
  ]
}
```

**Response (`201 Created`):**
```json
{
  "session_id": "9a77ca51-456a-4a9d-b112-ff4ab18eb0ce",
  "session_name": "Hotfix Auth Expiry",
  "ticket_id": "AUTH-1024",
  "target_repo": "auth-service",
  "workspace_dir": "/workspace",
  "repos": ["auth-service", "gateway-service"],
  "created_at": 1788784095.8
}
```

#### `POST /api/sessions/{session_id}/messages`
Send an instruction or prompt to Claude.

**Query Parameters:**
- `stream=true` *(default)*: Returns real-time Server-Sent Events (`text/event-stream`).
- `stream=false`: Waits for the turn to complete and returns a synchronous JSON response.

**Request Body:**
```json
{
  "prompt": "Inspect the auth token verification in auth-service and check how gateway-service calls it.",
  "allowed_tools": ["Read", "Edit", "Write", "Glob", "Grep", "Bash"]
}
```

#### `POST /api/sessions/{session_id}/interrupt`
Interrupt an active agent turn immediately.

#### `GET /api/sessions`
List past sessions, summaries, and branches.

#### `GET /api/sessions/{session_id}`
Retrieve session metadata (including `ticket_id`, `target_repo`, `repos`) and conversation message history.

---

### 3. IDE & code-server Integration (`/api/ide/config`)

#### `GET /api/ide/config`
Returns `code-server` connection details and the `code_workspace_file` path:
```json
{
  "code_server_url": "http://localhost:8080",
  "workspace_dir": "/workspace",
  "code_workspace_file": "/workspace/workspace.code-workspace",
  "status": "available"
}
```

---

## Server-Sent Events (SSE) Protocol

When `stream=true`, events are emitted as standard `text/event-stream`.

### Event Structure
```
event: <event_name>
data: {"session_id": "...", ...}

```

### Event Types

| Event Name | Description | Payload Data Fields |
| :--- | :--- | :--- |
| `session_init` | Fired when query starts | `session_id`, `prompt`, `model`, `workspace_dir`, `ticket_id`, `target_repo`, `repos`, `timestamp` |
| `thinking` | Claude reasoning/thinking block | `thinking`, `signature`, `timestamp` |
| `tool_use` | Agent invokes a tool | `tool_use_id`, `name` (`Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`), `input` |
| `tool_result` | Tool output / stderr | `tool_use_id`, `output`, `is_error`, `timestamp` |
| `text` | Claude conversational text | `text`, `timestamp` |
| `status` | Progress or state update | `status`, `message`, `timestamp` |
| `result` | Agent completes the turn | `subtype`, `result`, `total_cost_usd`, `duration_ms`, `num_turns` |
| `error` | Error or exception occurred | `error`, `timestamp` |

---

## Testing

Run unit and integration tests:

```bash
source .venv/bin/activate
pytest -v
```

