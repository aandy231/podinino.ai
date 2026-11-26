/**
 * Skills Library API Client
 * Interfaces with the dedicated Podinino skill-service.
 */

function getHeaders(userId, orgId) {
  const headers = {};
  const effectiveUser = userId || localStorage.getItem('user_id') || 'user-default';
  headers['X-User-Id'] = effectiveUser;
  const effectiveOrg = orgId || localStorage.getItem('org_id') || 'org-default';
  headers['X-Organization-Id'] = effectiveOrg;
  const token = localStorage.getItem('token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function fetchSkills({ scope, search, category, userId } = {}) {
  const params = new URLSearchParams();
  if (scope && scope !== 'all') params.append('scope', scope);
  if (search) params.append('search', search);
  if (category && category !== 'All') params.append('category', category);

  const url = `/api/v1/skills${params.toString() ? `?${params.toString()}` : ''}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getHeaders(userId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch skills (${res.status})`);
  }
  return res.json();
}

export async function getSkillDetails(skillId, userId) {
  const res = await fetch(`/api/v1/skills/${encodeURIComponent(skillId)}`, {
    method: 'GET',
    headers: getHeaders(userId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch skill details (${res.status})`);
  }
  return res.json();
}

export async function getSkillContent(skillId, userId) {
  const res = await fetch(`/api/v1/skills/${encodeURIComponent(skillId)}/content`, {
    method: 'GET',
    headers: getHeaders(userId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch skill content (${res.status})`);
  }
  return res.text();
}

export async function createSkill(payload, userId) {
  const isFormData = payload instanceof FormData;
  const headers = getHeaders(userId);
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch('/api/v1/skills', {
    method: 'POST',
    headers,
    body: isFormData ? payload : JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to create skill (${res.status})`);
  }
  return res.json();
}

export async function updateSkill(skillId, payload, userId) {
  const headers = {
    ...getHeaders(userId),
    'Content-Type': 'application/json',
  };

  const res = await fetch(`/api/v1/skills/${encodeURIComponent(skillId)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to update skill (${res.status})`);
  }
  return res.json();
}

export async function deleteSkill(skillId, userId) {
  const res = await fetch(`/api/v1/skills/${encodeURIComponent(skillId)}`, {
    method: 'DELETE',
    headers: getHeaders(userId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to delete skill (${res.status})`);
  }
  return res.json();
}

export async function fetchSandboxSkills(sandboxId, userId) {
  const res = await fetch(`/api/v1/sandboxes/${encodeURIComponent(sandboxId)}/skills`, {
    method: 'GET',
    headers: getHeaders(userId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to fetch sandbox skills (${res.status})`);
  }
  return res.json();
}

export async function assignSkillsToSandbox(sandboxId, skillIds, userId) {
  const res = await fetch(`/api/v1/sandboxes/${encodeURIComponent(sandboxId)}/skills`, {
    method: 'POST',
    headers: {
      ...getHeaders(userId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ skill_ids: skillIds }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to assign skills to sandbox (${res.status})`);
  }
  return res.json();
}

export async function detachSkillFromSandbox(sandboxId, skillId, userId) {
  const res = await fetch(`/api/v1/sandboxes/${encodeURIComponent(sandboxId)}/skills/${encodeURIComponent(skillId)}`, {
    method: 'DELETE',
    headers: getHeaders(userId),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Failed to detach skill from sandbox (${res.status})`);
  }
  return res.json();
}
