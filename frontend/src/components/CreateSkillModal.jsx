import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  UploadCloud, 
  FileCode, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  Sparkles, 
  Building2, 
  User,
  Info
} from 'lucide-react';
import { createSkill, updateSkill } from '../services/skillsApi';

const CATEGORIES = [
  'General',
  'DevOps',
  'Infrastructure',
  'Security',
  'Testing',
  'Cloud',
  'Database',
  'Code Quality'
];

export default function CreateSkillModal({
  isOpen,
  onClose,
  onSkillSaved,
  editingSkill = null,
  currentUser,
  userContext
}) {
  const dialogRef = useRef(null);
  const fileInputRef = useRef(null);

  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('personal');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [category, setCategory] = useState('General');
  const [tagsInput, setTagsInput] = useState('');
  
  // File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileError, setFileError] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorBanner, setErrorBanner] = useState('');

  // Extract organizations where caller is admin/owner
  const adminOrgs = React.useMemo(() => {
    if (!userContext?.organizations) return [];
    return userContext.organizations.filter(o => 
      !o.is_personal && (o.user_role === 'org_owner' || o.user_role === 'org_admin')
    );
  }, [userContext]);

  const canCreateOrgSkills = adminOrgs.length > 0;

  // Initialize or reset form
  useEffect(() => {
    if (isOpen) {
      setErrorBanner('');
      setFileError('');
      if (editingSkill) {
        setName(editingSkill.name || '');
        setDescription(editingSkill.description || '');
        setScope(editingSkill.scope || 'personal');
        setSelectedOrgId(editingSkill.organization_id || (adminOrgs[0]?.id || ''));
        setCategory(editingSkill.category || 'General');
        setTagsInput(Array.isArray(editingSkill.tags) ? editingSkill.tags.join(', ') : '');
        setFileContent(editingSkill.skill_content || '');
        setSelectedFile(null);
      } else {
        setName('');
        setDescription('');
        setScope('personal');
        setSelectedOrgId(adminOrgs[0]?.id || '');
        setCategory('General');
        setTagsInput('');
        setSelectedFile(null);
        setFileContent('');
      }
    }
  }, [isOpen, editingSkill, adminOrgs]);

  if (!isOpen) return null;

  const handleFileChange = (file) => {
    setFileError('');
    setErrorBanner('');
    if (!file) return;

    // 1. Validate file extension (.md case-insensitive)
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith('.md')) {
      setFileError('Invalid file type. Instructions must be a Markdown file (.md).');
      setSelectedFile(null);
      setFileContent('');
      return;
    }

    // 2. Validate size (512 KB max)
    if (file.size > 512 * 1024) {
      setFileError(`File is too large (${(file.size / 1024).toFixed(1)} KB). Maximum allowed size is 512 KB.`);
      setSelectedFile(null);
      setFileContent('');
      return;
    }

    if (file.size === 0) {
      setFileError('Uploaded file is empty.');
      setSelectedFile(null);
      setFileContent('');
      return;
    }

    // 3. Read content and validate UTF-8
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      if (!text || text.trim().length < 5) {
        setFileError('File contains insufficient or empty instruction content.');
        setSelectedFile(null);
        setFileContent('');
        return;
      }
      setSelectedFile(file);
      setFileContent(text);
    };
    reader.onerror = () => {
      setFileError('Failed to read file encoding. Please ensure it is valid UTF-8 text.');
      setSelectedFile(null);
      setFileContent('');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorBanner('');

    if (!name.trim()) {
      setErrorBanner('Skill Name is required.');
      return;
    }
    if (!description.trim()) {
      setErrorBanner('Skill Description is required.');
      return;
    }

    if (!editingSkill && !selectedFile && !fileContent.trim()) {
      setErrorBanner('Please upload a SKILL.md Markdown file for the coding agent.');
      return;
    }

    if (scope === 'organization' && !selectedOrgId) {
      setErrorBanner('Please select a target organization for organization scope.');
      return;
    }

    const parsedTags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    try {
      const userId = currentUser?.id || 'default-user';

      if (editingSkill) {
        // Update existing skill
        const updatePayload = {
          name: name.trim(),
          description: description.trim(),
          category,
          tags: parsedTags,
        };
        if (fileContent && selectedFile) {
          updatePayload.content = fileContent;
        }

        const updated = await updateSkill(editingSkill.id, updatePayload, userId);
        if (onSkillSaved) onSkillSaved(updated);
        onClose();
      } else {
        // Create new skill using FormData or JSON
        let payload;
        if (selectedFile) {
          const fd = new FormData();
          fd.append('file', selectedFile);
          fd.append('name', name.trim());
          fd.append('description', description.trim());
          fd.append('scope', scope);
          if (scope === 'organization') {
            fd.append('organization_id', selectedOrgId);
          }
          fd.append('category', category);
          fd.append('tags', JSON.stringify(parsedTags));
          payload = fd;
        } else {
          payload = {
            name: name.trim(),
            description: description.trim(),
            scope,
            organization_id: scope === 'organization' ? selectedOrgId : undefined,
            content: fileContent,
            category,
            tags: parsedTags,
          };
        }

        const created = await createSkill(payload, userId);
        if (onSkillSaved) onSkillSaved(created);
        onClose();
      }
    } catch (err) {
      setErrorBanner(err.message || 'Failed to save skill. Please verify your inputs.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
      <div 
        ref={dialogRef}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.16)',
          border: '1px solid #e2e8f0',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '18px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '17px', fontWeight: '600', color: '#0f172a' }}>
              {editingSkill ? 'Edit Skill' : 'Create New Skill'}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#64748b' }}>
              Define reusable capabilities and instructions for your coding agents.
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

        {/* Form Body (Scrollable) */}
        <form onSubmit={handleSubmit} style={{ overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {errorBanner && (
            <div style={{
              padding: '10px 14px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              color: '#b91c1c',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertCircle size={16} />
              <span>{errorBanner}</span>
            </div>
          )}

          {/* Skill Name */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
              Skill Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. AWS Deployment, Kubernetes Debugger, Code Reviewer"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                color: '#0f172a',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
              Description <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              rows={2}
              placeholder="A concise summary of what this skill enables the coding agent to do..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13.5px',
                color: '#0f172a',
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Scope Selection: Personal vs Organization */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
              Ownership Scope
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Personal Option */}
              <div
                onClick={() => setScope('personal')}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: scope === 'personal' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                  backgroundColor: scope === 'personal' ? '#faf5ff' : '#ffffff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: scope === 'personal' ? '#ede9fe' : '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: scope === 'personal' ? '#7c3aed' : '#64748b'
                }}>
                  <User size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>Personal</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>Only accessible to you</div>
                </div>
              </div>

              {/* Organization Option */}
              <div
                onClick={() => {
                  if (canCreateOrgSkills) setScope('organization');
                }}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: scope === 'organization' ? '2px solid #7c3aed' : '1px solid #e2e8f0',
                  backgroundColor: scope === 'organization' ? '#faf5ff' : '#ffffff',
                  cursor: canCreateOrgSkills ? 'pointer' : 'not-allowed',
                  opacity: canCreateOrgSkills ? 1 : 0.6,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.15s ease'
                }}
                title={!canCreateOrgSkills ? 'Requires Organization Admin or Owner role' : ''}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  backgroundColor: scope === 'organization' ? '#ede9fe' : '#f1f5f9',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: scope === 'organization' ? '#7c3aed' : '#64748b'
                }}>
                  <Building2 size={16} />
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>Organization</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                    {canCreateOrgSkills ? 'Shared with your org' : 'Admin role required'}
                  </div>
                </div>
              </div>
            </div>

            {/* If Organization scope selected, pick target org */}
            {scope === 'organization' && adminOrgs.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: '#475569', marginBottom: '4px' }}>
                  Target Organization
                </label>
                <select
                  value={selectedOrgId}
                  onChange={e => setSelectedOrgId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    color: '#0f172a',
                    backgroundColor: '#ffffff'
                  }}
                >
                  {adminOrgs.map(org => (
                    <option key={org.id} value={org.id}>
                      {org.name} ({org.user_role})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Category & Tags Row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                Category
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  color: '#0f172a',
                  backgroundColor: '#ffffff'
                }}
              >
                {CATEGORIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                Tags (comma separated)
              </label>
              <input
                type="text"
                placeholder="e.g. k8s, docker, ci"
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  color: '#0f172a',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          {/* SKILL.md Upload Area */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <label style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>
                SKILL.md Instruction File {!editingSkill && <span style={{ color: '#ef4444' }}>*</span>}
              </label>
              {fileContent && (
                <span style={{ fontSize: '11.5px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> Validated Markdown
                </span>
              )}
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept=".md"
              onChange={e => handleFileChange(e.target.files?.[0])}
              style={{ display: 'none' }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              style={{
                border: isDragOver ? '2px dashed #7c3aed' : '2px dashed #cbd5e1',
                borderRadius: '10px',
                padding: '18px',
                textAlign: 'center',
                backgroundColor: isDragOver ? '#faf5ff' : '#f8fafc',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: '#ede9fe',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 8px'
              }}>
                <UploadCloud size={20} />
              </div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
                {selectedFile ? selectedFile.name : (editingSkill ? 'Click or drag to replace SKILL.md' : 'Click or drag SKILL.md here')}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Accepts a single Markdown file (.md) up to 512 KB
              </div>
            </div>

            {fileError && (
              <div style={{ color: '#dc2626', fontSize: '12px', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <AlertCircle size={13} /> {fileError}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            marginTop: '8px',
            paddingTop: '14px',
            borderTop: '1px solid #f1f5f9'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                color: '#475569',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                backgroundColor: '#0f172a',
                border: 'none',
                color: '#ffffff',
                padding: '8px 20px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                opacity: isSubmitting ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {isSubmitting ? 'Saving...' : (editingSkill ? 'Save Changes' : 'Create Skill')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
