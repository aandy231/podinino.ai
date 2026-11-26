import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  Plus, 
  Search, 
  Building2, 
  User, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Edit2, 
  FileText, 
  Filter,
  Cpu
} from 'lucide-react';
import { fetchSkills, deleteSkill, getSkillDetails } from '../services/skillsApi';
import CreateSkillModal from './CreateSkillModal';
import SkillDetailModal from './SkillDetailModal';

const CATEGORIES = ['All', 'DevOps', 'Infrastructure', 'Security', 'Testing', 'Cloud', 'Database', 'Code Quality', 'General'];

export default function SkillsView({
  currentUser,
  userContext,
  onOpenNewSandboxWithSkill
}) {
  // Navigation tab state: 'all' | 'personal' | 'organization'
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');

  // Data State
  const [skills, setSkills] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState(null);
  const [selectedSkillDetail, setSelectedSkillDetail] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Check if current user has an organization
  const hasOrgMembership = useMemo(() => {
    return Array.isArray(userContext?.organizations) && 
      userContext.organizations.some(o => !o.is_personal);
  }, [userContext]);

  const loadSkills = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchSkills({
        scope: activeTab === 'all' ? undefined : activeTab,
        search: searchQuery || undefined,
        category: selectedCategory === 'All' ? undefined : selectedCategory,
        userId: currentUser?.id || 'default-user'
      });
      setSkills(data || []);
    } catch (err) {
      setError(err.message || 'Failed to load skills library.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, [activeTab, selectedCategory, currentUser]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      loadSkills();
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const sortedSkills = skills;

  // Tab counts
  const tabCounts = useMemo(() => {
    let personal = 0;
    let organization = 0;
    skills.forEach(s => {
      if (s.scope === 'personal') personal++;
      if (s.scope === 'organization') organization++;
    });
    return { all: skills.length, personal, organization };
  }, [skills]);

  // Open Detail Modal
  const handleOpenDetail = async (skill) => {
    try {
      const fullDetail = await getSkillDetails(skill.id, currentUser?.id || 'default-user');
      setSelectedSkillDetail(fullDetail);
      setIsDetailModalOpen(true);
    } catch (err) {
      setSelectedSkillDetail(skill);
      setIsDetailModalOpen(true);
    }
  };

  // Delete Skill
  const handleDeleteSkill = async (skill) => {
    if (!window.confirm(`Are you sure you want to delete the skill "${skill.name}"? Existing sandboxes with this skill will preserve their snapshot.`)) {
      return;
    }
    try {
      await deleteSkill(skill.id, currentUser?.id || 'default-user');
      if (isDetailModalOpen) setIsDetailModalOpen(false);
      setSkills(prev => prev.filter(s => s.id !== skill.id));
    } catch (err) {
      alert(`Could not delete skill: ${err.message}`);
    }
  };

  return (
    <div style={{
      maxWidth: '1240px',
      margin: '0 auto',
      padding: '24px 32px',
      minHeight: 'calc(100vh - 70px)'
    }}>
      {/* Header Banner */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        paddingBottom: '20px',
        borderBottom: '1px solid #f1f5f9'
      }}>
        <div>
          <h1 style={{
            margin: 0,
            fontSize: '22px',
            fontWeight: '700',
            color: '#0f172a',
            letterSpacing: '-0.3px'
          }}>
            Skills Library
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13.5px', color: '#64748b' }}>
            Give your coding agents reusable capabilities.
          </p>
        </div>

        <button
          onClick={() => {
            setEditingSkill(null);
            setIsCreateModalOpen(true);
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#0f172a',
            color: '#ffffff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.08)',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#1e293b'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = '#0f172a'}
        >
          <Plus size={16} />
          <span>Create Skill</span>
        </button>
      </div>

      {/* Library Navigation Tabs: All Available | My Skills | Organization */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        marginBottom: '20px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: '#f1f5f9',
          padding: '3px',
          borderRadius: '8px'
        }}>
          <button
            onClick={() => setActiveTab('all')}
            style={{
              padding: '6px 14px',
              fontSize: '12.5px',
              fontWeight: activeTab === 'all' ? '600' : '500',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeTab === 'all' ? '#ffffff' : 'transparent',
              color: activeTab === 'all' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'all' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>All Skills</span>
            <span style={{
              fontSize: '11px',
              padding: '1px 6px',
              borderRadius: '10px',
              backgroundColor: activeTab === 'all' ? '#f1f5f9' : '#e2e8f0',
              color: '#475569'
            }}>
              {tabCounts.all}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('personal')}
            style={{
              padding: '6px 14px',
              fontSize: '12.5px',
              fontWeight: activeTab === 'personal' ? '600' : '500',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: activeTab === 'personal' ? '#ffffff' : 'transparent',
              color: activeTab === 'personal' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'personal' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <User size={13} />
            <span>My Skills</span>
          </button>

          {hasOrgMembership && (
            <button
              onClick={() => setActiveTab('organization')}
              style={{
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: activeTab === 'organization' ? '600' : '500',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: activeTab === 'organization' ? '#ffffff' : 'transparent',
                color: activeTab === 'organization' ? '#7c3aed' : '#64748b',
                boxShadow: activeTab === 'organization' ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Building2 size={13} />
              <span>Organization</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Input & Category Filters */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: '24px'
      }}>
        {/* Search Field */}
        <div style={{ position: 'relative', width: '100%' }}>
          <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '10px' }} />
          <input
            type="text"
            placeholder="Search skills by name, description, or tags..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 34px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              fontSize: '13px',
              color: '#0f172a',
              outline: 'none',
              backgroundColor: '#ffffff',
              boxSizing: 'border-box'
            }}
          />
        </div>

        {/* Category Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              style={{
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: selectedCategory === cat ? '600' : '400',
                border: selectedCategory === cat ? '1px solid #7c3aed' : '1px solid #e2e8f0',
                backgroundColor: selectedCategory === cat ? '#faf5ff' : '#ffffff',
                color: selectedCategory === cat ? '#7c3aed' : '#64748b',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.1s ease'
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={{
          padding: '12px 16px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#b91c1c',
          fontSize: '13px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
          <button
            onClick={loadSkills}
            style={{
              background: 'none',
              border: 'none',
              color: '#b91c1c',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontSize: '12.5px'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={{
              height: '160px',
              borderRadius: '12px',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              animation: 'pulse 1.5s infinite ease-in-out'
            }} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && sortedSkills.length === 0 && (
        <div style={{
          padding: '60px 20px',
          textAlign: 'center',
          backgroundColor: '#f8fafc',
          borderRadius: '12px',
          border: '1px dashed #cbd5e1'
        }}>
          <div style={{
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            backgroundColor: '#ede9fe',
            color: '#7c3aed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 12px'
          }}>
            <Sparkles size={22} />
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: '600', color: '#0f172a' }}>
            No skills found
          </h3>
          <p style={{ margin: '0 auto 16px', maxWidth: '380px', fontSize: '13px', color: '#64748b' }}>
            {searchQuery || selectedCategory !== 'All' 
              ? 'No skills match your current search or category filter.'
              : 'Enhance your AI sandboxes by adding custom instructions for deployments, debugging, and testing.'}
          </p>
          <button
            onClick={() => {
              setEditingSkill(null);
              setIsCreateModalOpen(true);
            }}
            style={{
              backgroundColor: '#0f172a',
              color: '#ffffff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '8px',
              fontSize: '12.5px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            + Create First Skill
          </button>
        </div>
      )}

      {/* Skills Grid */}
      {!isLoading && sortedSkills.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {sortedSkills.map(skill => {
            const isOrg = skill.scope === 'organization';
            return (
              <div
                key={skill.id}
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#cbd5e1';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(15, 23, 42, 0.08)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.04)';
                }}
              >
                <div>
                  {/* Card Header: Scope Badge + Category */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
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
                      fontWeight: '500',
                      color: '#64748b',
                      backgroundColor: '#f8fafc',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid #f1f5f9'
                    }}>
                      {skill.category || 'General'}
                    </span>
                  </div>

                  {/* Title & Version */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <h3 style={{
                      margin: 0,
                      fontSize: '15px',
                      fontWeight: '600',
                      color: '#0f172a',
                      lineHeight: '1.3'
                    }}>
                      {skill.name}
                    </h3>
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>
                      v{skill.version || 1}
                    </span>
                  </div>

                  {/* Description */}
                  <p style={{
                    margin: '6px 0 12px',
                    fontSize: '12.5px',
                    color: '#64748b',
                    lineHeight: '1.4',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {skill.description}
                  </p>

                  {/* Compatible Agents Chips */}
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '14px' }}>
                    {(skill.compatible_agents || ['Claude Code']).map(agent => (
                      <span key={agent} style={{
                        fontSize: '10.5px',
                        color: '#475569',
                        backgroundColor: '#f1f5f9',
                        borderRadius: '4px',
                        padding: '1px 5px'
                      }}>
                        {agent === 'claudeCode' ? 'Claude Code' : agent}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Footer Buttons */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid #f8fafc',
                  paddingTop: '10px'
                }}>
                  <button
                    onClick={() => handleOpenDetail(skill)}
                    style={{
                      backgroundColor: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.1s ease'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  >
                    View Details
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {skill.can_edit && (
                      <button
                        onClick={() => {
                          setEditingSkill(skill);
                          setIsCreateModalOpen(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px'
                        }}
                        title="Edit Skill"
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Edit2 size={14} />
                      </button>
                    )}

                    {skill.can_delete && (
                      <button
                        onClick={() => handleDeleteSkill(skill)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '4px'
                        }}
                        title="Delete Skill"
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <CreateSkillModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingSkill(null);
        }}
        onSkillSaved={(savedSkill) => {
          loadSkills();
        }}
        editingSkill={editingSkill}
        currentUser={currentUser}
        userContext={userContext}
      />

      {/* Skill Detail Modal */}
      <SkillDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedSkillDetail(null);
        }}
        skill={selectedSkillDetail}
        onEdit={(skill) => {
          setIsDetailModalOpen(false);
          setEditingSkill(skill);
          setIsCreateModalOpen(true);
        }}
        onDelete={(skill) => {
          handleDeleteSkill(skill);
        }}
      />
    </div>
  );
}
