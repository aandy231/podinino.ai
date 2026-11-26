import React, { useState } from 'react';
import { ChevronDown, ChevronRight, FolderGit2 } from 'lucide-react';
import WorkspaceRow from './WorkspaceRow';

export default function WorkspaceGroup({ 
  repoName, 
  workspaces, 
  onDelete, 
  onShare 
}) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      marginBottom: '24px'
    }}>
      {/* Collapsible Repository Header */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          color: 'var(--text-primary)',
          textAlign: 'left',
          width: '100%',
          cursor: 'pointer',
          padding: '8px 4px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
          transition: 'var(--transition-smooth)',
          userSelect: 'none'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FolderGit2 size={16} color="var(--text-secondary)" />
          <span style={{ 
            fontSize: '14px', 
            fontWeight: '600', 
            letterSpacing: '0.2px',
            color: 'var(--text-primary)'
          }}>
            {repoName}
          </span>
          <span style={{ 
            fontSize: '11px', 
            color: 'var(--text-muted)',
            fontWeight: '400',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            padding: '2px 8px',
            borderRadius: '12px'
          }}>
            {workspaces.length} {workspaces.length === 1 ? 'sandbox' : 'sandboxes'}
          </span>
        </div>
        <div>
          {isOpen ? (
            <ChevronDown size={15} color="var(--text-secondary)" />
          ) : (
            <ChevronRight size={15} color="var(--text-secondary)" />
          )}
        </div>
      </button>

      {/* Vertical List Stack of Workspace Rows */}
      {isOpen && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          animation: 'fade-in 0.2s ease-out'
        }}>
          {workspaces.map((workspace) => (
            <WorkspaceRow 
              key={workspace.id}
              workspace={workspace}
              onDelete={() => onDelete(workspace.id)}
              onShare={onShare}
            />
          ))}
        </div>
      )}
    </div>
  );
}
