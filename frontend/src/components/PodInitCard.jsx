import React, { useState, useEffect } from 'react';
import { 
  Loader2,
  CheckCircle2, 
  AlertCircle,
  ExternalLink
} from 'lucide-react';

/**
 * Minimalist, Professional Pod Initialization Indicator
 */
export default function PodInitCard({ 
  workspaceId = 'sandbox-env',
  repoName = '',
  phase = 'PodScheduled', // PodScheduled | ContainersStarting | SyncingRepo | Ready | Error
  elapsedSeconds = 0,
  errorMessage = null,
  codeServerUrl = null,
  onOpenIde = null
}) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? '' : prev + '.'));
    }, 400);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Phase computation
  let stepNumber = 1;
  let title = 'Initializing sandbox pod';
  let detail = 'Allocating Kubernetes resources and persistent volume';
  let progressPct = 25;

  if (phase === 'ContainersStarting') {
    stepNumber = 2;
    title = 'Starting runtime services';
    detail = 'Launching Claude Agent and Code-Server';
    progressPct = 60;
  } else if (phase === 'SyncingRepo') {
    stepNumber = 3;
    title = 'Cloning repository';
    detail = repoName ? `Mounting ${repoName} into workspace` : 'Mounting repository files';
    progressPct = 85;
  } else if (phase === 'Ready') {
    stepNumber = 3;
    title = 'Environment ready';
    detail = 'Sandbox pod is live and connected';
    progressPct = 100;
  } else if (phase === 'Error') {
    stepNumber = 0;
    title = 'Initialization failed';
    detail = errorMessage || 'An error occurred while provisioning the sandbox environment';
    progressPct = 100;
  }

  const isReady = phase === 'Ready';
  const isError = phase === 'Error';

  return (
    <div 
      style={{
        margin: '12px 0 16px 0',
        padding: '14px 16px',
        borderRadius: '8px',
        backgroundColor: 'rgba(17, 17, 24, 0.75)',
        border: isError 
          ? '1px solid rgba(239, 68, 68, 0.35)' 
          : isReady
            ? '1px solid rgba(16, 185, 129, 0.35)'
            : '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        transition: 'border-color 0.3s ease',
        fontSize: '13px'
      }}
    >
      {/* Top row: Icon + Title + Timer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isReady ? (
            <CheckCircle2 size={17} color="#10b981" style={{ flexShrink: 0 }} />
          ) : isError ? (
            <AlertCircle size={17} color="#ef4444" style={{ flexShrink: 0 }} />
          ) : (
            <Loader2 
              size={17} 
              color="var(--primary)" 
              style={{
                animation: 'simple-spin 1s linear infinite',
                flexShrink: 0
              }} 
            />
          )}

          <span style={{ 
            fontWeight: '600', 
            color: isError ? '#ef4444' : isReady ? '#10b981' : 'var(--text-primary)',
            letterSpacing: '-0.1px'
          }}>
            {title}{!isReady && !isError ? dots : ''}
          </span>
        </div>

        {/* Right meta: step badge + timer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {!isError && (
            <span style={{
              fontSize: '11px',
              color: 'var(--text-secondary)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              padding: '2px 7px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              {isReady ? 'Ready' : `Step ${stepNumber} of 3`}
            </span>
          )}

          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-muted)'
          }}>
            {formatTimer(elapsedSeconds)}
          </span>
        </div>
      </div>

      {/* Thin minimalist progress bar */}
      <div style={{
        height: '2px',
        width: '100%',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        borderRadius: '1px',
        overflow: 'hidden'
      }}>
        <div style={{
          height: '100%',
          width: `${progressPct}%`,
          backgroundColor: isError ? '#ef4444' : isReady ? '#10b981' : 'var(--primary)',
          transition: 'width 0.4s ease, background-color 0.3s ease'
        }} />
      </div>

      {/* Bottom row: status detail message + optional IDE launch */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        fontSize: '12px',
        color: 'var(--text-secondary)'
      }}>
        <span style={{ 
          color: isError ? 'rgba(239, 68, 68, 0.9)' : 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {detail}
        </span>

        {isReady && codeServerUrl && (
          <a
            href={codeServerUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (onOpenIde) {
                e.preventDefault();
                onOpenIde(codeServerUrl);
              }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              fontWeight: '500',
              color: 'var(--primary)',
              textDecoration: 'none',
              marginLeft: '12px',
              flexShrink: 0
            }}
          >
            Open IDE <ExternalLink size={12} />
          </a>
        )}
      </div>

      <style>{`
        @keyframes simple-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
