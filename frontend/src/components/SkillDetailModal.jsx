import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Edit2, 
  Trash2, 
  Building2, 
  User, 
  FileText, 
  Layers, 
  Cpu, 
  Calendar, 
  Hash,
  Sparkles
} from 'lucide-react';

export default function SkillDetailModal({
  isOpen,
  onClose,
  skill,
  onEdit,
  onDelete
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !skill) return null;

  const handleCopy = () => {
    if (skill.skill_content) {
      navigator.clipboard.writeText(skill.skill_content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isOrg = skill.scope === 'organization';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.16)',
        border: '1px solid #e2e8f0',
        overflow: 'hidden'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: '#0f172a' }}>
                {skill.name}
              </h2>
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '12px',
                backgroundColor: isOrg ? '#faf5ff' : '#f1f5f9',
                color: isOrg ? '#7c3aed' : '#475569',
                border: isOrg ? '1px solid #e9d5ff' : '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}>
                {isOrg ? <Building2 size={11} /> : <User size={11} />}
                {isOrg ? (skill.organization_name || 'Organization') : 'Personal'}
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: '600',
                padding: '2px 6px',
                borderRadius: '6px',
                backgroundColor: '#f8fafc',
                color: '#64748b',
                border: '1px solid #e2e8f0'
              }}>
                v{skill.version || 1}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.4' }}>
              {skill.description}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Metadata Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px',
            backgroundColor: '#f8fafc',
            padding: '12px 14px',
            borderRadius: '10px',
            border: '1px solid #f1f5f9'
          }}>
            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Category</div>
              <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: '600', marginTop: '2px' }}>
                {skill.category || 'General'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Created By</div>
              <div style={{ fontSize: '12.5px', color: '#0f172a', fontWeight: '600', marginTop: '2px' }}>
                {skill.created_by || 'Unknown'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Content Hash</div>
              <div style={{ fontSize: '12px', color: '#475569', fontFamily: 'monospace', marginTop: '2px' }}>
                {skill.content_hash ? `${skill.content_hash.slice(0, 8)}...` : 'N/A'}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>Compatible Agents</div>
              <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                {(skill.compatible_agents || ['Claude Code']).map(a => (
                  <span key={a} style={{
                    fontSize: '11px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '4px',
                    padding: '1px 5px',
                    color: '#334155'
                  }}>
                    {a === 'claudeCode' ? 'Claude Code' : a}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Tags */}
          {Array.isArray(skill.tags) && skill.tags.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>
                Tags
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {skill.tags.map(t => (
                  <span key={t} style={{
                    fontSize: '11.5px',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    borderRadius: '6px',
                    padding: '2px 8px'
                  }}>
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* SKILL.md Content View */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: '600', color: '#334155', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FileText size={14} color="#7c3aed" />
                <span>SKILL.md Instructions</span>
              </div>
              <button
                onClick={handleCopy}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11.5px',
                  color: '#475569',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {copied ? <Check size={12} color="#16a34a" /> : <Copy size={12} />}
                <span>{copied ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <pre style={{
              margin: 0,
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              padding: '14px 16px',
              borderRadius: '8px',
              fontSize: '12px',
              lineHeight: '1.5',
              fontFamily: 'monospace',
              maxHeight: '260px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              border: '1px solid #1e293b'
            }}>
              {skill.skill_content || '(No instruction content available)'}
            </pre>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '14px 24px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            {skill.can_delete && (
              <button
                onClick={() => onDelete(skill)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'none',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  padding: '7px 12px',
                  fontSize: '12.5px',
                  color: '#dc2626',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <Trash2 size={13} />
                <span>Delete Skill</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {skill.can_edit && (
              <button
                onClick={() => onEdit(skill)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '12.5px',
                  fontWeight: '500',
                  color: '#0f172a',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#ffffff'}
              >
                <Edit2 size={13} />
                <span>Edit</span>
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                backgroundColor: '#0f172a',
                border: 'none',
                color: '#ffffff',
                borderRadius: '8px',
                padding: '7px 16px',
                fontSize: '12.5px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
