import React from 'react';
import { Bot, Sparkles } from 'lucide-react';

export const AVAILABLE_HARNESSES = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    shortName: 'Claude',
    badgeColor: '#e05638',
    logo: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/claude-color.svg',
    description: 'Autonomous coding agent powered by Claude CLI with deep bash terminal and file-editing tools.',
    tag: 'Recommended'
  },
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    shortName: 'Copilot',
    badgeColor: '#0969da',
    logo: 'https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/copilot-color.svg',
    description: 'AI pair programmer with repository context, smart completions, and multi-file code editing.',
    tag: 'Workspace'
  }
];

export const AVAILABLE_MODELS = AVAILABLE_HARNESSES;

/**
 * Returns harness descriptor for given id (handles variations like claudeCode, claude-code, etc.)
 */
export function getHarness(id) {
  if (!id) return AVAILABLE_HARNESSES[0];
  const normalized = String(id).toLowerCase().replace(/_/g, '-');
  if (normalized === 'claudecode' || normalized === 'claude-code' || normalized === 'claude') {
    return AVAILABLE_HARNESSES[0];
  }
  if (normalized === 'githubcopilot' || normalized === 'github-copilot' || normalized === 'copilot') {
    return AVAILABLE_HARNESSES[1];
  }
  return AVAILABLE_HARNESSES.find(h => h.id === id) || AVAILABLE_HARNESSES[0];
}

export default function ModelSelector() {
  return null;
}
