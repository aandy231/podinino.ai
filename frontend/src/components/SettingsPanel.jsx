import React, { useState, useEffect } from 'react';
import { X, Database, Save } from 'lucide-react';

export default function SettingsPanel({ isOpen, onClose, onSave }) {
  // Settings form states
  const [namespace, setNamespace] = useState('dev-spaces');
  const [persistentVolume, setPersistentVolume] = useState('20GiB');
  const [autoSuspend, setAutoSuspend] = useState('2 hours');

  useEffect(() => {
    // Esc key close drawer
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFormSubmit = (e) => {
    e.preventDefault();
    onSave('Settings saved successfully!');
    onClose();
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      right: 0,
      width: '100%',
      maxWidth: '560px',
      height: '100vh',
      backgroundColor: '#0c0c11',
      borderLeft: '1px solid var(--border-color)',
      boxShadow: '-10px 0 40px rgba(0,0,0,0.6)',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      animation: 'slide-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)'
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
            <Database size={16} />
          </div>
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: '700', margin: 0, letterSpacing: '0.2px' }}>
              Sandbox Settings
            </h2>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Configure your container environments & cluster integrations
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

      {/* Settings Main Form */}
      <form onSubmit={handleFormSubmit} style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        
        {/* Scrollable form body */}
        <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fade-in 0.15s ease-out' }}>
            
            {/* Namespace configuration */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Default Namespace
              </label>
              <select 
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                style={{
                  backgroundColor: '#060609',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="dev-spaces">dev-spaces (Active Namespace)</option>
                <option value="default">default</option>
                <option value="staging">staging-sandboxes</option>
              </select>
            </div>

            {/* Default persistent storage allocation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Persistent Storage Capacity (PVC)
              </label>
              <select 
                value={persistentVolume}
                onChange={(e) => setPersistentVolume(e.target.value)}
                style={{
                  backgroundColor: '#060609',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="10GiB">10 GiB</option>
                <option value="20GiB">20 GiB (Recommended)</option>
                <option value="50GiB">50 GiB</option>
              </select>
            </div>

            {/* Default auto suspend time limit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                Auto-Suspend Inactive Timeout
              </label>
              <select 
                value={autoSuspend}
                onChange={(e) => setAutoSuspend(e.target.value)}
                style={{
                  backgroundColor: '#060609',
                  border: '1px solid var(--border-color)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none',
                  cursor: 'pointer'
                }}
              >
                <option value="30 mins">30 minutes</option>
                <option value="1 hour">1 hour</option>
                <option value="2 hours">2 hours</option>
                <option value="Never">Never (Disable auto-suspend)</option>
              </select>
            </div>
          </div>

        </div>

        {/* Drawer Save Footer */}
        <div style={{
          padding: '20px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          backgroundColor: '#0f0f15'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '8px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'var(--transition-smooth)'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Cancel
          </button>
          
          <button
            type="submit"
            style={{
              background: 'linear-gradient(135deg, var(--primary) 0%, #10b981 100%)',
              border: 'none',
              color: '#fff',
              borderRadius: '8px',
              padding: '8px 18px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(95, 90, 246, 0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'var(--transition-smooth)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 15px rgba(95, 90, 246, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(95, 90, 246, 0.25)';
            }}
          >
            <Save size={13} />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>

      {/* Backdrop for closing SettingsPanel */}
      <div 
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: 'calc(100vw - 560px)',
          height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.3)',
          backdropFilter: 'blur(1px)',
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
