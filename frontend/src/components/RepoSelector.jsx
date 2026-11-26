import React, { useState, useEffect, useRef } from 'react';
import { Search, Folder, Check } from 'lucide-react';
import { MOCK_REPOSITORIES_LIST } from '../mockData';

export default function RepoSelector({
  isOpen,
  onClose,
  selectedRepo,
  onSelectRepo,
  repositories = []
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All'); // All, Public, Private, Organizations
  const menuRef = useRef(null);

  // Combine provided repos with mock repos list
  const allRepos = repositories.length > 0 ? repositories : MOCK_REPOSITORIES_LIST;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Filter repos by category and search query
  const filteredRepos = allRepos.filter(repo => {
    const matchesSearch = (repo.name || repo.id).toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeCategory === 'All') return true;
    const cat = repo.category || repo.type || '';
    return cat.toLowerCase().includes(activeCategory.toLowerCase());
  });

  const categories = ['All', 'Public', 'Private', 'Organizations'];

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 12px)',
        left: 0,
        width: '320px',
        backgroundColor: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        boxShadow: '0 12px 36px rgba(15, 23, 42, 0.12)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'popover-in 0.18s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search Input Bar */}
      <div style={{
        padding: '10px 12px 6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        borderBottom: '1px solid #f1f5f9'
      }}>
        <Search size={14} color="#94a3b8" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search repositories..."
          autoFocus
          style={{
            width: '100%',
            border: 'none',
            outline: 'none',
            fontSize: '13px',
            color: '#0f172a',
            backgroundColor: 'transparent',
            padding: '4px 0'
          }}
        />
      </div>

      {/* Filter Category Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '8px 12px',
        borderBottom: '1px solid #f1f5f9',
        overflowX: 'auto'
      }}>
        {categories.map(cat => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              style={{
                background: isActive ? '#ede9fe' : 'transparent',
                color: isActive ? '#7c3aed' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                padding: '3px 8px',
                fontSize: '12px',
                fontWeight: isActive ? '600' : '400',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = '#f1f5f9';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {/* Repositories List */}
      <div style={{
        maxHeight: '220px',
        overflowY: 'auto',
        padding: '6px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px'
      }}>
        {filteredRepos.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
            No repositories found
          </div>
        ) : (
          filteredRepos.map(repo => {
            const repoName = repo.name || repo.id;
            const isSelected = selectedRepo === repoName;

            return (
              <button
                key={repo.id || repoName}
                type="button"
                onClick={() => {
                  onSelectRepo(repoName);
                  onClose();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '7px 10px',
                  borderRadius: '7px',
                  border: 'none',
                  backgroundColor: isSelected ? '#f1f5f9' : 'transparent',
                  color: isSelected ? '#0f172a' : '#334155',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: isSelected ? '500' : '400',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <Folder size={14} color={isSelected ? '#7c3aed' : '#94a3b8'} style={{ flexShrink: 0 }} />
                  <span style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}>
                    {repoName}
                  </span>
                </div>
                {isSelected && <Check size={14} color="#7c3aed" />}
              </button>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes popover-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
