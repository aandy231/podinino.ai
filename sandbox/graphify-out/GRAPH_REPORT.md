# Graph Report - claude-code-sandbox  (2026-09-15)

## Corpus Check
- 80 files · ~271,186 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 8, .conf 2, .css 2)

## Summary
- 438 nodes · 740 edges · 29 communities (18 shown, 5 thin omitted)
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 115 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Backend Services
- Frontend Modules
- Backend Services
- Tool.Py
- Backend Services
- Backend Services
- API & Routes
- UI Components
- UI Components
- UI Components
- API & Routes
- Backend Services
- Generate
- API & Routes
- Fetch
- System Components
- Backend Services
- API & Routes
- Cli.Py
- Backend Services
- Init
- System Components
- Docker

## God Nodes (most connected - your core abstractions)
1. `WorkspaceGitManager` - 27 edges
2. `GitManager` - 23 edges
3. `SessionManager` - 15 edges
4. `GitStatusResponse` - 12 edges
5. `GitDiffResponse` - 12 edges
6. `SSEEvent` - 12 edges
7. `get_workspace_git_manager()` - 11 edges
8. `GitError` - 11 edges
9. `AgentRunner` - 10 edges
10. `ActiveSessionContext` - 10 edges

## Surprising Connections (you probably didn't know these)
- `test_sse_streaming_endpoint()` --uses--> `SSEEvent`  [INFERRED]
  tests/test_api.py → app/models/schemas.py
- `mock_run_stream()` --calls--> `SSEEvent`  [EXTRACTED]
  tests/test_api.py → app/models/schemas.py
- `test_sse_streaming_endpoint()` --uses--> `AgentRunner`  [INFERRED]
  tests/test_api.py → app/services/agent_runner.py
- `test_git_manager_lifecycle()` --uses--> `GitManager`  [INFERRED]
  tests/test_api.py → app/services/git_manager.py
- `test_workspace_git_manager_multi_repo()` --uses--> `WorkspaceGitManager`  [INFERRED]
  tests/test_api.py → app/services/git_manager.py

## Import Cycles
- None detected.

## Communities (29 total, 5 thin omitted)

### Community 0 - "Backend Services"
Cohesion: 0.06
Nodes (60): create_session(), get_session(), interrupt_session(), list_sessions(), post_message(), get, post, List recent agent sessions and their metadata. (+52 more)

### Community 1 - "Frontend Modules"
Cohesion: 0.06
Nodes (33): eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, react-dom, @types/react, @types/react-dom (+25 more)

### Community 2 - "Backend Services"
Cohesion: 0.11
Nodes (30): API router definitions for sessions and workspace endpoints., checkout_branch(), checkout_repo_branch(), clone_into_workspace(), clone_repository(), get_git_manager(), get_ide_config(), get_repo_git_diff() (+22 more)

### Community 3 - "Tool.Py"
Cohesion: 0.09
Nodes (22): Determines the next step based on whether activities have been selected., should_find_places(), find_specific_places(), format_suggestions(), generate_activity_options(), Generates activity options for the user based on the destination., Finds specific places for the user's selected activities., Formats the found places into the final structured JSON output. (+14 more)

### Community 4 - "Backend Services"
Cohesion: 0.09
Nodes (17): Execute an agent turn and collect the final results as a synchronous JSON…, Execute an agent turn and yield formatted SSE lines in real-time., ActiveSessionContext, Any, Path, Get or initialize a connected ClaudeSDKClient for the session context., Interrupt an ongoing agent turn if currently running., Disconnect and clean up client for a session. (+9 more)

### Community 5 - "Backend Services"
Cohesion: 0.09
Nodes (22): BaseSettings, Path, Return the absolute Path to the workspace directory., Application configuration loaded from environment or .env file., Settings, health_check(), lifespan(), get (+14 more)

### Community 6 - "API & Routes"
Cohesion: 0.11
Nodes (24): asyncio, fixture, Path, Verify POST /api/sessions/{session_id}/messages streams text/event-stream…, Create a clean temporary workspace for isolated tests., Verify repo name parsing from various Git remote URL formats., Test WorkspaceGitManager handling multiple repositories and .code-workspace…, Verify session creation endpoint with ticket_id, target_repo, and multi-repo… (+16 more)

### Community 7 - "UI Components"
Cohesion: 0.11
Nodes (25): Agent Runner, Git Manager, REST API, Session Manager, Workspace Manager, Git Operations, Multi-Repository Sandbox, Permission Mode (+17 more)

### Community 8 - "UI Components"
Cohesion: 0.09
Nodes (25): LogsDrawer Component, NewWorkspaceModal Component, SettingsPanel Component, Sidebar Navigation, WorkspaceGroup Component, WorkspaceRow Component, GitHub OAuth Authentication Flow, Sandbox Lifecycle (+17 more)

### Community 9 - "UI Components"
Cohesion: 0.16
Nodes (14): lucide-react, react, App(), DevelopView(), HARNESSES, NewWorkspaceModal(), SettingsPanel(), WorkspaceGroup() (+6 more)

### Community 10 - "API & Routes"
Cohesion: 0.17
Nodes (18): convert_objectid_to_string(), fetch_place_data(), generate_itinerary(), ItineraryRequest, PlaceDataRequest, PlaceDataResponse, BaseModel, post (+10 more)

### Community 11 - "Backend Services"
Cohesion: 0.13
Nodes (9): Path, Return name of the currently checked out git branch., Checkout branch or optionally create it., Get unified git diff of all uncommitted changes., Alias for backward compatibility., Execute a git command inside the repo directory asynchronously., Check if this specific directory is an initialized git repository root., Get the URL for a remote if configured. (+1 more)

### Community 12 - "Generate"
Cohesion: 0.19
Nodes (13): Graph definition for the Itinerary Planner Agent, Determines if we should proceed to generate itinerary based on fetched…, should_generate_itinerary(), Itinerary Planner Agent, fetch_selected_attractions(), generate_itinerary(), Nodes for the Itinerary Planner Agent Handles fetching attractions and…, Fetches the full details of selected attractions from the database. (+5 more)

### Community 13 - "API & Routes"
Cohesion: 0.19
Nodes (10): fetch_places_prompt(), Prompts for Gemini AI Service Contains all prompt templates used for generating…, Generate the system prompt for destination data generation Args: query: The…, Prompts module for managing all AI service prompts, generate_destination_data(), get_masked_api_key(), Any, Gemini AI Service Handles all interactions with Google's Gemini API for… (+2 more)

### Community 14 - "Fetch"
Cohesion: 0.21
Nodes (12): fetch_all_sites_from_attractions(), fetch_attractions_by_ids(), fetch_site_details_by_name(), get_db_connection(), place_exists(), Any, Database connector tool for fetching attractions and sites from MongoDB, Extracts all site names from attractions data (flat list). (+4 more)

### Community 15 - "System Components"
Cohesion: 0.38
Nodes (7): AI Copilot Agent, AI Service, Langchain, Langchain OpenAI, Langgraph, MongoDB, WebSockets

### Community 16 - "Backend Services"
Cohesion: 0.67
Nodes (3): close_session(), Close and disconnect the agent client for a session., delete

### Community 17 - "API & Routes"
Cohesion: 0.67
Nodes (3): websocket, Handles the conversational WebSocket connection., websocket_endpoint()

## Knowledge Gaps
- **26 isolated node(s):** `Config`, `name`, `private`, `version`, `type` (+21 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 211 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `WorkspaceGitManager` connect `Backend Services` to `Backend Services`, `Backend Services`, `Backend Services`, `API & Routes`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Why does `GitManager` connect `Backend Services` to `Backend Services`, `Backend Services`, `API & Routes`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `SessionManager` connect `Backend Services` to `Backend Services`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Are the 8 inferred relationships involving `WorkspaceGitManager` (e.g. with `create_session()` and `get_session()`) actually correct?**
  _`WorkspaceGitManager` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `GitManager` (e.g. with `GitCommitInfo` and `GitDiffResponse`) actually correct?**
  _`GitManager` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `Raptrr Dashboard Frontend` (e.g. with `Dashboard Project Context` and `LogsDrawer Component`) actually correct?**
  _`Raptrr Dashboard Frontend` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 18 inferred relationships involving `FastAPI Agent Service` (e.g. with `Main README Documentation` and `Service Architecture Plan`) actually correct?**
  _`FastAPI Agent Service` has 18 INFERRED edges - model-reasoned connections that need verification._