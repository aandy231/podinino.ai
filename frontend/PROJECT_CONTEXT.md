# Project Context: Podi UI Service (`podi-ui-service`)

This document provides a complete high-level and detailed architectural reference for **Podi UI Service (`podi-ui-service`)**. It is designed to quickly onboard any AI developer agent or LLM to the codebase so they can understand the design system, component structures, API contracts, and development guidelines.

---

## 1. Project Overview

The **Podi UI Service (`podi-ui-service`)** is a premium, developer-centric React application built on Vite. It provides a visual interface for software engineers to spin up, manage, and tear down secure, on-demand development sandboxes. 

Each sandbox represents a isolated containerized workspace running inside a Kubernetes cluster (managed by backend services). These sandboxes mount persistent storage, checkout target Git branches, run a `code-server` editor daemon, and run an optional AI Copilot agent daemon.

### Host Services Summary
- **Frontend UI (podi-ui-service):** Runs locally on [http://localhost:5173](http://localhost:5173) by default.
- **Spinup Service (Backend):** Runs on `http://localhost:8000`. Handles Kubernetes resource provisioning and workspace states.
- **Auth Service (Backend):** Runs on `http://localhost:8082`. Handles GitHub OAuth exchanges.
- **Integration Service (Backend):** Runs on `http://localhost:8081`. Handles GitHub repository listings.

---

## 2. Directory Structure

```text
podi-ui-service/
├── index.html                   # Shell template injecting React mount point
├── package.json                 # Project dependencies & scripts (Vite, React 19, Lucide React)
├── vite.config.js               # Vite configuration (standard React plugin)
├── eslint.config.js             # ESLint configuration
├── src/
│   ├── main.jsx                 # Client entry point rendering <App />
│   ├── App.jsx                  # Root state orchestration, API integrations, and view layout
│   ├── index.css                # Global design system variables & core styling tokens
│   ├── mockData.js              # Mock developers, default repositories, tickets, and log generator streams
│   └── components/
│       ├── Sidebar.jsx          # Tab navigation & user/logout panel
│       ├── WorkspaceGroup.jsx   # Collapsible container grouping sandboxes by repository
│       ├── WorkspaceRow.jsx     # Row component listing branch, status, ticket, and action buttons
│       ├── NewWorkspaceModal.jsx# Form to configure and spin up a new sandbox (HTML5 <dialog>)
│       ├── LogsDrawer.jsx       # Interactive slide-over terminal logging output pane
│       └── SettingsPanel.jsx    # Slide-over settings drawer for namespace, storage size, etc.
```

---

## 3. Tech Stack & Styling Guidelines

- **Framework & Tooling:** React 19, Vite, ES Modules.
- **Iconography:** `lucide-react` for premium developer icons.
- **Fonts:** Custom typography loaded from Google Fonts:
  - Sans-serif: `Valley Sans` (for dashboard interface and user labels).
  - Monospace: `JetBrains Mono` (for IDs, git branches, and terminal logs).
- **Styling Paradigm:** Vanilla CSS custom properties (variables) defined in [index.css](file:///Users/adityapore/Documents/AI%20sandbox/POC/dashboard-frontend/src/index.css). 
  - **CRITICAL DESIGN RULE:** Do **NOT** use TailwindCSS unless explicitly requested. Style components using CSS Custom Properties and clean inline style objects or index.css classes.
  - **Color Palette (Sleek Dark Mode):**
    - Background Primary: `#08080a` (radial gradients mapping into deep indigo/teal tones).
    - Secondary/Cards: `#0d0d12` / `rgba(16, 16, 24, 0.65)`.
    - Primary Indigo: `#5f5af6` (hover `#4f46e5`).
    - Accents: Ready/Success (`#10b981`), Stopped/Muted (`#71717a`), Provisioning (`#f59e0b`), Error (`#ef4444`).
  - **Aesthetics & Micro-Animations:** Includes frosted glass panels (`backdrop-filter: blur(16px)`), animated neon button borders (`.neon-border-btn`), pulsing status dots, and loading shimmer animations (`.shimmer`).

---

## 4. State & Lifecycle Orchestration

The global state is centrally orchestrated within [App.jsx](file:///Users/adityapore/Documents/AI%20sandbox/POC/dashboard-frontend/src/App.jsx).

### 4.1 Authentication Flow (GitHub OAuth)
1. If the user is unauthenticated, they see a premium login screen with a rotating reactor element.
2. Clicking **Continue with GitHub** redirects the user to:
   `https://github.com/login/oauth/authorize?client_id=Ov23ligd1Sh8SXMKmaIO&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2F&scope=read:user%20repo`
3. Upon callback, `App.jsx` reads the query parameter `?code=`, makes a `POST` request to `http://localhost:8082/api/v1/auth/github` with `{ code }`, and obtains a JWT access token and user profile details.
4. Tokens are stored in `localStorage` under keys `sandbox_oauth_token` and `sandbox_oauth_user` to persist sessions on mount.

### 4.2 Sandboxes Lifecycle States
Each workspace object uses this structure:
```typescript
interface Workspace {
  id: string;              // Generated from sandbox name slug + 4-char suffix
  name: string;            // User-provided readable name
  repo: string;            // Reference to base repository name
  repoUrl: string;         // Cloned target repo Git HTTPS/SSH URL
  branch: string;          // Target branch name to compile/run
  owner: Developer;        // Object containing { name, avatar, email, id }
  createdTime: string;     // ISO Date
  lastActiveTime: string;  // ISO Date
  ticket: Ticket | null;   // Linked Jira/Linear ticket details { id, title }
  status: 'Ready' | 'Stopped' | 'Provisioning' | 'Starting' | 'Stopping' | 'Terminating' | 'Error';
  aiAgentActive: boolean;  // Enables/Disables background AI coding daemons
  url: string;             // k8s ingress routing URL (e.g. https://my-sandbox-1234.sandbox.ai)
}
```

### 4.3 K8s Container Logs Streaming
Since sandboxes run asynchronously on Kubernetes, the frontend simulates step-by-step progress bars and console outputs via `logStreams` in state mapping `workspaceId -> LogLine[]`.
- During provisioning, log steps are loaded sequentially from `generateLogs(name, branch)` (in `mockData.js`) every `600ms`.
- A final terminal check will poll the backend `GET /api/workspace/${id}` until `ready_replicas > 0` and `status === 'Running'`.
- Deletion triggers termination logs loaded sequentially from `generateStoppingLogs(name)` before removal.

---

## 5. API Contracts & Endpoints

### 5.1 Auth Service (Port 8082)
- **POST `/api/v1/auth/github`**
  - Exchange GitHub code for an authorization profile.
  - Body: `{ code: string }`
  - Returns: `{ access_token: string, user: { id, name, avatar_url, email } }`

### 5.2 Integration Service (Port 8081)
- **GET `/api/v1/github/repos`**
  - Fetches GitHub repositories available to the authenticated user.
  - Headers: `Authorization: Bearer <githubToken>`
  - Returns: `Repository[]` containing `{ name, clone_url }`

### 5.3 Spinup Service (Port 8000)
- **GET `/api/workspaces`**
  - Fetches active workspaces.
  - Returns: `K8sWorkspace[]` where items contain `{ workspace_id, status, ready_replicas, workspace_url }`
- **GET `/api/workspace/${workspaceId}`**
  - Polls status for a single sandbox.
  - Returns: `{ workspace_id, status, ready_replicas, workspace_url }`
- **POST `/api/spinworkspace`**
  - Spins up a new container workspace deployment.
  - Body:
    ```json
    {
      "workspace_id": "string",
      "repo_url": "string",
      "branch": "string",
      "checkout_branch": "main",
      "github_pat": "string",
      "storage_size": "1Gi",
      "cpu_request": "200m",
      "memory_request": "512Mi",
      "cpu_limit": "500m",
      "memory_limit": "1Gi"
    }
    ```
- **DELETE `/api/workspace/${workspaceId}`**
  - Terminates Kubernetes pods, services, ingresses, and PVC bounds.

---

## 6. Guidelines for AI Assistants & LLMs

When modifying, extending, or refactoring this project, adhere strictly to the following parameters:

1. **Design Integrity:** Maintain a high-end, responsive dark theme. Ensure layout cards utilize glassmorphism panels. Focus outlines should use `--primary` with offset.
2. **Icons:** Utilize standard import syntax from `lucide-react` (e.g. `import { Plus, Search } from 'lucide-react'`). Avoid importing heavy libraries or SVG assets directly unless required.
3. **Vanilla Styles:** Do not inject Tailwind or bootstrap utilities. If structural grids or flex wrappers are required, write inline styles using CSS flexbox/grid or add a standard class inside `src/index.css`.
4. **Modal Conventions:** Modal elements must use the HTML5 `<dialog>` component, utilizing refs (`dialogRef.current.showModal()` / `close()`) rather than simple conditionally-rendered `div` overlays. This aligns with accessibility best practices.
5. **Robust State Safeguards:** Always check if workspaces, logs, or user context are defined before invoking mapping, filtering, or text searches to prevent runtime crashes.
6. **Mock Mode Fallback:** If backend endpoints (`localhost:8000` or `localhost:8081`) are offline, ensure the frontend handles connection errors gracefully, showing toasts or using mock fallback workspaces from `mockData.js` rather than locking the UI.
