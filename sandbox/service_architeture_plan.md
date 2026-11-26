# Claude Coding Agent Service: Architecture & Implementation Plan

This document outlines the architecture, framework selection, and implementation plan for building a backend service that allows posting messages to a Claude coding agent using the **Claude Agent SDK** (`claude-agent-sdk`), equipped with a git-enabled workspace sandbox.

---

## 1. Framework Evaluation: FastAPI vs. Flask

### Recommendation: **FastAPI (Recommended)**

| Feature / Requirement | **FastAPI** | **Flask** |
| :--- | :--- | :--- |
| **Async Architecture** | Native ASGI with first-class `asyncio` event loop. Perfect match for `claude-agent-sdk` (`query()` returns an `AsyncIterator`, and `ClaudeSDKClient` is async-native). | Traditionally WSGI (synchronous). Flask 2.0+ wraps async views in `asyncio.run()`, which creates/destroys event loops per request, breaking long-lived async clients. |
| **Real-Time Streaming (SSE)** | Built-in `StreamingResponse` (`text/event-stream`). Directly streams agent thoughts, tool calls, and outputs as they happen. | Clunky and resource-heavy for streaming; requires custom generators with gevent/Gunicorn or Quart. |
| **Session & Concurrency** | Non-blocking execution. An agent run taking 30–60 seconds won't block worker threads or prevent other requests. | Blocking by default; requires multiple threads or worker processes that quickly exhaust under load. |
| **Data Validation & Typing** | Built-in Pydantic v2 validation for incoming requests and outgoing agent responses. | Requires external libraries (e.g. Marshmallow) and manual validation wiring. |
| **Interactive API Docs** | Auto-generated OpenAPI / Swagger UI at `/docs`. | Requires third-party plugins (e.g. Flask-RESTX or flasgger). |

**Conclusion**: **FastAPI** is the optimal framework because the Claude Agent SDK is intrinsically asynchronous and agent interactions are inherently streaming and multi-turn.

---

## 2. System Architecture

```
                                  ┌────────────────────────────────────────┐
                                  │           Client / Frontend            │
                                  └────┬─────────────────────────────▲─────┘
                                       │ POST /sessions              │
                                       │ POST /sessions/{id}/messages│ SSE Stream / JSON
                                       ▼                             │
┌────────────────────────────────────────────────────────────────────┴─────┐
│                          FastAPI Agent Service                           │
│                                                                          │
│  ┌─────────────────────────┐   ┌──────────────────────────────────────┐  │
│  │   Session Manager       │   │           Workspace Manager          │  │
│  │  - Manages active client│   │  - Configures git repo directory     │  │
│  │  - Session resumption   │   │  - Handles git status, diff, branch  │  │
│  │  - Interruption handler │   │  - Sandboxed execution path (cwd)    │  │
│  └───────────┬─────────────┘   └──────────────────┬───────────────────┘  │
│              │                                    │                      │
│              └─────────────────┬──────────────────┘                      │
│                                ▼                                         │
│                 ┌──────────────────────────────┐                         │
│                 │   Claude Agent SDK Runner    │                         │
│                 │  - ClaudeAgentOptions        │                         │
│                 │  - ClaudeSDKClient / query() │                         │
│                 │  - Built-in & Custom Tools   │                         │
│                 │  - Permission Mode           │                         │
│                 └──────────────┬───────────────┘                         │
└────────────────────────────────┼─────────────────────────────────────────┘
                                 │ Subprocess / CLI
                                 ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                   Sandbox Workspace (Git Repository)                    │
│                                                                          │
│   ├── .git/                                                              │
│   ├── src/ & files (Read, Edit, Write)                                   │
│   └── Bash execution (git commit, git diff, pytest, npm test, etc.)      │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Components

1. **Workspace & Git Manager**:
   - Manages the target working directory (`cwd`) passed to `ClaudeAgentOptions(cwd=...)`.
   - Verifies git repository initialization, tracks git branches, staging status, and uncommitted diffs.
   - Allows dynamically setting or pointing to a specific repository workspace.

2. **Session Manager**:
   - Handles session creation, resumption (`resume=session_id`), and tracking.
   - Integrates with the SDK's built-in session functions (`list_sessions()`, `get_session_info()`, `get_session_messages()`).
   - Supports active session pooling for `ClaudeSDKClient` (enabling real-time `interrupt()`).

3. **Agent Runner (Streaming & Synchronous)**:
   - **Streaming Mode (SSE)**: Streams events (`message_start`, `reasoning`, `tool_use`, `tool_result`, `result`) as Server-Sent Events to the client.
   - **Sync/Buffered Mode**: Collects messages until the turn finishes and returns a consolidated JSON payload.
   - Configures `ClaudeAgentOptions`:
     - `allowed_tools`: `["Read", "Edit", "Write", "Glob", "Grep", "Bash"]`
     - `permission_mode`: `"acceptEdits"` (or configurable `"bypassPermissions"` for isolated container sandboxes).

---

## 3. Proposed REST API Specification

### `POST /api/sessions`
Create a new agent session initialized in a specified or default git workspace.
- **Request Body**:
  ```json
  {
    "workspace_dir": "/path/to/workspace",
    "initial_prompt": "Optional initial prompt",
    "permission_mode": "acceptEdits",
    "model": "claude-3-7-sonnet-20250219"
  }
  ```
- **Response**: `201 Created` with `session_id`, `workspace_dir`, `created_at`.

---

### `POST /api/sessions/{session_id}/messages`
Post a message to an agent session.
- **Query Parameter**: `stream=true|false` (default: `true`)
- **Request Body**:
  ```json
  {
    "prompt": "Fix the bug in src/auth.py and run the unit tests",
    "allowed_tools": ["Read", "Edit", "Write", "Glob", "Grep", "Bash"]
  }
  ```
- **Response**:
  - If `stream=true`: `text/event-stream` yielding SSE chunks:
    ```
    event: thinking
    data: {"text": "Analyzing the issue in auth.py..."}

    event: tool_use
    data: {"name": "Read", "input": {"file_path": "src/auth.py"}}

    event: tool_result
    data: {"output": "def verify_token(token): ..."}

    event: result
    data: {"status": "success", "session_id": "...", "cost_usd": 0.012}
    ```
  - If `stream=false`: `application/json` containing the full response and summary of changes.

---

### `POST /api/sessions/{session_id}/interrupt`
Interrupt an ongoing agent turn.
- Calls `client.interrupt()` on the active `ClaudeSDKClient`.

---

### `GET /api/sessions` & `GET /api/sessions/{session_id}`
- Inspect sessions, metadata, and past message transcripts using `list_sessions()` and `get_session_messages()`.

---

### `GET /api/workspace/git-status`
- Query the git workspace for modified files, git branch, and diffs generated by the agent.

---

## 4. User Review Required

> [!IMPORTANT]
> **Anthropic API Authentication**: The Agent SDK runs against an Anthropic API Key (`ANTHROPIC_API_KEY`), Amazon Bedrock, Google Vertex AI, or Microsoft Foundry credentials. The service must have access to `ANTHROPIC_API_KEY` in its environment.

> [!IMPORTANT]
> **Execution Security & Tool Approvals**: The agent has the ability to execute `Bash` commands and edit files. In a production sandbox, this service should run inside a Docker container or isolated VM with restricted permissions. For local sandbox testing, `permission_mode="acceptEdits"` auto-approves code edits while keeping safe limits.

---

## 5. Open Questions

1. **Workspace Location**: Should the sandbox use a fixed workspace directory (e.g. `/Users/adityapore/Documents/AI sandbox/POC/claude-code-sandbox/workspace`), or should callers specify custom git repo paths per session?
2. **Execution Environment**: Will this service run locally on your Mac machine directly, or inside a containerized sandbox (Docker)?
3. **Primary Interaction Mode**: Do you plan to connect a web UI / frontend that consumes Server-Sent Events (SSE), or primarily automated HTTP POST clients that prefer synchronous JSON responses?

---

## 6. Proposed Implementation Changes

### Project Structure to Create

```
claude-code-sandbox/
├── app/
│   ├── __init__.py
│   ├── main.py               # FastAPI application setup and CORS
│   ├── config.py             # Settings (API key, default workspace, port)
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py        # Pydantic schemas (requests, responses, SSE events)
│   ├── services/
│   │   ├── __init__.py
│   │   ├── agent_runner.py   # Claude Agent SDK integration (query, client, options)
│   │   ├── session_manager.py# Active session tracking and history
│   │   └── git_manager.py    # Git operations (status, diff, branch, checkout)
│   └── api/
│       ├── __init__.py
│       ├── routes_sessions.py# Session and message POST endpoints
│       └── routes_workspace.py# Git status and workspace management
├── workspace/                # Target git repository sandbox folder
├── tests/
│   ├── __init__.py
│   └── test_api.py           # Unit & integration tests
├── requirements.txt          # claude-agent-sdk, fastapi, uvicorn, pydantic
├── .env.example
└── README.md
```

### Dependency Stack
- `claude-agent-sdk`: Core library providing the agent loop and tools.
- `fastapi`: ASGI web framework for fast async POST & SSE handling.
- `uvicorn[standard]`: High-performance ASGI server.
- `pydantic`: Type-safe request/response definitions.
- `gitpython` or standard `subprocess`: To inspect git repo status and diffs.

---

## 7. Verification Plan

### Automated Tests
- Test API route initialization and OpenAPI schema generation (`/docs`).
- Mocked agent SDK tests to verify request validation, session creation, and SSE event serialization.
- Test git workspace inspection endpoint on a local dummy git repo.

### End-to-End Verification
1. Create a dummy git repo inside `workspace/` with a sample buggy code file.
2. Launch the FastAPI service on `http://localhost:8000`.
3. Send a POST request to `/api/sessions/{session_id}/messages` with `stream=true` asking Claude to fix the bug and commit the change.
4. Verify streamed SSE messages in real-time.
5. Inspect the git log and diff in the workspace to confirm the agent successfully modified the code.
