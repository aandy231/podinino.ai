import React, { useState, useEffect, useRef } from 'react';
import { Plus, Search, AlertCircle, Sparkles, Terminal, Activity, Key, Settings, Cpu, Database, HardDrive, ShieldCheck, Check, ChevronRight, FolderGit2, Globe, MessageSquare, Layout, HelpCircle, Bell, LogOut, BarChart2 } from 'lucide-react';
import { INITIAL_WORKSPACES, generateLogs, DEVELOPERS } from './mockData';
import WorkspaceGroup from './components/WorkspaceGroup';
import NewWorkspaceModal from './components/NewWorkspaceModal';
import SettingsPanel from './components/SettingsPanel';
import DevelopView from './components/DevelopView';
import CostAnalyticsDashboard from './components/CostAnalyticsDashboard';
import SkillsView from './components/SkillsView';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [githubToken, setGithubToken] = useState('');
  const [currentUser, setCurrentUser] = useState(DEVELOPERS[0]); // default fallback
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Organization & Team Hierarchy Context
  const [userContext, setUserContext] = useState(null);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [currentTeam, setCurrentTeam] = useState(null);

  // Core Workspaces State
  const [workspaces, setWorkspaces] = useState([]);
  
  // Navigation & Filtering States
  const [sidebarTab, setSidebarTab] = useState('develop'); // develop, sandboxes, analytics, cluster, ssh, ai
  const [activeTab, setActiveTab] = useState('Your'); // All, Your, Projects (default to 'Your' for user-centricity!)
  const [searchQuery, setSearchQuery] = useState('');
  
  // GitHub Integration States
  const [githubProjects, setGithubProjects] = useState([]);
  const [githubLoading, setGithubLoading] = useState(false);
  const [githubError, setGithubError] = useState(null);
  const [modalPreselectedRepo, setModalPreselectedRepo] = useState(null);
  const [modalAutoLaunchAgent, setModalAutoLaunchAgent] = useState(false);
  
  // Sidebar Collapse state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // User Profile Dropdown Menu State
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Close user profile dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: ⌘K / Ctrl+K focuses global search
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const searchInput = document.getElementById('global-search-input');
        searchInput?.focus();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);
  
  // Modals & Panels States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');


  
  // Toast Notification State
  const [toast, setToast] = useState({ show: false, message: '' });

  // Simulated Log Streams Storage (mapping workspaceId -> current logs list)
  const [logStreams, setLogStreams] = useState({});

  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);

  // Authentication & Session restoration on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    
    if (code) {
      setIsAuthenticating(true);
      
      // Clear code from URL query parameters
      window.history.replaceState({}, document.title, window.location.pathname);
      
      const redirect_uri = window.location.origin + '/';
      fetch("/api/v1/auth/github", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ code, redirect_uri })
      })
      .then(async res => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || `GitHub authentication failed (${res.status})`);
        }
        return res.json();
      })
      .then(data => {
        setGithubToken(data.access_token);
        const userObj = {
          id: `git-${data.user.id}`,
          login: data.user.login || data.user.name,
          name: data.user.name || data.user.login,
          avatar: data.user.avatar_url || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=facearea&facepad=2&w=150&h=150&q=80',
          email: data.user.email || ''
        };
        setCurrentUser(userObj);
        setIsAuthenticated(true);
        
        // Save in localStorage for session persistence
        localStorage.setItem('sandbox_oauth_token', data.access_token);
        localStorage.setItem('sandbox_oauth_user', JSON.stringify(userObj));
        
        showToast(`Welcome back, ${data.user.name}!`);
      })
      .catch(err => {
        console.error(err);
        showToast(err.message || "Authentication failed. Please check your GitHub config.");
      })
      .finally(() => {
        setIsAuthenticating(false);
      });
    } else {
      // Check localStorage for existing session
      const savedToken = localStorage.getItem('sandbox_oauth_token');
      const savedUser = localStorage.getItem('sandbox_oauth_user');
      if (savedToken && savedUser) {
        setGithubToken(savedToken);
        setCurrentUser(JSON.parse(savedUser));
        setIsAuthenticated(true);
      }
    }
  }, []);

  // Fetch Organizational & Team Hierarchy Context
  useEffect(() => {
    if (!isAuthenticated) return;
    const uid = currentUser?.id || currentUser?.login || 'default-user';
    const uname = currentUser?.name || currentUser?.login || '';
    fetch(`/api/v1/context?user_id=${encodeURIComponent(uid)}&username=${encodeURIComponent(uname)}`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to load user context");
        return res.json();
      })
      .then(data => {
        setUserContext(data);
        if (data.organizations && data.organizations.length > 0) {
          setCurrentOrg(data.organizations[0]);
        }
        if (data.teams && data.teams.length > 0) {
          setCurrentTeam(data.teams[0]);
        }
      })
      .catch(err => {
        console.warn("Could not load organization hierarchy context:", err);
      });
  }, [isAuthenticated, currentUser?.id]);

  const handleSelectOrg = (org) => {
    setCurrentOrg(org);
    const matching = (userContext?.teams || []).filter(t => t.org_id === org.id);
    if (matching.length > 0) setCurrentTeam(matching[0]);
  };

  const handleSelectTeam = (team) => {
    setCurrentTeam(team);
  };

  const handleCreateTeam = async (teamData) => {
    try {
      const uid = currentUser?.id || currentUser?.login || 'default-user';
      const res = await fetch(`/api/v1/organizations/${teamData.org_id}/teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': uid
        },
        body: JSON.stringify(teamData)
      });
      if (res.ok) {
        const created = await res.json();
        setUserContext(prev => ({
          ...prev,
          teams: [...(prev?.teams || []), created]
        }));
        setCurrentTeam(created);
        showToast(`Team "${created.name}" created!`);
      }
    } catch (e) {
      console.error(e);
      showToast('Failed to create team');
    }
  };

  // Fetch workspaces when authenticated
  useEffect(() => {
    if (!isAuthenticated) return;

    setLoadingWorkspaces(true);
    fetch("/api/workspaces")
      .then(res => {
        if (!res.ok) throw new Error("Failed to load workspaces");
        return res.json();
      })
      .then(data => {
        const mapped = data.map(ws => {
          const repo = [
            'podi-ui-service',
            'dashboard-frontend',
            'spinup-service',
            'auth-service',
            'chat-service',
            'integration-service',
            'claude-code-sandbox',
            'podinino-helm-charts'
          ].find(r => ws.workspace_id.toLowerCase().includes(r)) || ws.workspace_id.split('-').slice(0, 2).join('-');

          
          return {
            id: ws.workspace_id,
            name: ws.workspace_id,
            repo: repo,
            branch: "main",
            owner: currentUser,
            createdTime: new Date().toISOString(),
            lastActiveTime: new Date().toISOString(),
            ticket: null,
            status: ws.status === "Running" && ws.ready_replicas > 0
              ? "Ready"
              : (ws.status === "Failed"
                  ? "Error"
                  : (ws.status === "Deleting"
                      ? "Terminating"
                      : "Provisioning")),
            url: ws.workspace_url || ws.code_server_url || `http://${ws.workspace_id}.workspaces.local`,
            aiAgentActive: true
          };
        });
        setWorkspaces(mapped);

        // Pre-populate logs stream for ready workspaces
        const initialStreams = {};
        mapped.forEach(w => {
          if (w.status === 'Ready') {
            initialStreams[w.id] = generateLogs(w.name, w.branch);
          } else {
            initialStreams[w.id] = [{ type: 'info', text: 'Preparing workspace containers...' }];
          }
        });
        setLogStreams(initialStreams);
      })
      .catch(err => {
        console.error("Error loading workspaces:", err);
      })
      .finally(() => {
        setLoadingWorkspaces(false);
      });
  }, [isAuthenticated, currentUser]);

  // Display toast message helper
  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => {
      setToast({ show: false, message: '' });
    }, 3000);
  };

  // Fetch projects from GitHub integration service
  const fetchGithubProjects = async (tokenOverride = null) => {
    const token = tokenOverride || githubToken || localStorage.getItem('sandbox_oauth_token');
    if (!token) return;
    setGithubLoading(true);
    setGithubError(null);
    try {
      const response = await fetch("/api/v1/github/repos", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch repositories: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      setGithubProjects(data);
      return data;
    } catch (err) {
      console.error("Error fetching projects:", err);
      setGithubError(err.message || "Could not retrieve repositories from the GitHub service.");
    } finally {
      setGithubLoading(false);
    }
  };

  // Trigger projects fetch when token is loaded or changes
  useEffect(() => {
    if (githubToken) {
      fetchGithubProjects(githubToken);
    }
  }, [githubToken]);

  // Trigger projects fetch when switching to projects tab
  useEffect(() => {
    if (activeTab === 'Projects') {
      fetchGithubProjects();
    }
  }, [activeTab]);

  // Launch a sandbox from projects tab
  const handleLaunchFromProject = (project, launchAgent = false) => {
    setModalPreselectedRepo({
      name: project.name,
      cloneUrl: project.clone_url
    });
    setModalAutoLaunchAgent(launchAgent);
    setIsModalOpen(true);
  };

  // Helper to poll workspace status from spinup-service
  const pollWorkspaceStatus = (workspaceId) => {
    const pollInterval = setInterval(() => {
      fetch(`/api/workspace/${workspaceId}`)
        .then(res => {
          if (!res.ok) throw new Error("Status check failed");
          return res.json();
        })
        .then(data => {
          if (data.status === "Running" && data.ready_replicas > 0) {
            clearInterval(pollInterval);
            setWorkspaces(prev => prev.map(w => 
              w.id === workspaceId 
                ? { ...w, status: 'Ready', url: data.workspace_url } 
                : w
            ));
            
            // Append final K8s running log to stream
            setLogStreams(prev => {
              const currentStream = prev[workspaceId] || [];
              const timestamp = () => `[${new Date().toISOString().split('T')[1].substring(0, 8)}]`;
              return {
                ...prev,
                [workspaceId]: [
                  ...currentStream,
                  { type: 'success', text: `${timestamp()} SUCCESS sandbox: Pod ready! Accessible at ${data.workspace_url}` }
                ]
              };
            });
            showToast(`Sandbox is online and ready!`);
          } else if (data.status === "Failed") {
            clearInterval(pollInterval);
            setWorkspaces(prev => prev.map(w => 
              w.id === workspaceId ? { ...w, status: 'Error' } : w
            ));
            setLogStreams(prev => {
              const currentStream = prev[workspaceId] || [];
              const timestamp = () => `[${new Date().toISOString().split('T')[1].substring(0, 8)}]`;
              return {
                ...prev,
                [workspaceId]: [
                  ...currentStream,
                  { type: 'error', text: `${timestamp()} ERROR sandbox: Provisioning failed. Check agent logs.` }
                ]
              };
            });
            showToast(`Sandbox provisioning failed!`);
          }
        })
        .catch(err => {
          console.error("Polling error for", workspaceId, err);
        });
    }, 4000);

    // Stop polling after 5 minutes to prevent infinite loops
    setTimeout(() => {
      clearInterval(pollInterval);
    }, 300000);
  };

  // Launch simulated provisioning sequence for a new workspace
  const handleCreateWorkspace = (newWorkspace) => {
    // Add workspace to list in "Provisioning" state
    setWorkspaces(prev => [newWorkspace, ...prev]);
    showToast(`Sandbox "${newWorkspace.name}" scheduling in K8s...`);

    // Begin logging stream simulation
    const fullLogsList = generateLogs(newWorkspace.name, newWorkspace.branch);
    let currentLogsIndex = 0;
    
    // Initialize stream with first line
    setLogStreams(prev => ({
      ...prev,
      [newWorkspace.id]: [fullLogsList[0]]
    }));

    // Start timer interval to append log lines
    const logInterval = setInterval(() => {
      currentLogsIndex++;
      if (currentLogsIndex < fullLogsList.length) {
        setLogStreams(prev => {
          const currentStream = prev[newWorkspace.id] || [];
          const updatedStream = [...currentStream, fullLogsList[currentLogsIndex]];
          
          return {
            ...prev,
            [newWorkspace.id]: updatedStream
          };
        });
      } else {
        clearInterval(logInterval);
        // Add pending log line waiting for K8s pod to become ready
        setLogStreams(prev => {
          const currentStream = prev[newWorkspace.id] || [];
          const timestamp = () => `[${new Date().toISOString().split('T')[1].substring(0, 8)}]`;
          return {
            ...prev,
            [newWorkspace.id]: [
              ...currentStream,
              { type: 'info', text: `${timestamp()} INFO  sandbox: Waiting for Kubernetes pod replicas to report ready...` }
            ]
          };
        });
      }
    }, 600);

    const token = githubToken || localStorage.getItem('sandbox_oauth_token') || '';
    const reposPayload = (newWorkspace.repos || (newWorkspace.repoUrl ? [{ name: newWorkspace.repo, git_url: newWorkspace.repoUrl, branch: newWorkspace.branch }] : [])).map(r => ({
      ...r,
      github_token: token,
      github_pat: token
    }));

    // Trigger POST call to spinup-service to deploy K8s resources
    fetch("/api/spinworkspace", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "Authorization": `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        workspace_id: newWorkspace.id,
        name: newWorkspace.name || newWorkspace.id,
        owner_id: currentUser?.id,
        team_id: newWorkspace.team_id || currentTeam?.id,
        org_id: newWorkspace.org_id || currentOrg?.id,
        github_token: token,
        github_pat: token,
        repos: reposPayload,
        skill_ids: newWorkspace.skill_ids || [],
        harness: newWorkspace.harness || 'claude-code',
        storage_size: newWorkspace.storage_size || "10Gi",
        cpu_request: newWorkspace.cpu_request || "200m",
        memory_request: newWorkspace.memory_request || "512Mi",
        cpu_limit: newWorkspace.cpu_limit || "1000m",
        memory_limit: newWorkspace.memory_limit || "2Gi"
      })
    })
    .then(async (res) => {
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to spin up workspace");
      }
      return res.json();
    })
    .then((data) => {
      showToast(`Sandbox deployment initiated successfully!`);
      // Start polling for K8s deployment ready status
      pollWorkspaceStatus(newWorkspace.id);
    })
    .catch((err) => {
      console.error(err);
      showToast(`Provisioning failed: ${err.message}`);
      clearInterval(logInterval);
      setWorkspaces(prev => prev.map(w => 
        w.id === newWorkspace.id 
          ? { ...w, status: 'Error' } 
          : w
      ));
      setLogStreams(prev => {
        const currentStream = prev[newWorkspace.id] || [];
        const timestamp = () => `[${new Date().toISOString().split('T')[1].substring(0, 8)}]`;
        return {
          ...prev,
          [newWorkspace.id]: [
            ...currentStream,
            { type: 'error', text: `${timestamp()} ERROR kubelet: Provisioning failed. Reason: ${err.message}` }
          ]
        };
      });
    });
  };

  // Delete Workspace Action: simulates pod termination before clean removal
  const handleDeleteWorkspace = (workspaceId) => {
    const ws = workspaces.find(w => w.id === workspaceId);
    if (!ws) return;

    // Transition status to Terminating
    setWorkspaces(prev => prev.map(w => 
      w.id === workspaceId ? { ...w, status: 'Terminating' } : w
    ));
    showToast(`Initiating teardown of sandbox "${ws.name}"...`);

    // Generate K8s termination logs
    const timestamp = () => `[${new Date().toISOString().split('T')[1].substring(0, 8)}]`;
    const terminationLogs = [
      { type: 'info', text: `${timestamp()} INFO  kubelet: Received deletion request for pod "${ws.name}"` },
      { type: 'info', text: `${timestamp()} INFO  code-server: Sent SIGTERM signal to server processes...` },
      { type: 'info', text: `${timestamp()} SUCCESS code-server: Safely shut down all WebSocket listeners` },
      { type: 'info', text: `${timestamp()} INFO  git-sync: Commencing final sandbox auto-sync...` },
      { type: 'success', text: `${timestamp()} SUCCESS git-sync: Stashed all latest commits to PVC storage` },
      { type: 'info', text: `${timestamp()} INFO  storage: Safely unmounted persistent volume "sandbox-storage"` },
      { type: 'info', text: `${timestamp()} INFO  kubelet: Releasing assigned IP subnet address allocations` },
      { type: 'info', text: `${timestamp()} INFO  kubelet: Terminated pod container "code-server-pod"` },
      { type: 'success', text: `${timestamp()} SUCCESS sandbox: Resources destroyed. Pod removed.` }
    ];

    let currentLogsIndex = 0;
    setLogStreams(prev => ({
      ...prev,
      [workspaceId]: [terminationLogs[0]]
    }));

    const interval = setInterval(() => {
      currentLogsIndex++;
      if (currentLogsIndex < terminationLogs.length) {
        setLogStreams(prev => {
          const currentStream = prev[workspaceId] || [];
          const updatedStream = [...currentStream, terminationLogs[currentLogsIndex]];
          
          return {
            ...prev,
            [workspaceId]: updatedStream
          };
        });
      } else {
        // Termination complete! Remove workspace from the state list.
        clearInterval(interval);
        setWorkspaces(prev => prev.filter(w => w.id !== workspaceId));
        showToast(`Sandbox "${ws.name}" has been deleted.`);
      }
    }, 400);

    // Call DELETE API on spinup-service to delete deployment, svc, ingress, PVC
    fetch(`/api/workspace/${workspaceId}`, {
      method: "DELETE"
    })
    .then(async (res) => {
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Deletion request failed");
      }
      return res.json();
    })
    .catch((err) => {
      console.error("Deletion failed for workspace", workspaceId, err);
      showToast(`Cluster deletion error: ${err.message}`);
    });
  };



  // Copy Workspace Ingress link to Clipboard
  const handleShareLink = (url) => {
    navigator.clipboard.writeText(url).then(() => {
      showToast('Sandbox share ingress URL copied!');
    });
  };

  // --- Filtering & Sorting Engine ---
  const filteredWorkspaces = workspaces.filter(w => {
    // Tab filters: 'Your' returns only current user's sandboxes
    if (activeTab === 'Your' && w.owner.id !== currentUser.id) return false;
    if (activeTab === 'Projects') return false;

    // Search query filter
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      const matchBranch = w.branch.toLowerCase().includes(query);
      const matchOwner = w.owner.name.toLowerCase().includes(query);
      const matchRepo = w.repo.toLowerCase().includes(query);
      const matchTicket = w.ticket && w.ticket.id.toLowerCase().includes(query);
      
      return matchBranch || matchOwner || matchRepo || matchTicket;
    }
    return true;
  });

  // Filter projects based on search query
  const filteredProjects = githubProjects.filter(project => {
    if (searchQuery.trim() === '') return true;
    const query = searchQuery.toLowerCase();
    const matchName = project.name?.toLowerCase().includes(query);
    const matchFullName = project.full_name?.toLowerCase().includes(query);
    const matchDesc = project.description?.toLowerCase().includes(query);
    return matchName || matchFullName || matchDesc;
  });

  // Group workspaces dynamically by their repository name
  const groupedWorkspaces = filteredWorkspaces.reduce((acc, curr) => {
    if (!acc[curr.repo]) {
      acc[curr.repo] = [];
    }
    acc[curr.repo].push(curr);
    return acc;
  }, {});

  const handleLogout = () => {
    localStorage.removeItem('sandbox_oauth_token');
    localStorage.removeItem('sandbox_oauth_user');
    
    // Clean up active session tracking
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('podinino_active_session')) {
        localStorage.removeItem(key);
      }
    });

    const url = new URL(window.location);
    url.searchParams.delete('session');
    window.history.replaceState({}, '', url);

    setIsAuthenticated(false);
    setGithubToken('');
    setCurrentUser(DEVELOPERS[0]);
    showToast("Logged out successfully");
  };

  if (isAuthenticating) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#08080a',
        backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(95, 90, 246, 0.15) 0%, transparent 60%)',
        color: '#fff',
        gap: '20px'
      }}>
        <div style={{
          width: '50px',
          height: '50px',
          borderRadius: '50%',
          border: '3px solid rgba(255, 255, 255, 0.05)',
          borderTopColor: 'var(--primary)',
          animation: 'spin-loading 1s linear infinite'
        }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.3px' }}>Logging in...</h2>
        </div>
        <style>{`
          @keyframes spin-loading {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!isAuthenticated) {
    const handleGithubLogin = () => {
      const clientId = 'Ov23ligd1Sh8SXMKmaIO';
      const redirectUri = encodeURIComponent(window.location.origin + '/');
      window.location.href = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user%20repo&prompt=select_account`;
    };

    const handleGoogleLogin = () => {
      showToast("Google login is not yet configured.");
    };

    const handleEmailPasswordLogin = (e) => {
      e.preventDefault();
      
      // Bypasses OAuth for quick offline demo testing if email contains "mock", "test", "dev", or in localhost
      if (loginEmail.toLowerCase().includes('mock') || loginEmail.toLowerCase().includes('test') || loginEmail.toLowerCase().includes('dev') || window.location.hostname === 'localhost') {
        const defaultUser = DEVELOPERS[0];
        setGithubToken('mock-oauth-token');
        setCurrentUser(defaultUser);
        setIsAuthenticated(true);
        
        localStorage.setItem('sandbox_oauth_token', 'mock-oauth-token');
        localStorage.setItem('sandbox_oauth_user', JSON.stringify(defaultUser));
        localStorage.setItem('user_id', defaultUser.id || 'user-default');
        localStorage.setItem('org_id', 'org-default');
        showToast(`Welcome back, ${defaultUser.name}!`);
        return;
      }

      // Default behavior redirects standard users directly to GitHub OAuth
      handleGithubLogin();
    };

    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100vw',
        height: '100vh',
        backgroundColor: '#f8fafc',
        color: '#0f172a',
        fontFamily: 'var(--font-sans)',
      }}>
        <div style={{
          width: '100%',
          maxWidth: '400px',
          margin: '0 16px',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.02)',
          padding: '40px 36px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          {/* Podinino Logo */}
          <img 
            src="/podinino-logo.svg" 
            alt="Podinino" 
            style={{ height: '36px', objectFit: 'contain', marginBottom: '20px' }} 
          />

          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 6px 0', letterSpacing: '-0.4px' }}>
              Welcome to Podinino
            </h1>
            <p style={{ fontSize: '13.5px', color: '#64748b', margin: 0 }}>
              Sign in to manage and launch developer sandboxes
            </p>
          </div>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              type="button"
              onClick={handleGithubLogin}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px 16px',
                color: '#0f172a',
                fontSize: '13.5px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
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
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#0f172a">
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
              </svg>
              Continue with GitHub
            </button>

            <button
              type="button"
              onClick={handleGoogleLogin}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px 16px',
                color: '#0f172a',
                fontSize: '13.5px',
                fontWeight: '500',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.03)'
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
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', width: '100%', margin: '20px 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
            <span style={{ padding: '0 10px', fontSize: '11px', color: '#94a3b8', fontWeight: '600', letterSpacing: '0.6px' }}>OR</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }}></div>
          </div>

          <form onSubmit={handleEmailPasswordLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <input 
              type="email" 
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder="name@company.com"
              required
              style={{
                width: '100%',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '11px 14px',
                color: '#0f172a',
                fontSize: '13.5px',
                outline: 'none',
                transition: 'all 0.15s ease',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#0f172a';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(15, 23, 42, 0.06)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            
            <button
              type="submit"
              style={{
                width: '100%',
                backgroundColor: '#0f172a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '11px 16px',
                fontSize: '13.5px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'background-color 0.15s ease',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.12)'
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#1e293b'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#0f172a'}
            >
              Continue with Email
            </button>
          </form>

          <div style={{ fontSize: '12.5px', color: '#64748b', marginTop: '24px' }}>
            Already have an account? <span style={{ color: '#0f172a', cursor: 'pointer', fontWeight: '600', textDecoration: 'underline' }} onClick={() => showToast("Login form coming soon!")}>Log in</span>
          </div>
        </div>
      </div>
    );
  }



  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#ffffff' }}>
      
      {/* Main Content Area Scrollable */}
      <div className="main-content-scroll" style={{ position: 'relative', width: '100vw', height: '100vh', backgroundColor: '#ffffff' }}>
        
        {/* Sticky Header Bar (Matching Image 1, 2, 3, 4) */}
        <header style={{
          position: 'sticky',
          top: 0,
          height: '52px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 20px',
          zIndex: 99,
          flexShrink: 0
        }}>
          {/* Left Side: Brand Logo & Navigation Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div 
              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} 
              onClick={() => setSidebarTab('develop')}
            >
              <img 
                src="/podinino-logo.svg" 
                alt="podinino" 
                style={{ height: '22px', width: 'auto', display: 'block' }} 
              />
            </div>

            {/* Top Navigation Links: Develop, Sandboxes, Analytics */}
            <nav style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button 
                onClick={() => setSidebarTab('develop')}
                style={{
                  background: sidebarTab === 'develop' ? '#f1f5f9' : 'transparent',
                  border: 'none',
                  color: sidebarTab === 'develop' ? '#0f172a' : '#64748b',
                  fontWeight: sidebarTab === 'develop' ? '600' : '500',
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (sidebarTab !== 'develop') e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (sidebarTab !== 'develop') e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Develop
              </button>

              <button 
                onClick={() => setSidebarTab('sandboxes')}
                style={{
                  background: sidebarTab === 'sandboxes' ? '#f1f5f9' : 'transparent',
                  border: 'none',
                  color: sidebarTab === 'sandboxes' ? '#0f172a' : '#64748b',
                  fontWeight: sidebarTab === 'sandboxes' ? '600' : '500',
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (sidebarTab !== 'sandboxes') e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (sidebarTab !== 'sandboxes') e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Sandboxes
              </button>

              <button 
                onClick={() => setSidebarTab('skills')}
                style={{
                  background: sidebarTab === 'skills' ? '#f1f5f9' : 'transparent',
                  border: 'none',
                  color: sidebarTab === 'skills' ? '#0f172a' : '#64748b',
                  fontWeight: sidebarTab === 'skills' ? '600' : '500',
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (sidebarTab !== 'skills') e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (sidebarTab !== 'skills') e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Skills
              </button>

              <button 
                onClick={() => setSidebarTab('analytics')}
                style={{
                  background: sidebarTab === 'analytics' ? '#f1f5f9' : 'transparent',
                  border: 'none',
                  color: sidebarTab === 'analytics' ? '#0f172a' : '#64748b',
                  fontWeight: sidebarTab === 'analytics' ? '600' : '500',
                  fontSize: '13px',
                  cursor: 'pointer',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (sidebarTab !== 'analytics') e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (sidebarTab !== 'analytics') e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                Analytics & Cost
              </button>
            </nav>
          </div>

          {/* Center: Global Search Input with ⌘K Badge */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '380px' }}>
            <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: '12px', pointerEvents: 'none' }} />
            <input 
              id="global-search-input"
              type="text" 
              placeholder="Search chats, sandboxes, files..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '6px 48px 6px 34px',
                color: '#0f172a',
                fontSize: '12.5px',
                outline: 'none',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease'
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(124, 58, 237, 0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <span style={{
              position: 'absolute',
              right: '8px',
              fontSize: '11px',
              fontFamily: 'var(--font-mono)',
              color: '#94a3b8',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              padding: '1px 5px',
              pointerEvents: 'none'
            }}>
              ⌘K
            </span>
          </div>

          {/* Right Side: Help, Notification Bell with Alert Dot, and User Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <HelpCircle size={17} color="#64748b" style={{ cursor: 'pointer' }} title="Help & Documentation" />
            
            {/* Notification Bell with Badge Dot */}
            <div style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <Bell size={17} color="#64748b" />
              <span style={{
                position: 'absolute',
                top: '-1px',
                right: '-1px',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: '#7c3aed'
              }} />
            </div>

            {/* User Avatar Circle: Purple circle with initial */}
            <div 
              ref={userMenuRef}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', cursor: 'pointer' }} 
              onClick={() => setIsUserMenuOpen(prev => !prev)}
            >
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: '#8b5cf6',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '600',
                fontSize: '13px',
                userSelect: 'none'
              }}>
                {(currentUser.name || 'P').charAt(0).toUpperCase()}
              </div>

              {/* Dropdown User Menu */}
              {isUserMenuOpen && (
                <div 
                  style={{
                    position: 'absolute',
                    top: '36px',
                    right: 0,
                    width: '220px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.1)',
                    padding: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    zIndex: 100,
                    cursor: 'default'
                  }} 
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* User Profile Header */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 6px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                      {currentUser.name}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {currentUser.email || `${currentUser.name.split(' ')[0].toLowerCase()}@podinino.dev`}
                    </div>
                  </div>
                  
                  <hr style={{ border: 'none', borderBottom: '1px solid #f1f5f9', margin: '4px 0' }} />

                  {/* Sign Out Option */}
                  <button 
                    onClick={() => {
                      handleLogout();
                      setIsUserMenuOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '8px 10px',
                      color: '#ef4444',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fef2f2';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <LogOut size={14} />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        
        {/* TAB 1: SANDBOXES VIEW (Primary dashboard) */}
        {sidebarTab === 'sandboxes' && (
          <main className="container" style={{ marginTop: '24px', flexGrow: 1, paddingBottom: '80px' }}>
            
            {/* Section Header: Title & New Sandbox Trigger */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '24px',
              flexWrap: 'wrap',
              gap: '16px'
            }}>
              <div>
                <h2 style={{ fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px', color: '#0f172a', margin: 0 }}>
                  Sandboxes
                </h2>
              </div>
              
              <button 
                className="neon-border-btn"
                onClick={() => {
                  setActiveTab('Projects');
                }}
                style={{
                  padding: '9px 18px',
                  fontSize: '13.5px',
                  fontWeight: '600'
                }}
              >
                <Plus size={16} />
                <span>New sandbox</span>
              </button>
            </div>

            {/* Filters and Navigation bar */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '28px',
              borderBottom: '1px solid var(--border-color)',
              paddingBottom: '12px',
              flexWrap: 'wrap',
              gap: '16px'
            }}>
              {/* Tab Filters */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {['All sandboxes', 'Your sandboxes', 'Projects'].map((tab) => {
                  const tabValue = tab.split(' ')[0]; // 'All', 'Your', 'Projects'
                  const isActive = activeTab === tabValue;
                  
                  return (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tabValue)}
                      style={{
                        backgroundColor: isActive ? '#f1f5f9' : 'transparent',
                        border: isActive ? '1px solid #e2e8f0' : '1px solid transparent',
                        color: isActive ? '#0f172a' : 'var(--text-secondary)',
                        borderRadius: '8px',
                        padding: '8px 14px',
                        fontSize: '13.5px',
                        fontWeight: isActive ? '600' : '500',
                        cursor: 'pointer',
                        transition: 'var(--transition-smooth)'
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = '#f8fafc';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              {/* Text Search Bar */}
              <div style={{
                position: 'relative',
                width: '100%',
                maxWidth: '300px'
              }}>
                <Search size={15} color="var(--text-muted)" style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)'
                }} />
                <input 
                  type="text" 
                  placeholder="Search branch, owner, ticket..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.01)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '8px',
                    padding: '9px 12px 9px 34px',
                    color: 'var(--text-primary)',
                    fontSize: '13.5px',
                    outline: 'none',
                    transition: 'var(--transition-smooth)'
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = 'var(--primary)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'var(--border-color)'}
                />
              </div>
            </div>

            {/* Dynamic Groups display */}
            {activeTab === 'Projects' ? (
              /* GitHub Projects List View */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{
                  fontSize: '13.5px',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.5',
                  backgroundColor: 'rgba(255, 255, 255, 0.01)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: '10px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ display: 'inline-flex', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--primary)', flexShrink: 0 }}></span>
                  Choose a project or repository below to spin up a secure, on-demand developer sandbox.
                </div>
                
                {githubLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {[1, 2, 3].map(i => (
                      <div key={i} className="glass-panel shimmer" style={{
                        height: '110px',
                        width: '100%',
                        borderRadius: '10px',
                        opacity: 0.6
                      }} />
                    ))}
                  </div>
                )}

                {githubError && (
                  <div className="glass-panel" style={{
                    padding: '24px',
                    borderColor: 'rgba(239, 68, 68, 0.25)',
                    backgroundColor: 'rgba(239, 68, 68, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    textAlign: 'center'
                  }}>
                    <AlertCircle size={24} color="var(--accent-error)" />
                    <div>
                      <h4 style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>Connection Failed</h4>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{githubError}</p>
                    </div>
                    <button 
                      onClick={fetchGithubProjects}
                      className="neon-border-btn"
                      style={{ padding: '6px 14px', fontSize: '12.5px' }}
                    >
                      Retry Connection
                    </button>
                  </div>
                )}

                {!githubLoading && !githubError && githubProjects.length === 0 && (
                  <div className="glass-panel" style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)'
                  }}>
                    No repositories found on this GitHub account.
                  </div>
                )}

                {!githubLoading && !githubError && githubProjects.length > 0 && filteredProjects.length === 0 && (
                  <div className="glass-panel" style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: 'var(--text-secondary)'
                  }}>
                    No repositories found matching "{searchQuery}".
                  </div>
                )}

                {!githubLoading && !githubError && filteredProjects.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {filteredProjects.map((project) => (
                      <div 
                        key={project.id}
                        className="glass-panel"
                        style={{
                          padding: '20px 24px',
                          borderRadius: '10px',
                          backgroundColor: 'var(--bg-card)',
                          borderColor: 'var(--border-color)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '20px',
                          width: '100%',
                          transition: 'var(--transition-smooth)'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-hover)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(95, 90, 246, 0.08)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-color)';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      >
                        {/* Repository details */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 300px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <FolderGit2 size={16} color="var(--primary)" />
                            <a 
                              href={project.html_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ 
                                fontSize: '15px', 
                                fontWeight: '700', 
                                color: '#fff',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                              onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                            >
                              {project.name}
                            </a>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                            {project.full_name}
                          </span>
                          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: '1.4' }}>
                            {project.description || "No repository description provided."}
                          </p>
                        </div>

                        {/* Actions: Launch Sandbox, Launch Agent */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                          {/* Launch Sandbox */}
                          <button
                            onClick={() => handleLaunchFromProject(project, false)}
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.04)',
                              border: '1px solid var(--border-color)',
                              color: '#fff',
                              padding: '8px 14px',
                              borderRadius: '6px',
                              fontSize: '12.5px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'var(--transition-smooth)'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                              e.currentTarget.style.borderColor = 'var(--text-secondary)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                              e.currentTarget.style.borderColor = 'var(--border-color)';
                            }}
                          >
                            <Terminal size={14} />
                            <span>Launch Sandbox</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : loadingWorkspaces ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[1, 2].map(i => (
                  <div key={i} className="glass-panel shimmer" style={{
                    height: '110px',
                    width: '100%',
                    borderRadius: '10px',
                    opacity: 0.6
                  }} />
                ))}
              </div>
            ) : Object.keys(groupedWorkspaces).length > 0 ? (
              Object.entries(groupedWorkspaces).map(([repoName, repoWorkspaces]) => (
                <WorkspaceGroup 
                  key={repoName}
                  repoName={repoName}
                  workspaces={repoWorkspaces}
                  onDelete={handleDeleteWorkspace}
                  onShare={handleShareLink}
                />
              ))
            ) : (
              /* High-Fidelity Empty State widget */
              <div className="glass-panel" style={{
                padding: '50px 40px',
                textAlign: 'center',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '14px',
                maxWidth: '520px',
                margin: '40px auto 0 auto',
                backgroundColor: 'rgba(16, 16, 24, 0.15)'
              }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--border-color)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)'
                }}>
                  <AlertCircle size={18} />
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: '#fff' }}>No sandboxes found</h3>
                  <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '300px', marginInline: 'auto' }}>
                    {searchQuery ? `We couldn't find any environments matching "${searchQuery}".` : 'There are no active AI sandboxes created by you.'}
                  </p>
                </div>
                
                {!searchQuery && (
                  <button 
                    className="neon-border-btn"
                    onClick={() => setActiveTab('Projects')}
                    style={{ marginTop: '6px' }}
                  >
                    <Plus size={14} /> Spin up Sandbox
                  </button>
                )}
              </div>
            )}
          </main>
        )}

        {/* TAB 3: SSH KEYS VIEW */}
        {sidebarTab === 'ssh' && (
          <main className="container" style={{ marginTop: '24px', flexGrow: 1, paddingBottom: '80px', maxWidth: '640px' }}>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#fff' }}>Git SSH Credentials</h2>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Securely store private deploy keys to authorize git-stash checkouts inside code-server sandboxes.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '16px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '6px', backgroundColor: 'rgba(95, 90, 246, 0.08)', display: 'flex', alignItems: 'center', justifyContext: 'center', border: '1px solid rgba(95, 90, 246, 0.15)' }}>
                    <Key size={18} color="var(--primary)" style={{ margin: 'auto' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>Active SSH Private Key</h3>
                    <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Default enterprise EKS deploy credentials index.</p>
                  </div>
                </div>
                
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}>SSH KEY VALUE (RSA SHA256 INDEX):</div>
                  <code style={{ display: 'block', backgroundColor: '#060609', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>
                    ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC9m3dF...4f2eK8zLpqXy1
                  </code>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '12px', fontWeight: '500' }}>
                  <Check size={14} /> Active connection to GitHub established. Authenticated as <strong style={{ color: '#fff' }}>sarah-chen-podinino</strong>
                </div>
              </div>
            </div>
          </main>
        )}

        {/* TAB 4: AI AUTOPILOT PREFERENCES VIEW */}
        {sidebarTab === 'ai' && (
          <main className="container" style={{ marginTop: '24px', flexGrow: 1, paddingBottom: '80px', maxWidth: '640px' }}>
            <div style={{ marginBottom: '32px' }}>
              <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#fff' }}>AI Autopilot Preferences</h2>
              <p style={{ fontSize: '13.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Manage LLM indexes, prompt rules, auto-fixing targets, and usage limit credits.
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '16px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '6px', backgroundColor: 'rgba(217, 70, 239, 0.08)', display: 'flex', alignItems: 'center', justifyContext: 'center', border: '1px solid rgba(217, 70, 239, 0.15)' }}>
                  <Sparkles size={18} color="#e879f9" style={{ margin: 'auto' }} />
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#fff' }}>Active LLM Model Context</h3>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>Locked: EKS-daemon hosted Agentic 3.5 Flash Model</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  <span>Monthly Autopilot Credit Usage</span>
                  <span>$182.40 / $500.00 Limit</span>
                </div>
                <div style={{ height: '6px', backgroundColor: '#13131f', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: '36.5%', height: '100%', backgroundColor: '#d946ef' }}></div>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Estimated vector indexes synced: 8,421 tokens. Dynamic caching active.</span>
              </div>
            </div>
          </main>
        )}

        {/* TAB: SKILLS LIBRARY */}
        {sidebarTab === 'skills' && (
          <main style={{ flexGrow: 1, overflowY: 'auto', backgroundColor: '#ffffff' }}>
            <SkillsView 
              currentUser={currentUser}
              userContext={userContext}
              onOpenNewSandboxWithSkill={(skill) => {
                setIsModalOpen(true);
              }}
            />
          </main>
        )}

        {/* TAB 5: AI COST & MANAGER ANALYTICS DASHBOARD */}
        {sidebarTab === 'analytics' && (
          <main style={{ flexGrow: 1, padding: '24px 32px', overflowY: 'auto', backgroundColor: '#f8fafc' }}>
            <CostAnalyticsDashboard 
              userContext={userContext}
              currentOrg={currentOrg}
              currentTeam={currentTeam}
              currentUser={currentUser}
              userRole={currentTeam?.user_role || 'team_member'}
              onSelectOrg={handleSelectOrg}
              onSelectTeam={handleSelectTeam}
              onCreateTeam={handleCreateTeam}
              onSwitchTeam={setCurrentTeam}
            />
          </main>
        )}

        {/* TAB 6: DEVELOP VIEW */}
        {sidebarTab === 'develop' && (
          <DevelopView 
            currentUser={currentUser}
            githubProjects={githubProjects}
            githubLoading={githubLoading}
            githubError={githubError}
            githubToken={githubToken}
            setGithubToken={setGithubToken}
            fetchGithubProjects={fetchGithubProjects}
            workspaces={workspaces}
            onCreateWorkspace={(createdWs) => {
              if (createdWs && createdWs.id) {
                setWorkspaces(prev => [createdWs, ...prev.filter(w => w.id !== createdWs.id)]);
              }
            }}
          />
        )}

      </div>

      {/* --- Overlay Modals & Drawers --- */}
      <NewWorkspaceModal 
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setModalPreselectedRepo(null);
          setModalAutoLaunchAgent(false);
        }}
        onCreate={handleCreateWorkspace}
        currentUser={currentUser}
        githubProjects={githubProjects}
        availableTeams={userContext?.teams || []}
        selectedTeam={currentTeam}
        activeCount={workspaces.filter(w => w.status !== 'Terminated' && w.status !== 'Deleted').length}
        quotaLimit={5}
        preselectedRepo={modalPreselectedRepo}
        autoLaunchAgent={modalAutoLaunchAgent}
      />



      {/* Slide-out Sidebar Settings panel Drawer */}
      <SettingsPanel 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSave={showToast}
      />

      {/* --- Premium Toast Notification --- */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#0c0c14',
          border: '1px solid rgba(95, 90, 246, 0.3)',
          borderRadius: '8px',
          padding: '12px 18px',
          color: '#fff',
          fontSize: '13px',
          fontWeight: '500',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(95, 90, 246, 0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          zIndex: 9999,
          animation: 'slide-up-bounce 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.255)'
        }}>
          <div style={{
            backgroundColor: 'rgba(95, 90, 246, 0.15)',
            borderRadius: '50%',
            padding: '4px',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Sparkles size={14} />
          </div>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Embedded Keyframe Animations */}
      <style>{`
        @keyframes slide-up-bounce {
          from { transform: translateY(40px) scale(0.9); opacity: 0; }
          to { transform: translateY(0) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
