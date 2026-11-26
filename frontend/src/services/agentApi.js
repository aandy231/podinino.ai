/**
 * Agent API Service
 * Handles communication with the claude-code-sandbox service,
 * including Server-Sent Events (SSE) streaming for real-time agent execution.
 */

const API_BASE = import.meta.env.VITE_AGENT_API_URL || '';

/**
 * Initialize a session in the sandbox
 * @param {Object} params
 * @param {string} [params.target_repo]
 * @param {string} [params.git_url]
 * @param {string} [params.branch]
 * @param {Array<{git_url: string, branch?: string, repo_name?: string, create_branch?: string}>} [params.repos]
 * @param {string} [params.session_name]
 * @param {string} [params.ticket_id]
 * @param {string} [params.model]
 * @param {string} [params.permission_mode]
 * @param {string} [params.workspace_dir]
 * @returns {Promise<Object>}
 */
/**
 * Initialize a session in chat-service / sandbox
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function createSession(params) {
  const user = JSON.parse(localStorage.getItem('sandbox_oauth_user') || '{}');
  const userId = user.id || user.login || 'developer';
  const token = localStorage.getItem('sandbox_oauth_token') || '';

  try {
    const res = await fetch(`${API_BASE}/api/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: params.session_id,
        user_id: userId,
        title: params.session_name || 'New Conversation',
        target_repo: params.target_repo,
        repo_name: params.target_repo,
        branch: params.branch || 'main',
        workspace_id: params.workspace_id,
        github_token: token,
        repos: (params.repos || []).map(r => typeof r === 'object' ? { ...r, github_token: token } : r),
      }),
    });
    if (res.ok) {
      return res.json();
    }
  } catch (e) {
    console.warn('Chat-service unavailable, falling back to sandbox /api/sessions:', e);
  }

  // Fallback to sandbox /api/sessions
  const res = await fetch(`${API_BASE}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...params,
      github_token: token,
      repos: (params.repos || []).map(r => typeof r === 'object' ? { ...r, github_token: token } : r),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to create agent session');
  }
  return res.json();
}

/**
 * Fetch past sessions list (from PostgreSQL via chat-service)
 * @param {number} [limit=50]
 * @param {string} [userId]
 * @param {string} [workspaceId]
 * @returns {Promise<Array>}
 */
export async function listSessions(limit = 50, userId = null, workspaceId = null) {
  const user = userId || JSON.parse(localStorage.getItem('sandbox_oauth_user') || '{}').id;
  let query = `limit=${limit}`;
  if (user) query += `&user_id=${encodeURIComponent(user)}`;
  if (workspaceId) query += `&workspace_id=${encodeURIComponent(workspaceId)}`;

  try {
    const res = await fetch(`${API_BASE}/api/chats?${query}`);
    if (res.ok) {
      return res.json();
    }
  } catch (e) {
    console.warn('Chat-service unavailable, falling back to /api/sessions:', e);
  }

  const res = await fetch(`${API_BASE}/api/sessions?${query}`);
  if (!res.ok) {
    throw new Error('Failed to list sessions');
  }
  return res.json();
}

/**
 * Fetch details and history for a specific session
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
export async function getSession(sessionId) {
  try {
    const res = await fetch(`${API_BASE}/api/chats/${sessionId}`);
    if (res.ok) {
      return res.json();
    }
  } catch (e) {
    console.warn('Chat-service unavailable, falling back to /api/sessions:', e);
  }

  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
  if (!res.ok) {
    throw new Error(`Failed to retrieve session ${sessionId}`);
  }
  return res.json();
}

/**
 * Delete a session permanently or soft-delete
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
export async function deleteSession(sessionId) {
  try {
    const res = await fetch(`${API_BASE}/api/chats/${sessionId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      return res.json();
    }
  } catch (e) {
    console.warn('Chat-service delete failed, attempting fallback to /api/sessions:', e);
  }

  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Failed to delete session ${sessionId}`);
  }
  return res.json();
}

/**
 * Interrupt an ongoing agent turn
 * @param {string} sessionId
 * @returns {Promise<Object>}
 */
export async function interruptSession(sessionId) {
  try {
    const res = await fetch(`${API_BASE}/api/chats/${sessionId}/interrupt`, {
      method: 'POST',
    });
    if (res.ok) {
      return res.json();
    }
  } catch (e) {
    // Fallback
  }

  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/interrupt`, {
    method: 'POST',
  });
  if (!res.ok) {
    throw new Error('Failed to interrupt session');
  }
  return res.json();
}

/**
 * Send a prompt to the agent and stream real-time SSE events
 * @param {string} sessionId
 * @param {Object} body
 * @param {string} body.prompt
 * @param {string[]} [body.allowed_tools]
 * @param {number} [body.max_turns]
 * @param {Object} handlers
 * @param {(data: Object) => void} [handlers.onSessionInit]
 * @param {(data: Object) => void} [handlers.onThinking]
 * @param {(data: Object) => void} [handlers.onToolUse]
 * @param {(data: Object) => void} [handlers.onToolResult]
 * @param {(data: Object) => void} [handlers.onText]
 * @param {(data: Object) => void} [handlers.onStatus]
 * @param {(data: Object) => void} [handlers.onResult]
 * @param {(data: Object) => void} [handlers.onError]
 * @param {() => void} [handlers.onDone]
 * @returns {{ abort: () => void }}
 */
export function sendMessageStream(sessionId, { prompt, allowed_tools, max_turns, workspace_id }, handlers = {}) {
  const controller = new AbortController();

  (async () => {
    try {
      let response;
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      };
      if (workspace_id) {
        headers['X-Workspace-Id'] = workspace_id;
      }

      try {
        response = await fetch(`${API_BASE}/api/chats/${sessionId}/messages?stream=true`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt,
            allowed_tools: allowed_tools || ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
            max_turns,
            workspace_id,
          }),
          signal: controller.signal,
        });
      } catch (e) {
        // Fallback to /api/sessions
      }

      if (!response || !response.ok) {
        response = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages?stream=true`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            prompt,
            allowed_tools: allowed_tools || ["Read", "Edit", "Write", "Glob", "Grep", "Bash"],
            max_turns,
            workspace_id,
          }),
          signal: controller.signal,
        });
      }

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errJson.detail || `Request failed with status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();

          if (!line) {
            // Empty line marks end of an event block
            currentEvent = '';
            continue;
          }

          if (line.startsWith('event:')) {
            currentEvent = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            const dataStr = line.substring(5).trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              dispatchSSEEvent(currentEvent, data, handlers);
            } catch (e) {
              console.warn('Could not parse SSE JSON payload:', dataStr, e);
            }
          }
        }
      }

      // Flush remainder
      if (buffer.trim().startsWith('data:')) {
        const dataStr = buffer.trim().substring(5).trim();
        try {
          const data = JSON.parse(dataStr);
          dispatchSSEEvent(currentEvent, data, handlers);
        } catch {
          // Ignore trailing incomplete chunk
        }
      }

      if (handlers.onDone) handlers.onDone();
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('SSE Stream aborted by client');
      } else {
        console.error('SSE Stream error:', err);
        if (handlers.onError) {
          handlers.onError({ error: err.message || 'Stream connection failed' });
        }
      }
      if (handlers.onDone) handlers.onDone();
    }
  })();

  return {
    abort: () => controller.abort(),
  };
}

function dispatchSSEEvent(eventName, data, handlers) {
  switch (eventName) {
    case 'session_init':
      if (handlers.onSessionInit) handlers.onSessionInit(data);
      break;
    case 'thinking':
      if (handlers.onThinking) handlers.onThinking(data);
      break;
    case 'tool_use':
      if (handlers.onToolUse) handlers.onToolUse(data);
      break;
    case 'tool_result':
      if (handlers.onToolResult) handlers.onToolResult(data);
      break;
    case 'text':
      if (handlers.onText) handlers.onText(data);
      break;
    case 'status':
      if (handlers.onStatus) handlers.onStatus(data);
      break;
    case 'result':
      if (handlers.onResult) handlers.onResult(data);
      break;
    case 'error':
      if (handlers.onError) handlers.onError(data);
      break;
    default:
      console.log('Unhandled SSE event:', eventName, data);
      break;
  }
}

/**
 * Fetch repositories summary from sandbox workspace
 */
export async function getWorkspaceRepos() {
  const res = await fetch(`${API_BASE}/api/repos`);
  if (!res.ok) throw new Error('Failed to list workspace repositories');
  return res.json();
}

/**
 * Fetch isolated git diff for a specific repository
 * @param {string} repoName
 */
export async function getRepoGitDiff(repoName) {
  const res = await fetch(`${API_BASE}/api/repos/${encodeURIComponent(repoName)}/git-diff`);
  if (!res.ok) throw new Error(`Failed to fetch diff for ${repoName}`);
  return res.json();
}

/**
 * Fetch git status for a specific repository
 * @param {string} repoName
 */
export async function getRepoGitStatus(repoName) {
  const res = await fetch(`${API_BASE}/api/repos/${encodeURIComponent(repoName)}/git-status`);
  if (!res.ok) throw new Error(`Failed to fetch status for ${repoName}`);
  return res.json();
}

/**
 * Fetch IDE config (code-server URL)
 */
export async function getIdeConfig() {
  const res = await fetch(`${API_BASE}/api/ide/config`);
  if (!res.ok) throw new Error('Failed to fetch IDE configuration');
  return res.json();
}

/**
 * Ensure an active sandbox workspace exists via spinup-service
 * @param {Object} params
 * @param {string} params.workspace_id
 * @param {string} [params.repo_url]
 * @param {string} [params.branch]
 * @param {string} [params.github_pat]
 * @returns {Promise<Object>}
 */
export async function ensureWorkspace(params) {
  const token = params.github_pat || params.github_token || localStorage.getItem('sandbox_oauth_token') || '';
  const res = await fetch(`${API_BASE}/api/workspaces/ensure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      workspace_id: params.workspace_id,
      repo_url: params.repo_url,
      branch: params.branch || 'main',
      github_pat: token,
      github_token: token,
      storage_size: '10Gi',
      cpu_request: '500m',
      memory_request: '1Gi',
      cpu_limit: '1000m',
      memory_limit: '2Gi'
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to ensure workspace pod');
  }
  return res.json();
}

/**
 * Get detailed status of a workspace from spinup-service
 * @param {string} workspaceId
 * @returns {Promise<Object>}
 */
export async function getWorkspaceStatus(workspaceId) {
  const res = await fetch(`${API_BASE}/api/workspace/${encodeURIComponent(workspaceId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to fetch status for workspace ${workspaceId}`);
  }
  return res.json();
}

/**
 * Poll workspace until ready or timeout
 * @param {string} workspaceId
 * @param {Object} options
 * @param {(status: Object) => void} [options.onProgress]
 * @param {number} [options.intervalMs=2000]
 * @param {number} [options.maxAttempts=60]
 * @returns {Promise<Object>}
 */
export async function pollWorkspaceReady(workspaceId, { onProgress, intervalMs = 2000, maxAttempts = 60 } = {}) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts++;
    try {
      const data = await getWorkspaceStatus(workspaceId);
      if (onProgress) onProgress(data);
      if (data.phase === 'Ready' || data.status === 'Running' || (data.ready_replicas && data.ready_replicas > 0)) {
        return data;
      }
      if (data.status === 'Error' || data.phase === 'Error') {
        throw new Error(data.error_message || 'Pod provisioning encountered an error in K8s');
      }
    } catch (e) {
      if (attempts >= maxAttempts) throw e;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for workspace ${workspaceId} to become ready.`);
}

/**
 * Fetch developer sandbox quota status
 * @param {string} [ownerId]
 */
export async function getSandboxQuota(ownerId = null) {
  const query = ownerId ? `?owner_id=${encodeURIComponent(ownerId)}` : '';
  const res = await fetch(`${API_BASE}/api/workspaces/quota${query}`);
  if (!res.ok) throw new Error('Failed to fetch sandbox quota');
  return res.json();
}

/**
 * List active sandboxes for the developer
 * @param {string} [ownerId]
 */
export async function listActiveSandboxes(ownerId = null) {
  const query = ownerId ? `?owner_id=${encodeURIComponent(ownerId)}` : '';
  const res = await fetch(`${API_BASE}/api/workspaces${query}`);
  if (!res.ok) throw new Error('Failed to list sandboxes');
  return res.json();
}

/**
 * List archived (deleted) sandboxes
 * @param {string} [ownerId]
 */
export async function listArchivedSandboxes(ownerId = null) {
  const query = ownerId ? `?owner_id=${encodeURIComponent(ownerId)}` : '';
  const res = await fetch(`${API_BASE}/api/workspaces/archived${query}`);
  if (!res.ok) throw new Error('Failed to list archived sandboxes');
  return res.json();
}

/**
 * Create a new developer sandbox with multiple repositories
 * @param {Object} params
 * @param {string} params.workspace_id
 * @param {string} [params.name]
 * @param {string} [params.owner_id]
 * @param {Array<{name: string, git_url: string, branch: string}>} [params.repos]
 */
export async function createSandbox(params) {
  const token = params.github_token || params.github_pat || localStorage.getItem('sandbox_oauth_token') || '';
  const reposPayload = (params.repos || []).map(r => ({
    ...r,
    github_token: token,
    github_pat: token,
  }));
  const res = await fetch(`${API_BASE}/api/workspaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      workspace_id: params.workspace_id,
      name: params.name || params.workspace_id,
      owner_id: params.owner_id,
      github_token: token,
      github_pat: token,
      repos: reposPayload,
      harness: params.harness || 'claude-code',
      storage_size: params.storage_size || '10Gi',
      cpu_request: params.cpu_request || '200m',
      memory_request: params.memory_request || '512Mi',
      cpu_limit: params.cpu_limit || '1000m',
      memory_limit: params.memory_limit || '2Gi'
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to create sandbox');
  }
  return res.json();
}

/**
 * Delete a developer sandbox and reclaim resources/quota
 * @param {string} workspaceId
 */
export async function deleteSandbox(workspaceId) {
  const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceId)}`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Failed to delete sandbox ${workspaceId}`);
  }
  return res.json();
}

/**
 * Checkout or create a git branch in the workspace or specific repo
 * @param {string} branch
 * @param {string} [repoName]
 * @param {string} [checkoutFrom]
 * @param {string} [workspaceId]
 * @returns {Promise<Object>}
 */
export async function checkoutBranch(branch, repoName = null, checkoutFrom = null, workspaceId = null) {
  try {
    const endpoint = repoName
      ? `${API_BASE}/api/repos/${encodeURIComponent(repoName)}/git-checkout`
      : `${API_BASE}/api/workspace/git-checkout`;
    const headers = { 'Content-Type': 'application/json' };
    if (workspaceId) {
      headers['X-Workspace-Id'] = workspaceId;
    }
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        branch,
        create_if_missing: true,
        checkout_from: checkoutFrom || undefined
      })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn('Checkout branch call failed:', e);
  }
  return null;
}

/**
 * Fetch list of branches for a specific repository
 * Robustly queries GitHub Integration Service (/api/v1/github/repos/{owner}/{repo}/branches),
 * direct GitHub API, and fallback to sandbox pod /api/repos/{repo}/branches.
 * 
 * @param {string|Object} repoInput - Repo name, full_name, or repo object
 * @param {string} [tokenOverride] - Optional GitHub token
 * @param {string} [workspaceId] - Optional sandbox/workspace id
 * @returns {Promise<Array<string>>}
 */
export async function getRepoBranches(repoInput, tokenOverride = null, workspaceId = null) {
  if (!repoInput) return [];

  let repoName = '';
  let owner = '';
  let gitUrl = '';

  if (typeof repoInput === 'string') {
    if (repoInput.includes('/')) {
      const parts = repoInput.split('/');
      owner = parts[0];
      repoName = parts[1];
    } else {
      repoName = repoInput;
    }
  } else if (typeof repoInput === 'object') {
    repoName = repoInput.name || '';
    if (repoInput.full_name && repoInput.full_name.includes('/')) {
      const parts = repoInput.full_name.split('/');
      owner = parts[0];
      if (!repoName) repoName = parts[1];
    }
    if (!owner && repoInput.owner) {
      owner = typeof repoInput.owner === 'object' ? (repoInput.owner.login || '') : String(repoInput.owner);
    }
    gitUrl = repoInput.git_url || repoInput.clone_url || repoInput.html_url || '';
  }

  // Extract owner/repo from gitUrl if owner or repoName is missing
  if ((!owner || !repoName) && gitUrl) {
    const match = gitUrl.match(/github\.com[/:]([^/]+)\/([^/.]+?)(?:\.git)?$/);
    if (match) {
      if (!owner) owner = match[1];
      if (!repoName) repoName = match[2];
    }
  }

  // Fallback owner from localStorage oauth user
  if (!owner) {
    try {
      const user = JSON.parse(localStorage.getItem('sandbox_oauth_user') || '{}');
      owner = user.login || user.username || '';
    } catch (e) { }
  }

  const token = tokenOverride ||
    (typeof repoInput === 'object' ? (repoInput.github_token || repoInput.github_pat) : null) ||
    localStorage.getItem('sandbox_oauth_token') ||
    '';

  const collectedBranches = new Set();

  // 1. Primary: Query GitHub Integration service (/api/v1/github/repos/{owner}/{repo}/branches)
  if (owner && repoName) {
    try {
      const headers = {};
      if (token && token !== 'mock-oauth-token') {
        headers['Authorization'] = `Bearer ${token}`;
        headers['X-GitHub-Token'] = token;
      }
      const res = await fetch(`/api/v1/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches`, {
        headers
      });
      if (res.ok) {
        const branches = await res.json();
        if (Array.isArray(branches) && branches.length > 0) {
          branches.forEach(b => {
            const bName = typeof b === 'string' ? b : (b?.name || '');
            if (bName) collectedBranches.add(bName);
          });
        }
      }
    } catch (e) {
      console.debug('Failed to fetch branches from Integration-service:', e);
    }
  }

  // 2. Direct GitHub API fallback
  if (collectedBranches.size === 0 && owner && repoName) {
    try {
      const headers = { 'Accept': 'application/vnd.github+json' };
      if (token && token !== 'mock-oauth-token') {
        headers['Authorization'] = `Bearer ${token}`;
      }
      const res = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/branches?per_page=100`, {
        headers
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          data.forEach(item => {
            if (item && item.name) collectedBranches.add(item.name);
          });
        }
      }
    } catch (e) {
      console.debug('Direct GitHub API branch fetch failed:', e);
    }
  }

  // 3. Fallback: try sandbox pod via spinup-service or direct agent API
  if (collectedBranches.size === 0 && repoName) {
    try {
      const headers = {};
      if (workspaceId) {
        headers['X-Workspace-Id'] = workspaceId;
      }
      const res = await fetch(`${API_BASE}/api/repos/${encodeURIComponent(repoName)}/branches`, {
        headers
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.branches)) {
          data.branches.forEach(b => b && collectedBranches.add(b));
        }
      }
    } catch (e) {
      console.debug('Sandbox pod branch fetch failed:', e);
    }
  }

  return Array.from(collectedBranches);
}
