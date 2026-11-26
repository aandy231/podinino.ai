import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Plus, 
  Settings, 
  ChevronDown, 
  ChevronRight,
  ArrowUp, 
  Square,
  Zap, 
  Folder, 
  ListFilter, 
  PanelLeftClose, 
  PanelLeftOpen, 
  Loader2, 
  Check,
  Search,
  Trash2,
  AtSign,
  Image as ImageIcon,
  Globe,
  ExternalLink,
  MessageSquare,
  Sparkles,
  Code2,
  Server,
  Layers,
  Archive,
  AlertTriangle,
  Play,
  Paperclip,
  GitBranch,
  X
} from 'lucide-react';
import AgentChatStream from './AgentChatStream';
import PodInitCard from './PodInitCard';
import RepoSelector from './RepoSelector';
import { getHarness } from './ModelSelector';
import BranchSelector from './BranchSelector';
import NewWorkspaceModal from './NewWorkspaceModal';
import { 
  createSession, 
  sendMessageStream, 
  interruptSession, 
  listSessions, 
  getSession,
  deleteSession,
  getWorkspaceRepos,
  createSandbox,
  deleteSandbox,
  listActiveSandboxes,
  listArchivedSandboxes,
  getSandboxQuota,
  getWorkspaceStatus,
  checkoutBranch,
  getRepoBranches
} from '../services/agentApi';
import { 
  DEFAULT_PROJECTS_LIST, 
  MOCK_REPOSITORIES_LIST 
} from '../mockData';

const ACTION_OPTIONS = [
  { id: 'upload_files', label: 'Upload photos and files', icon: Paperclip },
  { id: 'tag_agent', label: 'Tag agent (@)', icon: AtSign }
];

export default function DevelopView({ 
  currentUser, 
  githubProjects = [], 
  githubLoading = false, 
  githubError = null,
  githubToken = '',
  setGithubToken = () => {},
  fetchGithubProjects = () => {},
  workspaces = [],
  onCreateWorkspace
}) {
  const [inputMode, setInputMode] = useState('Agent'); // Agent | Ask
  const [inputText, setInputText] = useState('');
  
  // Sidebar state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Sandboxes & Quota State
  const [activeSandboxes, setActiveSandboxes] = useState(() => {
    try {
      const saved = localStorage.getItem('podinino_active_sandboxes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [archivedSandboxes, setArchivedSandboxes] = useState([]);
  const [activeSandboxId, setActiveSandboxId] = useState(() => {
    try {
      return localStorage.getItem('podinino_active_sandbox') || null;
    } catch {
      return null;
    }
  });
  const [openSandboxes, setOpenSandboxes] = useState({});
  const [isArchivedOpen, setIsArchivedOpen] = useState(false);
  const [isNewSandboxModalOpen, setIsNewSandboxModalOpen] = useState(false);
  const [quota, setQuota] = useState({ active: 0, limit: 5 });

  const [hoveredSess, setHoveredSess] = useState(null);

  // Projects & Repositories State
  const [availableRepos, setAvailableRepos] = useState(MOCK_REPOSITORIES_LIST);
  const [selectedRepo, setSelectedRepo] = useState(() => {
    return availableRepos.length > 0 ? (availableRepos[0].name || availableRepos[0].id) : 'podi-ui-service';
  });
  const [showRepoSelector, setShowRepoSelector] = useState(false);

  // Action (+) Menu & File Upload State
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showBottomActionMenu, setShowBottomActionMenu] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const fileInputRef = useRef(null);

  // Chat & Agent Session States
  const [activeSessionId, setActiveSessionId] = useState(() => {
    try {
      return localStorage.getItem('podinino_active_session') || null;
    } catch {
      return null;
    }
  });
  const [messages, setMessages] = useState(() => {
    try {
      const savedSess = localStorage.getItem('podinino_active_session');
      if (savedSess) {
        const savedMsgs = localStorage.getItem(`podinino_messages_${savedSess}`);
        if (savedMsgs) return JSON.parse(savedMsgs);
      }
      return [];
    } catch {
      return [];
    }
  });
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  const [recentSessions, setRecentSessions] = useState(() => {
    try {
      const saved = localStorage.getItem('podinino_recent_sessions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const activeStreamRef = useRef(null);
  const textareaRef = useRef(null);
  const bottomTextareaRef = useRef(null);
  const actionMenuRef = useRef(null);
  const bottomActionMenuRef = useRef(null);
  const repoButtonRef = useRef(null);

  // Fetch active and archived sandboxes
  const loadSandboxes = async () => {
    try {
      let [activeList, archivedList] = await Promise.all([
        listActiveSandboxes(currentUser?.id).catch(() => []),
        listArchivedSandboxes(currentUser?.id).catch(() => [])
      ]);
      
      // Fallback: If query with currentUser.id yielded no active sandboxes, fetch all active sandboxes
      if ((!Array.isArray(activeList) || activeList.length === 0) && currentUser?.id) {
        try {
          const allActive = await listActiveSandboxes(null);
          if (Array.isArray(allActive) && allActive.length > 0) {
            activeList = allActive;
          }
        } catch (e) {}
      }

      const mergedActive = Array.isArray(activeList) ? [...activeList] : [];
      (workspaces || []).forEach(w => {
        const id = w.id || w.workspace_id;
        if (!mergedActive.find(s => s.workspace_id === id || s.id === id)) {
          mergedActive.push({
            id: id,
            workspace_id: id,
            name: w.name || id,
            repos: w.repos || (w.repo ? [{ name: w.repo, branch: w.branch || 'main' }] : []),
            status: w.status || 'Ready',
            code_server_url: w.url,
            created_at: w.createdTime
          });
        }
      });

      setActiveSandboxes(mergedActive);
      try { localStorage.setItem('podinino_active_sandboxes', JSON.stringify(mergedActive)); } catch (e) {}
      setArchivedSandboxes(Array.isArray(archivedList) ? archivedList : []);
      setQuota({ active: mergedActive.length, limit: 5 });

      // Default active sandbox selection
      setActiveSandboxId(prev => {
        const saved = localStorage.getItem('podinino_active_sandbox');
        const candidate = prev || saved;
        if (candidate && (mergedActive.some(s => s.id === candidate || s.workspace_id === candidate) || (archivedList || []).some(s => s.id === candidate || s.workspace_id === candidate))) {
          try { localStorage.setItem('podinino_active_sandbox', candidate); } catch (e) {}
          return candidate;
        }
        const fallback = mergedActive.length > 0 ? (mergedActive[0].id || mergedActive[0].workspace_id) : null;
        if (fallback) {
          try { localStorage.setItem('podinino_active_sandbox', fallback); } catch (e) {}
        }
        return fallback;
      });

      // Expand all active sandboxes by default
      const openMap = {};
      mergedActive.forEach(s => {
        const sid = s.id || s.workspace_id;
        openMap[sid] = true;
      });
      setOpenSandboxes(prev => ({ ...openMap, ...prev }));
    } catch (e) {
      console.warn('Could not load sandboxes:', e);
    }
  };

  useEffect(() => {
    loadSandboxes();
  }, [currentUser, workspaces]);

  // Global keyboard shortcuts: ⌘N for new chat
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewSession(activeSandboxId);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSandboxId]);

  // Merge GitHub projects into available repos
  useEffect(() => {
    if (Array.isArray(githubProjects) && githubProjects.length > 0) {
      const mapped = githubProjects.map(r => ({
        id: r.name,
        name: r.name,
        full_name: r.full_name,
        category: 'All,Public',
        clone_url: r.clone_url || r.html_url
      }));
      setAvailableRepos(prev => {
        const existing = new Set(prev.map(p => p.name.toLowerCase()));
        const unique = mapped.filter(m => !existing.has(m.name.toLowerCase()));
        return [...unique, ...prev];
      });
    }
  }, [githubProjects]);

  // Load chat sessions from backend
  useEffect(() => {
    const fetchSessions = async () => {
      try {
        let data = await listSessions(50, currentUser?.id);
        if ((!Array.isArray(data) || data.length === 0) && currentUser?.id) {
          try {
            const allSess = await listSessions(50, null);
            if (Array.isArray(allSess) && allSess.length > 0) {
              data = allSess;
            }
          } catch (e) {}
        }

        if (Array.isArray(data) && data.length > 0) {
          setRecentSessions(prev => {
            const merged = [...data];
            prev.forEach(p => {
              if (!merged.find(m => m.id === p.id || m.session_id === p.id)) {
                merged.push(p);
              }
            });
            try { localStorage.setItem('podinino_recent_sessions', JSON.stringify(merged)); } catch (e) {}
            return merged;
          });

          // Restore active session if cached or pick the current active session
          const savedActiveSess = localStorage.getItem('podinino_active_session');
          if (savedActiveSess) {
            handleSelectSession(savedActiveSess);
          } else if (activeSandboxId) {
            const sbxSess = data.find(s => s.workspace_id === activeSandboxId || s.projectId === activeSandboxId);
            if (sbxSess) {
              handleSelectSession(sbxSess.id || sbxSess.session_id, activeSandboxId);
            }
          }
        }
      } catch (err) {
        // Backend chat-service not reachable
      }
    };
    fetchSessions();
  }, [currentUser, activeSandboxId]);

  // Resolved active sandbox entity
  const activeSandbox = useMemo(() => {
    if (!activeSandboxId) return null;
    return activeSandboxes.find(s => (s.id === activeSandboxId || s.workspace_id === activeSandboxId)) ||
           archivedSandboxes.find(s => (s.id === activeSandboxId || s.workspace_id === activeSandboxId)) ||
           null;
  }, [activeSandboxes, archivedSandboxes, activeSandboxId]);

  // Agent Harness configured for active sandbox (selected at sandbox creation)
  const currentHarness = useMemo(() => {
    return getHarness(activeSandbox?.harness);
  }, [activeSandbox?.harness]);
  const currentModel = currentHarness;

  const isArchivedActive = useMemo(() => {
    return !!archivedSandboxes.find(s => (s.id === activeSandboxId || s.workspace_id === activeSandboxId));
  }, [archivedSandboxes, activeSandboxId]);

  // Chat Branch State
  const [currentBranch, setCurrentBranch] = useState('main');
  const [serverBranches, setServerBranches] = useState([]);

  // Fetch actual branches from GitHub / sandbox pod when sandbox changes
  useEffect(() => {
    if (!activeSandbox) return;
    const primaryRepoItem = (activeSandbox.repos && activeSandbox.repos.length > 0)
      ? activeSandbox.repos[0]
      : null;
    const primaryRepoName = typeof primaryRepoItem === 'object' ? primaryRepoItem?.name : primaryRepoItem;
    
    // Cross-reference with githubProjects to pass rich repo metadata (owner, full_name, clone_url)
    const ghMatch = githubProjects?.find(p => 
      p.name === primaryRepoName || 
      p.full_name?.endsWith(`/${primaryRepoName}`) ||
      (typeof primaryRepoItem === 'object' && primaryRepoItem?.full_name && p.full_name === primaryRepoItem.full_name)
    );

    const repoInput = {
      ...(ghMatch || {}),
      ...(typeof primaryRepoItem === 'object' ? primaryRepoItem : (primaryRepoName ? { name: primaryRepoName } : {}))
    };

    if (repoInput.name || repoInput.full_name) {
      getRepoBranches(repoInput, githubToken, activeSandbox.workspace_id || activeSandbox.id)
        .then(branches => {
          if (Array.isArray(branches) && branches.length > 0) {
            setServerBranches(branches);
          }
        })
        .catch(() => {});
    }
  }, [activeSandboxId, activeSandbox?.repos, githubProjects, githubToken]);

  const activeSandboxBranches = useMemo(() => {
    const branches = [...serverBranches];
    if (activeSandbox) {
      if (activeSandbox.repos && Array.isArray(activeSandbox.repos)) {
        activeSandbox.repos.forEach(r => {
          if (typeof r === 'object' && r.branch) {
            branches.push(r.branch);
          }
        });
      }
      if (activeSandbox.branch) {
        branches.push(activeSandbox.branch);
      }
    }
    const unique = Array.from(new Set(branches)).filter(Boolean);
    return unique.length > 0 ? unique : ['main'];
  }, [activeSandbox, serverBranches]);

  // Sync current branch when selecting a new sandbox or session
  useEffect(() => {
    if (!activeSessionId && activeSandbox) {
      setCurrentBranch(prev => {
        if (prev && activeSandboxBranches.includes(prev)) {
          return prev;
        }
        return (activeSandbox.repos?.[0]?.branch) || activeSandbox.branch || (activeSandboxBranches[0] || 'main');
      });
    }
  }, [activeSandboxId, activeSandbox, activeSessionId, activeSandboxBranches]);

  const handleChangeBranch = async (newBranch, checkoutFrom = null) => {
    if (!newBranch) return;
    setCurrentBranch(newBranch);
    setServerBranches(prev => Array.from(new Set([newBranch, ...prev])));

    // If active session exists, update it in recent sessions
    if (activeSessionId) {
      setRecentSessions(prev => {
        const updated = prev.map(s => {
          if (s.id === activeSessionId || s.session_id === activeSessionId) {
            return { ...s, branch: newBranch };
          }
          return s;
        });
        try {
          localStorage.setItem('podinino_recent_sessions', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    }

    // Attempt background checkout with checkoutFrom if sandbox is available
    if (activeSandbox) {
      const primaryRepoName = (activeSandbox.repos && activeSandbox.repos.length > 0)
        ? (activeSandbox.repos[0].name || activeSandbox.repos[0])
        : null;
      try {
        await checkoutBranch(newBranch, primaryRepoName, checkoutFrom, activeSandbox.workspace_id || activeSandbox.id);
      } catch (e) {
        console.debug('Git checkout note:', e);
      }
    }
  };

  // Helpers for sandbox status
  const isSandboxReady = (status) => status === 'Ready' || status === 'Running';
  const isSandboxWarming = (status) => !status || status === 'Provisioning' || status === 'Starting' || status === 'Pending' || status === 'Creating' || status === 'Spinning';

  // Poll warming sandboxes until ready
  useEffect(() => {
    const warmingSandboxes = activeSandboxes.filter(s => isSandboxWarming(s.status));
    if (warmingSandboxes.length === 0) return;

    const interval = setInterval(async () => {
      for (const sbx of warmingSandboxes) {
        const sid = sbx.id || sbx.workspace_id;
        try {
          const data = await getWorkspaceStatus(sid);
          if (data.status === 'Running' || data.phase === 'Ready' || (data.ready_replicas && data.ready_replicas > 0)) {
            setActiveSandboxes(prev => prev.map(s => {
              if (s.id === sid || s.workspace_id === sid) {
                return {
                  ...s,
                  status: 'Ready',
                  code_server_url: data.workspace_url || s.code_server_url
                };
              }
              return s;
            }));
          } else if (data.status === 'Error' || data.phase === 'Error') {
            setActiveSandboxes(prev => prev.map(s => {
              if (s.id === sid || s.workspace_id === sid) {
                return {
                  ...s,
                  status: 'Error'
                };
              }
              return s;
            }));
          }
        } catch (err) {
          // ignore transient poll error
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeSandboxes]);

  // Handle file uploads from local computer
  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setAttachedFiles(prev => [...prev, ...files.map(f => ({
        name: f.name,
        size: f.size,
        type: f.type,
        file: f
      }))]);
    }
    e.target.value = '';
  };

  // Action Menu Handler
  const handleActionSelect = (actionId) => {
    setShowActionMenu(false);
    setShowBottomActionMenu(false);
    if (actionId === 'upload_files') {
      fileInputRef.current?.click();
    } else if (actionId === 'tag_agent') {
      setInputText(prev => (prev.endsWith('@') || prev === '' ? `${prev}@` : `${prev} @`));
      textareaRef.current?.focus();
      bottomTextareaRef.current?.focus();
    }
  };

  const toggleSandboxAccordion = (id) => {
    setOpenSandboxes(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  // Start a new chat session in the target sandbox
  const handleNewSession = (sandboxId = activeSandboxId) => {
    setActiveSessionId(null);
    try { localStorage.removeItem('podinino_active_session'); } catch (e) {}
    setMessages([]);
    if (sandboxId) {
      setActiveSandboxId(sandboxId);
      try { localStorage.setItem('podinino_active_sandbox', sandboxId); } catch (e) {}
      const target = activeSandboxes.find(s => (s.id === sandboxId || s.workspace_id === sandboxId));
      if (target) {
        const defB = (target.repos?.[0]?.branch) || target.branch || 'main';
        setCurrentBranch(defB);
      }
    } else if (activeSandbox) {
      const defB = (activeSandbox.repos?.[0]?.branch) || activeSandbox.branch || 'main';
      setCurrentBranch(defB);
    }
    const url = new URL(window.location);
    url.searchParams.delete('session');
    window.history.replaceState({}, '', url);
  };

  // Select a past conversation thread
  const handleSelectSession = async (sessId, sandboxId) => {
    if (sandboxId) {
      setActiveSandboxId(sandboxId);
      try { localStorage.setItem('podinino_active_sandbox', sandboxId); } catch (e) {}
    }
    setActiveSessionId(sessId);
    try { localStorage.setItem('podinino_active_session', sessId); } catch (e) {}

    // Look up cached session branch
    const cachedSess = recentSessions.find(s => (s.id === sessId || s.session_id === sessId));
    if (cachedSess?.branch) {
      setCurrentBranch(cachedSess.branch);
    }

    // Try loading from backend first
    try {
      const data = await getSession(sessId);
      if (data?.branch) {
        setCurrentBranch(data.branch);
      }
      const rawList = data?.messages || data?.history || [];
      if (rawList && rawList.length > 0) {
        const mapped = rawList.map((h, idx) => ({
          id: h.id || `hist-${idx}`,
          role: h.role === 'assistant' ? 'assistant' : 'user',
          userName: h.role === 'assistant' ? currentHarness.name : (currentUser?.name || 'You'),
          author: h.role === 'assistant' ? currentHarness.name : (currentUser?.name || 'You'),
          content: typeof h.content === 'string' ? h.content : (h.message?.content || ''),
          text: typeof h.content === 'string' ? h.content : (h.message?.content || ''),
          time: 'Just now'
        }));
        setMessages(mapped);
        return;
      }
    } catch (err) {
      console.log('Session history notice:', err.message);
    }

    // Try loading from localStorage
    try {
      const saved = localStorage.getItem(`podinino_messages_${sessId}`);
      if (saved) {
        let parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch (e) {}

    setMessages([]);
  };

  // Create a new multi-repo sandbox
  const handleCreateNewSandbox = async (newWorkspace) => {
    // Immediately put in active list as Provisioning (Spinning workspace...)
    setActiveSandboxes(prev => [newWorkspace, ...prev.filter(s => (s.id !== newWorkspace.id && s.workspace_id !== newWorkspace.id))]);
    setActiveSandboxId(newWorkspace.id);
    setOpenSandboxes(prev => ({ ...prev, [newWorkspace.id]: true }));
    setQuota(prev => ({ ...prev, active: prev.active + 1 }));
    handleNewSession(newWorkspace.id);

    if (onCreateWorkspace) {
      onCreateWorkspace(newWorkspace);
    }

    try {
      const res = await createSandbox({
        workspace_id: newWorkspace.id,
        name: newWorkspace.name,
        owner_id: currentUser?.id,
        repos: newWorkspace.repos,
        harness: newWorkspace.harness || 'claude-code',
        storage_size: newWorkspace.storage_size,
        cpu_request: newWorkspace.cpu_request,
        memory_request: newWorkspace.memory_request,
        cpu_limit: newWorkspace.cpu_limit,
        memory_limit: newWorkspace.memory_limit
      });

      if (res && res.workspace_id) {
        setActiveSandboxes(prev => prev.map(s => {
          if (s.id === newWorkspace.id || s.workspace_id === newWorkspace.id) {
            return {
              ...s,
              id: res.workspace_id,
              workspace_id: res.workspace_id,
              name: res.name || s.name,
              repos: res.repos || s.repos
            };
          }
          return s;
        }));
      }
    } catch (err) {
      console.error('Failed to create sandbox:', err);
      setActiveSandboxes(prev => prev.map(s => {
        if (s.id === newWorkspace.id || s.workspace_id === newWorkspace.id) {
          return { ...s, status: 'Error' };
        }
        return s;
      }));
    }
  };

  // Delete a sandbox
  const handleDeleteSandbox = async (sandboxId, sandboxName) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete sandbox "${sandboxName || sandboxId}"?\n\nIts Kubernetes container will be stopped and cluster resources reclaimed. Conversation logs will be preserved in your Archived section below.`
    );
    if (!confirmed) return;

    try {
      await deleteSandbox(sandboxId);
      // Move from active to archived
      setActiveSandboxes(prev => {
        const found = prev.find(s => s.id === sandboxId || s.workspace_id === sandboxId);
        if (found) {
          setArchivedSandboxes(aPrev => [{
            ...found,
            status: 'Deleted',
            deleted_at: new Date().toISOString()
          }, ...aPrev]);
        }
        return prev.filter(s => s.id !== sandboxId && s.workspace_id !== sandboxId);
      });
      setQuota(prev => ({ ...prev, active: Math.max(0, prev.active - 1) }));

      if (activeSandboxId === sandboxId) {
        setActiveSandboxId(null);
        setActiveSessionId(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete sandbox:', err);
      alert(err.message || 'Failed to delete sandbox');
    }
  };

  // Interrupt active execution turn
  const handleInterrupt = async () => {
    if (activeStreamRef.current) {
      activeStreamRef.current.abort();
    }
    if (activeSessionId) {
      try {
        await interruptSession(activeSessionId);
      } catch (err) {
        console.warn('Interrupt failed:', err);
      }
    }
    setIsAgentRunning(false);
  };

  // Send message turn
  const handleSendMessage = async () => {
    const prompt = inputText.trim();
    if (!prompt || isAgentRunning) return;

    // Check if user has an active sandbox
    if (!activeSandboxId || !activeSandbox) {
      setIsNewSandboxModalOpen(true);
      return;
    }

    if (isArchivedActive) {
      alert("This sandbox is archived and read-only. Please select or create an active sandbox to run new prompts.");
      return;
    }

    let finalPrompt = prompt;
    if (attachedFiles.length > 0) {
      const filesSummary = attachedFiles.map(f => `[Attached file: ${f.name}]`).join(' ');
      finalPrompt = `${filesSummary}\n${prompt}`.trim();
      setAttachedFiles([]);
    }

    setInputText('');

    // 1. Immediately append User turn
    const userTurn = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: finalPrompt,
      userName: currentUser?.name || 'You',
      time: 'Just now'
    };

    // 2. Add assistant placeholder turn
    const assistantTurnId = `assistant-${Date.now()}`;
    const assistantPlaceholder = {
      id: assistantTurnId,
      role: 'assistant',
      author: currentHarness.name,
      thoughtTime: null,
      thinking: '',
      text: ''
    };

    const newMessages = [...messages, userTurn, assistantPlaceholder];
    setMessages(newMessages);
    setIsAgentRunning(true);

    let currentSession = activeSessionId;
    const targetWorkspaceId = activeSandbox.workspace_id || activeSandbox.id;

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!currentSession || !uuidRegex.test(currentSession)) {
      currentSession = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
      setActiveSessionId(currentSession);
      try {
        localStorage.setItem('podinino_active_session', currentSession);
        localStorage.setItem('podinino_active_sandbox', targetWorkspaceId);
      } catch (e) {}


      const primaryRepo = (activeSandbox.repos && activeSandbox.repos.length > 0) 
        ? (activeSandbox.repos[0].name || activeSandbox.repos[0]) 
        : activeSandbox.name;

      const chatBranch = currentBranch || (activeSandbox.repos?.[0]?.branch) || activeSandbox.branch || 'main';

      const newSessionEntry = {
        id: currentSession,
        session_id: currentSession,
        title: prompt.length > 35 ? prompt.slice(0, 35) + '...' : prompt,
        repo: primaryRepo,
        workspace_id: targetWorkspaceId,
        projectId: targetWorkspaceId,
        branch: chatBranch,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        tag: 'Active',
        statusDotClass: 'ready'
      };

      setRecentSessions(prev => {
        const updated = [newSessionEntry, ...prev.filter(s => s.id !== currentSession && s.session_id !== currentSession)];
        try {
          localStorage.setItem('podinino_recent_sessions', JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });

      // Register session with backend chat service
      try {
        await createSession({
          session_id: currentSession,
          session_name: newSessionEntry.title,
          target_repo: primaryRepo,
          workspace_id: targetWorkspaceId,
          branch: chatBranch,
          repos: (activeSandbox.repos || []).map(r => 
            typeof r === 'object' 
              ? { ...r, branch: chatBranch } 
              : { name: r, branch: chatBranch }
          )
        });
      } catch (e) {
        console.warn('Backend session registration note:', e);
      }

      // Proactively checkout branch on sandbox pod if ready
      if (isSandboxReady(activeSandbox.status)) {
        checkoutBranch(chatBranch, primaryRepo).catch(err => {
          console.debug('Background pod checkout note:', err);
        });
      }
    }

    try {
      localStorage.setItem(`podinino_messages_${currentSession}`, JSON.stringify(newMessages));
    } catch (e) {}

    try {
      // Stream response directly using active sandbox workspace ID
      activeStreamRef.current = sendMessageStream(
        currentSession,
        {
          prompt,
          workspace_id: targetWorkspaceId,
          allowed_tools: ["Read", "Edit", "Write", "Glob", "Grep", "Bash"]
        },
        {
          onThinking: (data) => {
            if (data?.thinking) {
              setMessages(prev => {
                const updated = prev.map(m => 
                  m.id === assistantTurnId 
                    ? { ...m, thinking: (m.thinking || '') + data.thinking } 
                    : m
                );
                try {
                  localStorage.setItem(`podinino_messages_${currentSession}`, JSON.stringify(updated));
                } catch (e) {}
                return updated;
              });
            }
          },
          onText: (data) => {
            if (data?.text) {
              setMessages(prev => {
                const updated = prev.map(m => 
                  m.id === assistantTurnId 
                    ? { ...m, text: (m.text || '') + data.text } 
                    : m
                );
                try {
                  localStorage.setItem(`podinino_messages_${currentSession}`, JSON.stringify(updated));
                } catch (e) {}
                return updated;
              });
            }
          },
          onToolUse: (data) => {
            setMessages(prev => {
              const updated = prev.map(m => {
                if (m.id === assistantTurnId) {
                  const existingTools = m.toolCalls || [];
                  return { ...m, toolCalls: [...existingTools, data] };
                }
                return m;
              });
              try {
                localStorage.setItem(`podinino_messages_${currentSession}`, JSON.stringify(updated));
              } catch (e) {}
              return updated;
            });
          },
          onToolResult: (data) => {
            setMessages(prev => {
              const updated = prev.map(m => {
                if (m.id === assistantTurnId && m.toolCalls) {
                  const updatedTools = m.toolCalls.map(t =>
                    t.tool_use_id === data.tool_use_id ? { ...t, result: data.output, is_error: data.is_error } : t
                  );
                  return { ...m, toolCalls: updatedTools };
                }
                return m;
              });
              try {
                localStorage.setItem(`podinino_messages_${currentSession}`, JSON.stringify(updated));
              } catch (e) {}
              return updated;
            });
          },
          onResult: (data) => {
            if (data?.duration_ms) {
              const durationSec = (data.duration_ms / 1000).toFixed(1) + 's';
              setMessages(prev => {
                const updated = prev.map(m => 
                  m.id === assistantTurnId 
                    ? { ...m, thoughtTime: durationSec } 
                    : m
                );
                try {
                  localStorage.setItem(`podinino_messages_${currentSession}`, JSON.stringify(updated));
                } catch (e) {}
                return updated;
              });
            }
          },
          onError: (err) => {
            console.error('SSE stream error:', err);
            setMessages(prev => {
              const updated = prev.map(m => 
                m.id === assistantTurnId 
                  ? { 
                      ...m, 
                      error: true, 
                      text: m.text ? m.text : (err?.error || err?.detail || err?.message || 'Error communicating with agent service') 
                    } 
                  : m
              );
              try {
                localStorage.setItem(`podinino_messages_${currentSession}`, JSON.stringify(updated));
              } catch (e) {}
              return updated;
            });
            setIsAgentRunning(false);
          },
          onDone: () => {
            setIsAgentRunning(false);
          }
        }
      );
    } catch (e) {
      console.error('Failed to initiate agent stream:', e);
      setMessages(prev => {
        const updated = prev.map(m => 
          m.id === assistantTurnId 
            ? { 
                ...m, 
                error: true, 
                text: e.message || 'Unable to connect to agent service.' 
              } 
            : m
        );
        return updated;
      });
      setIsAgentRunning(false);
    }
  };

  const hasMessages = messages.length > 0;

  const renderSandboxContextBar = () => {
    if (!activeSandbox) {
      return (
        <div style={{
          width: '100%',
          maxWidth: hasMessages ? '860px' : '740px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 14px',
          backgroundColor: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: '10px',
          marginTop: hasMessages ? '0' : '16px',
          marginBottom: hasMessages ? '14px' : '0',
          color: '#92400e',
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
            <AlertTriangle size={15} />
            <span>No sandbox selected. Create a sandbox or select one from the sidebar.</span>
          </div>
          <button
            type="button"
            onClick={() => setIsNewSandboxModalOpen(true)}
            style={{
              padding: '5px 12px',
              backgroundColor: '#7c3aed',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            + New Sandbox
          </button>
        </div>
      );
    }

    return (
      <div style={{
        width: '100%',
        maxWidth: hasMessages ? '860px' : '740px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 14px',
        backgroundColor: isArchivedActive ? '#fef2f2' : '#f8fafc',
        border: `1px solid ${isArchivedActive ? '#fecaca' : '#e2e8f0'}`,
        borderRadius: '10px',
        marginTop: hasMessages ? '0' : '16px',
        marginBottom: hasMessages ? '14px' : '0',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isArchivedActive ? '#ef4444' : (isSandboxReady(activeSandbox.status) ? '#10b981' : '#f59e0b'),
            flexShrink: 0
          }} />
          <span style={{ fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>
            {activeSandbox.name || activeSandbox.id}
          </span>
          {isArchivedActive ? (
            <span style={{ fontSize: '11px', color: '#b91c1c', backgroundColor: '#fee2e2', padding: '1px 6px', borderRadius: '4px', fontWeight: '600' }}>
              Archived / Read-Only
            </span>
          ) : isSandboxWarming(activeSandbox.status) ? (
            <span style={{ 
              fontSize: '11.5px', 
              color: '#b45309', 
              backgroundColor: '#fef3c7', 
              padding: '1px 8px', 
              borderRadius: '4px', 
              fontWeight: '500',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <Loader2 size={12} style={{ animation: 'spin 1.5s linear infinite' }} />
              <span>Spinning workspace...</span>
            </span>
          ) : null}

          {/* Repos badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            {(activeSandbox.repos || []).map((r, i) => (
              <span key={i} style={{
                fontSize: '11px',
                color: '#475569',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                padding: '1px 6px'
              }}>
                {r.name || r}
              </span>
            ))}
          </div>

          {/* Branch Selector in Upside Bar */}
          <BranchSelector
            currentBranch={currentBranch}
            onChangeBranch={handleChangeBranch}
            availableBranches={activeSandboxBranches}
            disabled={isArchivedActive || hasMessages || !!activeSessionId}
            disabledTooltip={
              (hasMessages || !!activeSessionId)
                ? `Branch: ${currentBranch} (Start a new chat to switch branch)`
                : 'Archived sandbox (read-only)'
            }
            placement="bottom"
            title="Chat Branch"
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isArchivedActive && activeSandbox.code_server_url && (
            <a
              href={activeSandbox.code_server_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#7c3aed',
                textDecoration: 'none'
              }}
            >
              <ExternalLink size={13} />
              <span>Open IDE</span>
            </a>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      height: 'calc(100vh - 52px)',
      backgroundColor: '#ffffff',
      overflow: 'hidden',
      position: 'relative'
    }}>
      
      {/* --- LEFT SIDEBAR: SANDBOXES & ARCHIVED (Redesigned) --- */}
      <div style={{
        width: isSidebarOpen ? '280px' : '0px',
        borderRight: isSidebarOpen ? '1px solid #e2e8f0' : 'none',
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.25s ease',
        overflow: 'hidden',
        flexShrink: 0
      }}>
        <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', height: '100%', minWidth: '280px' }}>
          
          {/* Top CTA: + New Sandbox */}
          <button
            type="button"
            onClick={() => setIsNewSandboxModalOpen(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '9px 12px',
              marginBottom: '14px',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              color: '#0f172a',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f8fafc';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = '#e2e8f0';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={15} color="#7c3aed" />
              <span>New Sandbox</span>
            </div>
            <span style={{
              fontSize: '11px',
              fontWeight: '600',
              color: quota.active >= quota.limit ? '#ef4444' : '#64748b',
              backgroundColor: quota.active >= quota.limit ? '#fef2f2' : '#f1f5f9',
              border: `1px solid ${quota.active >= quota.limit ? '#fecaca' : '#e2e8f0'}`,
              borderRadius: '4px',
              padding: '1px 6px'
            }}>
              {quota.active} / {quota.limit}
            </span>
          </button>

          {/* SANDBOXES SECTION HEADER */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '4px 6px',
            marginBottom: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: '700', color: '#64748b', letterSpacing: '0.6px', textTransform: 'uppercase' }}>
                SANDBOXES
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                color: '#475569',
                backgroundColor: '#f1f5f9',
                borderRadius: '6px',
                padding: '1px 6px'
              }}>
                {activeSandboxes.length}
              </span>
            </div>
          </div>

          {/* ACTIVE SANDBOXES ACCORDION LIST */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {activeSandboxes.length === 0 ? (
              <div style={{
                padding: '24px 14px',
                textAlign: 'center',
                fontSize: '12px',
                color: '#94a3b8',
                lineHeight: 1.5,
                border: '1px dashed #e2e8f0',
                borderRadius: '8px',
                margin: '8px 0'
              }}>
                No active sandboxes yet. Click <strong>+ New Sandbox</strong> to select your repositories and launch a workspace.
              </div>
            ) : (
              activeSandboxes.map((sbx) => {
                const sid = sbx.id || sbx.workspace_id;
                const isSelected = activeSandboxId === sid;
                const isOpen = openSandboxes[sid] !== false;
                
                // Filter sessions that belong to this sandbox
                const sbxSessions = recentSessions.filter(s => 
                  (s.workspace_id && s.workspace_id === sid) ||
                  (s.projectId && s.projectId === sid)
                );

                const isReady = isSandboxReady(sbx.status);
                const isWarming = isSandboxWarming(sbx.status);
                const isError = sbx.status === 'Error';
                const statusColor = isReady ? '#10b981' : (isError ? '#ef4444' : '#f59e0b');
                const repoCount = (sbx.repos || []).length;

                return (
                  <div key={sid} style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Sandbox Parent Card */}
                    <div 
                      onClick={() => {
                        setActiveSandboxId(sid);
                        if (!messages.length && sbxSessions.length === 0) {
                          handleNewSession(sid);
                        }
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        border: isSelected ? '1px solid #cbd5e1' : '1px solid #f1f5f9',
                        backgroundColor: isSelected ? '#f8fafc' : '#ffffff',
                        boxShadow: isSelected ? '0 1px 3px rgba(15, 23, 42, 0.04)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                          <span style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: statusColor,
                            flexShrink: 0
                          }} />
                          <span style={{ 
                            fontSize: '13px', 
                            fontWeight: isSelected ? '700' : '600', 
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {sbx.name || sid}
                          </span>
                        </div>

                        {/* Quick actions (New chat, IDE, Delete) */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            title="Start new chat in this sandbox"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveSandboxId(sid);
                              handleNewSession(sid);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              cursor: 'pointer',
                              padding: '2px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#7c3aed'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                          >
                            <Plus size={14} />
                          </button>

                          {sbx.code_server_url && (
                            <a
                              href={sbx.code_server_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Open in Code-Server IDE"
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                color: '#64748b',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '2px'
                              }}
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}

                          <button
                            type="button"
                            title="Delete sandbox and reclaim resources"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteSandbox(sid, sbx.name);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: '2px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
                          >
                            <Trash2 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSandboxAccordion(sid);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Repos Badge Summary or Spinning Status */}
                      {isWarming ? (
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#d97706', 
                          marginLeft: '15px', 
                          marginTop: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <Loader2 size={11} style={{ animation: 'spin 1.5s linear infinite' }} />
                          <span>Spinning workspace...</span>
                        </div>
                      ) : (
                        <div style={{ 
                          fontSize: '11px', 
                          color: '#64748b', 
                          marginLeft: '15px', 
                          marginTop: '3px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          flexWrap: 'wrap'
                        }}>
                          {repoCount === 0 ? (
                            <span>No repos</span>
                          ) : (
                            (sbx.repos || []).map((r, i) => (
                              <span key={i} style={{
                                backgroundColor: '#ffffff',
                                border: '1px solid #e2e8f0',
                                borderRadius: '3px',
                                padding: '0 4px',
                                fontSize: '10.5px'
                              }}>
                                {r.name || r}
                              </span>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Sub-sessions Tree under Sandbox */}
                    {isOpen && (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        marginLeft: '14px',
                        paddingLeft: '10px',
                        borderLeft: '1.5px solid #e2e8f0',
                        marginTop: '4px',
                        marginBottom: '4px',
                        gap: '2px'
                      }}>
                        {sbxSessions.length === 0 ? (
                          <div 
                            onClick={() => {
                              setActiveSandboxId(sid);
                              handleNewSession(sid);
                            }}
                            style={{
                              padding: '5px 8px',
                              fontSize: '11.5px',
                              color: '#7c3aed',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Plus size={12} />
                            <span>Start first conversation</span>
                          </div>
                        ) : (
                          sbxSessions.map((sess) => {
                            const isSessActive = activeSessionId === (sess.id || sess.session_id);
                            const sessTitle = sess.title || sess.prompt || sess.name || `Chat ${sess.id?.slice(-6) || ''}`;

                            return (
                              <div
                                key={sess.id || sess.session_id}
                                onClick={() => handleSelectSession(sess.id || sess.session_id, sid)}
                                onMouseEnter={() => setHoveredSess(sess.id || sess.session_id)}
                                onMouseLeave={() => setHoveredSess(null)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '5px 8px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  backgroundColor: isSessActive ? '#f1f5f9' : (hoveredSess === (sess.id || sess.session_id) ? '#f8fafc' : 'transparent'),
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
                                  <span style={{
                                    fontSize: '12px',
                                    color: isSessActive ? '#0f172a' : '#475569',
                                    fontWeight: isSessActive ? '600' : '400',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}>
                                    {sessTitle}
                                  </span>
                                  {sess.branch && (
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '2px',
                                      fontSize: '9.5px',
                                      fontWeight: '600',
                                      color: isSessActive ? '#7c3aed' : '#64748b',
                                      backgroundColor: isSessActive ? '#ede9fe' : '#f1f5f9',
                                      padding: '1px 4px',
                                      borderRadius: '3px',
                                      flexShrink: 0
                                    }}>
                                      <GitBranch size={9} />
                                      <span>{sess.branch}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* --- ARCHIVED SANDBOXES SECTION (Read-Only History) --- */}
            {archivedSandboxes.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                <div 
                  onClick={() => setIsArchivedOpen(!isArchivedOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: '#64748b',
                    fontSize: '11px',
                    fontWeight: '700',
                    letterSpacing: '0.5px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Archive size={13} color="#94a3b8" />
                    <span>ARCHIVED ({archivedSandboxes.length})</span>
                  </div>
                  {isArchivedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </div>

                {isArchivedOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                    {archivedSandboxes.map(sbx => {
                      const sid = sbx.id || sbx.workspace_id;
                      const isSelected = activeSandboxId === sid;
                      const sbxSessions = recentSessions.filter(s => 
                        (s.workspace_id && s.workspace_id === sid) ||
                        (s.projectId && s.projectId === sid)
                      );

                      return (
                        <div key={sid} style={{ display: 'flex', flexDirection: 'column' }}>
                          <div 
                            onClick={() => {
                              setActiveSandboxId(sid);
                              if (sbxSessions.length > 0) {
                                handleSelectSession(sbxSessions[0].id || sbxSessions[0].session_id, sid);
                              }
                            }}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                              border: isSelected ? '1px solid #cbd5e1' : '1px solid transparent'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '12px', fontWeight: '500', color: '#64748b' }}>
                                {sbx.name || sid}
                              </span>
                              <span style={{ fontSize: '10px', color: '#94a3b8', backgroundColor: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>
                                Deleted
                              </span>
                            </div>
                          </div>

                          {/* Historical chats */}
                          {sbxSessions.length > 0 && isSelected && (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              marginLeft: '12px',
                              paddingLeft: '8px',
                              borderLeft: '1px solid #cbd5e1',
                              marginTop: '2px',
                              gap: '2px'
                            }}>
                              {sbxSessions.map(sess => (
                                <div
                                  key={sess.id || sess.session_id}
                                  onClick={() => handleSelectSession(sess.id || sess.session_id, sid)}
                                  style={{
                                    padding: '4px 6px',
                                    fontSize: '11.5px',
                                    color: activeSessionId === (sess.id || sess.session_id) ? '#7c3aed' : '#64748b',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {sess.title || sess.prompt || 'Conversation'}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Controls: Settings & Collapse */}
          <div style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '10px',
            borderTop: '1px solid #e2e8f0'
          }}>
            <button
              type="button"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                padding: '6px 8px',
                borderRadius: '6px'
              }}
            >
              <Settings size={15} />
              <span>Settings</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              title="Collapse sidebar"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                color: '#64748b',
                padding: '6px',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

        </div>
      </div>

      {/* Toggle Sidebar Button (when collapsed) */}
      {!isSidebarOpen && (
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          style={{
            position: 'absolute',
            top: '16px',
            left: '16px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            color: '#64748b',
            padding: '8px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
            zIndex: 10
          }}
        >
          <PanelLeftOpen size={16} />
        </button>
      )}

      {/* --- MAIN CENTER CANVAS --- */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: hasMessages ? 'flex-start' : 'center',
        padding: hasMessages ? '16px 24px 12px 24px' : '32px 24px',
        position: 'relative',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        backgroundColor: '#ffffff',
        boxSizing: 'border-box'
      }}>

        {/* TOP PLACEMENT: When chat has started */}
        {hasMessages && renderSandboxContextBar()}

        {/* --- STATE A: HERO / EMPTY LANDING --- */}
        {!hasMessages && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            maxWidth: '740px',
            animation: 'fadeIn 0.25s ease'
          }}>
            {/* Center Branding: podinino logo */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '10px' }}>
              <img 
                src="/podinino-logo.svg" 
                alt="podinino" 
                style={{ height: '44px', width: 'auto', display: 'block', userSelect: 'none' }} 
              />
            </div>

            {/* Subtitle */}
            <div style={{
              fontSize: '14.5px',
              color: '#64748b',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              What would you like to build in your sandbox today?
            </div>

            {/* Agent / Ask Toggle Switcher Pill */}
            <div style={{
              display: 'flex',
              backgroundColor: '#f1f5f9',
              borderRadius: '20px',
              padding: '3px',
              marginBottom: '24px'
            }}>
              <button
                type="button"
                onClick={() => setInputMode('Agent')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: inputMode === 'Agent' ? '#ffffff' : 'transparent',
                  color: inputMode === 'Agent' ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '5px 16px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  boxShadow: inputMode === 'Agent' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <Zap size={13} color="#7c3aed" fill="#7c3aed" />
                <span>Agent</span>
              </button>

              <button
                type="button"
                onClick={() => setInputMode('Ask')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: inputMode === 'Ask' ? '#ffffff' : 'transparent',
                  color: inputMode === 'Ask' ? '#0f172a' : '#64748b',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '5px 16px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  boxShadow: inputMode === 'Ask' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <MessageSquare size={13} color="#64748b" />
                <span>Ask</span>
              </button>
            </div>

            {/* Main Floating Prompt Input Card */}
            <div style={{
              width: '100%',
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              boxShadow: '0 4px 20px rgba(15, 23, 42, 0.04)',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column'
            }}>
              {/* Attached Files Preview */}
              {attachedFiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', padding: '12px 16px 0 16px' }}>
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 8px',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#334155'
                    }}>
                      <Paperclip size={12} color="#64748b" />
                      <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '0 2px',
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  isArchivedActive
                    ? "This sandbox is archived (read-only)..."
                    : isAgentRunning 
                      ? "Agent is working..."
                      : "Ask Podinino to build, test, or refactor code across your sandbox microservices..."
                }
                disabled={isAgentRunning || isArchivedActive}
                style={{
                  width: '100%',
                  minHeight: '84px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: '#0f172a',
                  fontSize: '14.5px',
                  padding: '18px 20px 56px 20px',
                  resize: 'none',
                  outline: 'none',
                  lineHeight: '1.5',
                  boxSizing: 'border-box',
                  fontFamily: 'inherit'
                }}
              />

              {/* Integrated Bottom Toolbar inside Input Card */}
              <div style={{
                position: 'absolute',
                bottom: '12px',
                left: '16px',
                right: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* + Context Attachment Button */}
                  <div style={{ position: 'relative' }} ref={actionMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowActionMenu(prev => !prev)}
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={15} />
                    </button>

                    {showActionMenu && (
                      <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 8px)',
                        left: 0,
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        width: '190px',
                        padding: '6px',
                        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.1)',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}>
                        {ACTION_OPTIONS.map(opt => {
                          const IconComp = opt.icon;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleActionSelect(opt.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                padding: '7px 10px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12.5px',
                                color: '#334155',
                                textAlign: 'left'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <IconComp size={14} color="#7c3aed" />
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Controls: Submit / Interrupt Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Submit / Interrupt Button */}
                  {isAgentRunning ? (
                    <button
                      type="button"
                      onClick={handleInterrupt}
                      title="Interrupt agent"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: '#ef4444',
                        color: '#ffffff',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Square size={13} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={!inputText.trim() || isArchivedActive}
                      title="Send prompt"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: '#0f172a',
                        color: '#ffffff',
                        border: 'none',
                        cursor: (inputText.trim() && !isArchivedActive) ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: (inputText.trim() && !isArchivedActive) ? 1 : 0.4
                      }}
                    >
                      <ArrowUp size={16} color="#ffffff" strokeWidth={2.5} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* BOTTOM PLACEMENT: Context bar below chat box on initial empty landing */}
            {renderSandboxContextBar()}
          </div>
        )}

        {/* --- STATE B: CHAT STREAM (Multi-Turn Conversation) --- */}
        {hasMessages && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            flex: 1,
            minHeight: 0,
            maxWidth: '860px',
            overflow: 'hidden'
          }}>
            <AgentChatStream 
              messages={messages}
              isAgentRunning={isAgentRunning}
              currentModel={currentModel}
            />

            {/* Fixed Chat Input Card at Bottom */}
            <div style={{
              width: '100%',
              flexShrink: 0,
              backgroundColor: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '12px 14px',
              boxShadow: '0 4px 16px rgba(15, 23, 42, 0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              marginTop: '10px',
              boxSizing: 'border-box'
            }}>
              {/* Attached Files Preview */}
              {attachedFiles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {attachedFiles.map((file, idx) => (
                    <div key={idx} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 8px',
                      backgroundColor: '#f1f5f9',
                      border: '1px solid #e2e8f0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#334155'
                    }}>
                      <Paperclip size={12} color="#64748b" />
                      <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: '0 2px',
                          color: '#94a3b8',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <textarea
                ref={bottomTextareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={isArchivedActive ? "Archived conversation (read-only)..." : "Follow up with Podinino across your sandbox microservices..."}
                disabled={isAgentRunning || isArchivedActive}
                style={{
                  width: '100%',
                  minHeight: '44px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '13.5px',
                  color: '#0f172a',
                  resize: 'none',
                  lineHeight: '1.4'
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ position: 'relative' }} ref={bottomActionMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowBottomActionMenu(prev => !prev)}
                      title="Upload files or tag agent"
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: showBottomActionMenu ? '#f1f5f9' : '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#64748b',
                        cursor: 'pointer'
                      }}
                    >
                      <Plus size={14} />
                    </button>

                    {showBottomActionMenu && (
                      <div style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 8px)',
                        left: 0,
                        backgroundColor: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: '12px',
                        width: '190px',
                        padding: '6px',
                        boxShadow: '0 10px 30px rgba(15, 23, 42, 0.1)',
                        zIndex: 100,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}>
                        {ACTION_OPTIONS.map(opt => {
                          const IconComp = opt.icon;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleActionSelect(opt.id)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                padding: '7px 10px',
                                background: 'transparent',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '12.5px',
                                color: '#334155',
                                textAlign: 'left'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            >
                              <IconComp size={14} color="#7c3aed" />
                              <span>{opt.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Send Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || isAgentRunning || isArchivedActive}
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '7px',
                      backgroundColor: '#0f172a',
                      color: '#ffffff',
                      border: 'none',
                      cursor: (inputText.trim() && !isArchivedActive) ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: (inputText.trim() && !isArchivedActive) ? 1 : 0.4
                    }}
                  >
                    <ArrowUp size={15} color="#ffffff" strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Hidden File Input for uploading from computer */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        multiple 
        style={{ display: 'none' }} 
      />

      {/* New Sandbox Modal */}
      <NewWorkspaceModal 
        isOpen={isNewSandboxModalOpen}
        onClose={() => setIsNewSandboxModalOpen(false)}
        onCreate={handleCreateNewSandbox}
        currentUser={currentUser}
        githubProjects={githubProjects}
        activeCount={activeSandboxes.length}
        quotaLimit={quota.limit}
      />

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
