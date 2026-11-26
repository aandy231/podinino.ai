import React from 'react';
import { GitBranch, ExternalLink, Share2, Trash2, Clock, Activity, User, Layers, Terminal } from 'lucide-react';
import { getHarness } from './ModelSelector';

export default function WorkspaceRow({ 
  workspace, 
  onDelete, 
  onShare 
}) {
  const {
    id,
    name,
    branch,
    owner,
    createdTime,
    lastActiveTime,
    ticket,
    status,
    url,
    aiAgentActive
  } = workspace;

  const isReady = status === 'Ready';
  const isStopped = status === 'Stopped';
  const isTransitioning = ['Provisioning', 'Starting', 'Stopping', 'Terminating'].includes(status);
  
  // Format dates relatively for high fidelity
  const getRelativeTime = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHrs / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div 
      className="glass-panel" 
      style={{
        padding: '16px 24px',
        borderRadius: '10px',
        backgroundColor: isStopped ? 'rgba(16, 16, 24, 0.25)' : 'var(--bg-card)',
        borderColor: isTransitioning ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-color)',
        opacity: isStopped ? 0.65 : 1,
        transition: 'var(--transition-smooth)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px',
        width: '100%',
        position: 'relative'
      }}
      onMouseEnter={(e) => {
        if (!isStopped && !isTransitioning) {
          e.currentTarget.style.borderColor = 'var(--border-hover)';
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 6px 20px rgba(95, 90, 246, 0.08)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = isTransitioning ? 'rgba(245, 158, 11, 0.35)' : 'var(--border-color)';
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* 1. Branch Name & Workspace ID */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: '1 1 200px', minWidth: '180px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitBranch size={15} color="var(--text-secondary)" style={{ transform: 'rotate(15deg)', flexShrink: 0 }} />
          <span style={{ 
            fontSize: '14px', 
            fontWeight: '600', 
            color: isStopped ? 'var(--text-secondary)' : 'var(--text-primary)',
            letterSpacing: '0.1px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}>
            {branch}
          </span>
          {workspace.harness && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '10px',
              fontWeight: '600',
              color: getHarness(workspace.harness).badgeColor,
              backgroundColor: `${getHarness(workspace.harness).badgeColor}12`,
              padding: '1px 5px',
              borderRadius: '4px',
              border: `1px solid ${getHarness(workspace.harness).badgeColor}30`,
              letterSpacing: '0.2px'
            }}>
              <span>✦</span>
              <span>{getHarness(workspace.harness).shortName}</span>
            </span>
          )}
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {name}
        </span>
      </div>

      {/* 2. Developer Details & Rel Time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 180px', minWidth: '160px' }}>
        <img 
          src={owner.avatar} 
          alt={owner.name} 
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            objectFit: 'cover',
            border: '1px solid var(--border-color)',
            flexShrink: 0
          }} 
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '500' }}>
            {owner.name}
          </span>
          <span style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <Clock size={10} /> {getRelativeTime(createdTime)}
          </span>
        </div>
      </div>

      {/* 3. Linked Ticket Badge */}
      <div style={{ flex: '1 1 180px', minWidth: '160px', display: 'flex', alignItems: 'center' }}>
        {ticket ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: 'rgba(95, 90, 246, 0.08)',
            border: '1px solid rgba(95, 90, 246, 0.18)',
            padding: '4px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: '500',
            color: '#818cf8',
            maxWidth: '100%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            <Layers size={11} style={{ flexShrink: 0 }} />
            <span>{ticket.id}: {ticket.title}</span>
          </div>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Ad-hoc sandbox</span>
        )}
      </div>

      {/* 4. Status Indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100px', flexShrink: 0 }}>
        <span className={`status-dot ${status.toLowerCase()}`}></span>
        <span style={{ 
          fontSize: '12px', 
          fontWeight: '500', 
          color: isReady ? 'var(--accent-ready)' : isStopped ? 'var(--text-secondary)' : 'var(--accent-provisioning)',
          letterSpacing: '0.2px'
        }}>
          {status}
        </span>
      </div>

      {/* 5. Clean Action Buttons: Open, Share, Delete */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '8px',
        flexShrink: 0
      }}>
        {/* Open workspace */}
        <a 
          href={isReady ? url : undefined}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            backgroundColor: isReady ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.01)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: isReady ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '7px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: isReady ? 'pointer' : 'not-allowed',
            transition: 'var(--transition-smooth)'
          }}
          onClick={(e) => {
            if (!isReady) e.preventDefault();
          }}
          onMouseEnter={(e) => {
            if (isReady) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'var(--text-secondary)';
            }
          }}
          onMouseLeave={(e) => {
            if (isReady) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
            }
          }}
        >
          <ExternalLink size={12} />
          <span>Open</span>
        </a>

        {/* Share */}
        <button 
          onClick={() => onShare(url)}
          disabled={!isReady}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            backgroundColor: isReady ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.01)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            color: isReady ? 'var(--text-primary)' : 'var(--text-muted)',
            padding: '7px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: isReady ? 'pointer' : 'not-allowed',
            transition: 'var(--transition-smooth)'
          }}
          onMouseEnter={(e) => {
            if (isReady) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.borderColor = 'var(--text-secondary)';
            }
          }}
          onMouseLeave={(e) => {
            if (isReady) {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
            }
          }}
        >
          <Share2 size={12} />
          <span>Share</span>
        </button>

        {/* Delete button */}
        <button 
          onClick={onDelete}
          disabled={isTransitioning}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.06)',
            border: '1px solid rgba(239, 68, 68, 0.15)',
            color: 'rgba(239, 68, 68, 0.85)',
            padding: '7px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: isTransitioning ? 'not-allowed' : 'pointer',
            transition: 'var(--transition-smooth)'
          }}
          onMouseEnter={(e) => {
            if (!isTransitioning) {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            }
          }}
          onMouseLeave={(e) => {
            if (!isTransitioning) {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.15)';
            }
          }}
        >
          <Trash2 size={12} />
          <span>Delete</span>
        </button>
      </div>

    </div>
  );
}
