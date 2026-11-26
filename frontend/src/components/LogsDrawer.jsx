import React, { useEffect, useRef, useState } from 'react';
import { X, Terminal, Trash2, ArrowDown, Search, Check, RefreshCw } from 'lucide-react';

export default function LogsDrawer({ isOpen, onClose, workspace, logs }) {
  const terminalEndRef = useRef(null);
  const [filterText, setFilterText] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Scroll to bottom when logs change or drawer opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [isOpen, logs]);

  // Copy logs to clipboard
  const handleCopyLogs = () => {
    if (!logs) return;
    const logText = logs.map(l => l.text).join('\n');
    navigator.clipboard.writeText(logText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  if (!isOpen || !workspace) return null;

  // Filter logs by text search
  const filteredLogs = logs.filter(log => 
    log.text.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '100%',
      maxWidth: '640px',
      height: '100vh',
      backgroundColor: '#0c0c10',
      borderLeft: '1px solid var(--border-color)',
      boxShadow: '-10px 0 30px rgba(0,0,0,0.5)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      animation: 'slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
    }}>
      {/* Drawer Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#0f0f15'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-color)',
            padding: '6px',
            borderRadius: '6px',
            color: 'var(--primary)'
          }}>
            <Terminal size={16} />
          </div>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: '700', margin: 0, letterSpacing: '0.2px' }}>
              Sandbox Console Logs
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {workspace.name}
            </span>
          </div>
        </div>

        <button 
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
        >
          <X size={18} />
        </button>
      </div>

      {/* Terminal Tools / Action Bar */}
      <div style={{
        padding: '12px 24px',
        backgroundColor: '#0a0a0d',
        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap'
      }}>
        {/* Search filter */}
        <div style={{
          position: 'relative',
          flex: 1,
          minWidth: '200px'
        }}>
          <Search size={12} color="var(--text-muted)" style={{
            position: 'absolute',
            left: '10px',
            top: '50%',
            transform: 'translateY(-50%)'
          }} />
          <input 
            type="text" 
            placeholder="Search logs..." 
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 12px 6px 28px',
              color: 'var(--text-primary)',
              fontSize: '12px',
              outline: 'none'
            }}
          />
        </div>

        {/* Copy, Scroll to Bottom */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={handleCopyLogs}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: '500',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'var(--transition-smooth)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)'}
          >
            {isCopied ? (
              <>
                <Check size={12} color="#10b981" />
                <span style={{ color: '#10b981' }}>Copied!</span>
              </>
            ) : (
              <>
                <RefreshCw size={11} />
                <span>Copy Logs</span>
              </>
            )}
          </button>
          
          <button 
            onClick={() => terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              padding: '6px',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'var(--transition-smooth)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)'}
          >
            <ArrowDown size={12} />
          </button>
        </div>
      </div>

      {/* Terminal Screen */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '24px',
        fontFamily: 'var(--font-mono)',
        fontSize: '12px',
        lineHeight: '1.6',
        backgroundColor: '#060608',
        color: '#e4e4e7',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px'
      }}>
        {filteredLogs.length > 0 ? (
          filteredLogs.map((log, index) => {
            let textColor = '#d4d4d8';
            if (log.text.includes('SUCCESS') || log.text.includes('ready')) {
              textColor = '#34d399'; // emerald-400
            } else if (log.text.includes('WARN')) {
              textColor = '#fbbf24'; // amber-400
            } else if (log.text.includes('ERROR')) {
              textColor = '#f87171'; // red-400
            } else if (log.text.includes('git-init') || log.text.includes('git check')) {
              textColor = '#a5b4fc'; // indigo-300
            } else if (log.text.includes('kubelet')) {
              textColor = '#a1a1aa'; // zinc-400
            }

            return (
              <div 
                key={index} 
                style={{ 
                  color: textColor,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  animation: 'fade-in 0.15s ease-out'
                }}
              >
                {log.text}
              </div>
            );
          })
        ) : (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', marginTop: '40px' }}>
            No logs matched "{filterText}"
          </div>
        )}
        
        {/* Shimmer element if provisioning or transitioning */}
        {['Provisioning', 'Starting', 'Stopping'].includes(workspace.status) && (
          <div 
            className="shimmer" 
            style={{ 
              height: '16px', 
              width: '180px', 
              borderRadius: '4px',
              marginTop: '8px'
            }} 
          />
        )}

        <div ref={terminalEndRef} />
      </div>

      {/* Backdrop for closing logs drawer */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 'calc(100vw - 640px)',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(2px)',
          zIndex: 99,
          cursor: 'pointer'
        }}
      />

      <style>{`
        @keyframes slide-in {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
