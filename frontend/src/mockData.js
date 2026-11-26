// Real Project Data & Developer Sandbox Console Context

export const DEVELOPERS = [
  { id: 'dev1', name: 'Aditya Pore', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=facearea&facepad=2&w=150&h=150&q=80', email: 'aditya.pore@podinino.dev' },
  { id: 'dev2', name: 'Sarah Chen', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=facearea&facepad=2&w=150&h=150&q=80', email: 'sarah.chen@podinino.dev' },
  { id: 'dev3', name: 'Mike Rodriguez', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=facearea&facepad=2&w=150&h=150&q=80', email: 'mike.rod@podinino.dev' },
];

export const REPOSITORIES = [
  { id: 'podi-ui-service', name: 'podi-ui-service', description: 'React 19 + Vite Light Theme Developer Console and AI Agent Workspace UI.', language: 'JavaScript' },
  { id: 'spinup-service', name: 'spinup-service', description: 'FastAPI control-plane orchestrating Kubernetes sandboxes and MongoDB state tracking.', language: 'Python' },
  { id: 'auth-service', name: 'auth-service', description: 'GitHub OAuth token exchange and authentication microservice on port 8082.', language: 'Python' },
  { id: 'chat-service', name: 'chat-service', description: 'Conversation turn storage with PostgreSQL JSONB and Redis stream buffering on port 8083.', language: 'Python' },
  { id: 'Integration-service', name: 'Integration-service', description: 'GitHub repository listing and webhook integrations microservice on port 8081.', language: 'Python' },
  { id: 'claude-code-sandbox', name: 'claude-code-sandbox', description: 'Dual-service container running Claude Agent daemon and code-server IDE.', language: 'Python' },
  { id: 'podinino-helm-charts', name: 'podinino-helm-charts', description: 'Kubernetes Helm deployment charts and ingress templates.', language: 'YAML' },
];

export const MOCK_REPOSITORIES_LIST = [
  { id: 'podi-ui-service', name: 'podi-ui-service', category: 'All,Public', clone_url: 'https://github.com/aandy231/podi-ui-service.git' },
  { id: 'spinup-service', name: 'spinup-service', category: 'All,Private', clone_url: 'https://github.com/aandy231/spinup-service.git' },
  { id: 'auth-service', name: 'auth-service', category: 'All,Private', clone_url: 'https://github.com/aandy231/auth-service.git' },
  { id: 'chat-service', name: 'chat-service', category: 'All,Private', clone_url: 'https://github.com/aandy231/chat-service.git' },
  { id: 'Integration-service', name: 'Integration-service', category: 'All,Public', clone_url: 'https://github.com/aandy231/Integration-service.git' },
  { id: 'claude-code-sandbox', name: 'claude-code-sandbox', category: 'All,Organizations', clone_url: 'https://github.com/aandy231/claude-code-sandbox.git' },
  { id: 'podinino-helm-charts', name: 'podinino-helm-charts', category: 'All,Organizations', clone_url: 'https://github.com/aandy231/podinino-helm-charts.git' }
];


export const DEFAULT_PROJECTS_LIST = [];

export const TICKETS = [
  { id: 'DASH-101', title: 'Light theme styling and font integration', repo: 'podi-ui-service' },
  { id: 'SPIN-204', title: 'Dynamic PVC & ClusterIP provisioning', repo: 'spinup-service' },
  { id: 'AUTH-302', title: 'GitHub OAuth token exchange', repo: 'auth-service' },
  { id: 'CHAT-405', title: 'Turn persistence in PostgreSQL JSONB', repo: 'chat-service' },
];

export const INITIAL_WORKSPACES = [];

// Generator for Kubernetes and Code-Server logs
export function generateLogs(workspaceName, branchName) {
  const timestamp = () => `[${new Date().toISOString().split('T')[1].substring(0, 8)}]`;

  return [
    { type: 'info', text: `${timestamp()} INFO  kubelet: Creating sandbox pod for "${workspaceName}"...` },
    { type: 'info', text: `${timestamp()} INFO  kubelet: Scheduling pod in node-group-m5-xlarge-zone-us-east-1a` },
    { type: 'info', text: `${timestamp()} INFO  kubelet: Pulling code-server core image "codercom/code-server:4.90-alpine"...` },
    { type: 'info', text: `${timestamp()} SUCCESS kubelet: Successfully pulled image "codercom/code-server:4.90-alpine" in 3.42s` },
    { type: 'info', text: `${timestamp()} INFO  kubelet: MountVolume.SetUp succeeded for volume "sandbox-storage" (PVC)` },
    { type: 'info', text: `${timestamp()} INFO  kubelet: Persistent volume claims successfully mounted. Alloc: 10GiB` },
    { type: 'info', text: `${timestamp()} INFO  git-init: Initializing sandbox Git credentials key...` },
    { type: 'info', text: `${timestamp()} INFO  git-init: Target project repository: "${workspaceName}"` },
    { type: 'info', text: `${timestamp()} INFO  git-init: Git checkout remote branch "${branchName}"` },
    { type: 'info', text: `${timestamp()} SUCCESS git-init: Checked out commit "d5504e9: Integrate MongoDB & Kubernetes models"` },
    { type: 'info', text: `${timestamp()} INFO  ai-copilot: Injecting AI Agent context (Claude Code / Antigravity)...` },
    { type: 'info', text: `${timestamp()} SUCCESS ai-copilot: Copilot daemon initialized.` },
    { type: 'info', text: `${timestamp()} INFO  code-server: Executing command: code-server --auth none --bind-addr 0.0.0.0:8080 /workspace` },
    { type: 'info', text: `${timestamp()} INFO  code-server: Web socket connection server listening on port 8080.` },
    { type: 'info', text: `${timestamp()} INFO  ingress-controller: Syncing ingress resource rule: http://${workspaceName}.workspaces.local` },
    { type: 'success', text: `${timestamp()} SUCCESS sandbox: Sandbox server is fully operational and healthy!` }
  ];
}

// Logs when stopping the workspace
export function generateStoppingLogs(workspaceName) {
  const timestamp = () => `[${new Date().toISOString().split('T')[1].substring(0, 8)}]`;

  return [
    { type: 'info', text: `${timestamp()} INFO  kubelet: Received shutdown request for pod "${workspaceName}"` },
    { type: 'info', text: `${timestamp()} INFO  code-server: Sent SIGTERM signal to server process (PID 14)` },
    { type: 'info', text: `${timestamp()} INFO  code-server: Safely disconnected active WebSocket connections` },
    { type: 'info', text: `${timestamp()} SUCCESS code-server: Server shutdown clean completed` },
    { type: 'info', text: `${timestamp()} INFO  git-sync: Running final sandbox auto-stash git-sync...` },
    { type: 'success', text: `${timestamp()} SUCCESS git-sync: Stashed uncommitted files safely to PVC storage` },
    { type: 'info', text: `${timestamp()} INFO  storage: Unmounting persistent volume "sandbox-storage" safely...` },
    { type: 'success', text: `${timestamp()} SUCCESS storage: Volume unmounted successfully` },
    { type: 'info', text: `${timestamp()} INFO  kubelet: Terminated pod container code-server-pod` },
    { type: 'success', text: `${timestamp()} SUCCESS sandbox: Sandbox stopped and resources released successfully.` }
  ];
}
