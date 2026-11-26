import React, { useState, useEffect, useRef, useMemo } from 'react';
import { GitBranch, Check, Plus, ChevronDown, ArrowLeft, CornerDownLeft, Search } from 'lucide-react';

export default function BranchSelector({
  currentBranch = 'main',
  onChangeBranch,
  availableBranches = [],
  disabled = false,
  disabledTooltip = null,
  placement = 'bottom',
  title = 'Chat Branch'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('list'); // 'list' | 'create'
  const [searchQuery, setSearchQuery] = useState('');
  
  // Create Branch Form States
  const [newBranchName, setNewBranchName] = useState('');
  const [checkoutFrom, setCheckoutFrom] = useState(currentBranch || 'main');

  const menuRef = useRef(null);
  const searchInputRef = useRef(null);
  const createInputRef = useRef(null);

  // Combine and deduplicate available branches
  const branchList = useMemo(() => {
    const list = [
      currentBranch,
      ...(availableBranches || []).filter(Boolean)
    ].filter(Boolean);
    const unique = Array.from(new Set(list));
    return unique.length > 0 ? unique : ['main'];
  }, [currentBranch, availableBranches]);

  // Sync checkoutFrom default when currentBranch changes
  useEffect(() => {
    if (currentBranch) {
      setCheckoutFrom(currentBranch);
    }
  }, [currentBranch]);

  // Focus management when opening or toggling modes
  useEffect(() => {
    if (isOpen) {
      if (mode === 'list') {
        setSearchQuery('');
        setTimeout(() => searchInputRef.current?.focus(), 50);
      } else if (mode === 'create') {
        setTimeout(() => createInputRef.current?.focus(), 50);
      }
    } else {
      setMode('list');
      setSearchQuery('');
      setNewBranchName('');
    }
  }, [isOpen, mode]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleSelectExisting = (branch) => {
    if (branch && onChangeBranch) {
      onChangeBranch(branch, null);
    }
    setIsOpen(false);
  };

  const handleCreateBranch = (e) => {
    if (e) e.preventDefault();
    const trimmed = newBranchName.trim();
    if (!trimmed) return;
    const sanitized = trimmed.replace(/\s+/g, '-');
    if (onChangeBranch) {
      onChangeBranch(sanitized, checkoutFrom || 'main');
    }
    setIsOpen(false);
  };

  const filteredBranches = branchList.filter(b => 
    b.toLowerCase().includes(searchQuery.toLowerCase().trim())
  );

  const isQueryNew = searchQuery.trim() && !branchList.some(
    b => b.toLowerCase() === searchQuery.trim().toLowerCase()
  );

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Branch Pill Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!disabled) setIsOpen(prev => !prev);
        }}
        title={disabled ? (disabledTooltip || `Branch: ${currentBranch}`) : `Branch: ${currentBranch} (Click to switch or create branch)`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          padding: '3px 8px',
          backgroundColor: isOpen ? '#f1f5f9' : '#ffffff',
          border: `1px solid ${isOpen ? '#cbd5e1' : '#e2e8f0'}`,
          borderRadius: '6px',
          fontSize: '11.5px',
          fontWeight: '600',
          color: '#334155',
          cursor: disabled ? 'default' : 'pointer',
          transition: 'all 0.15s ease',
          userSelect: 'none',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)'
        }}
        onMouseEnter={(e) => {
          if (!disabled) {
            e.currentTarget.style.backgroundColor = '#f8fafc';
            e.currentTarget.style.borderColor = '#cbd5e1';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabled && !isOpen) {
            e.currentTarget.style.backgroundColor = '#ffffff';
            e.currentTarget.style.borderColor = '#e2e8f0';
          }
        }}
      >
        <GitBranch size={12.5} color="#7c3aed" style={{ flexShrink: 0 }} />
        <span style={{ 
          maxWidth: '130px', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis', 
          whiteSpace: 'nowrap',
          color: '#0f172a'
        }}>
          {currentBranch || 'main'}
        </span>
        {!disabled && (
          <ChevronDown 
            size={11} 
            color="#94a3b8" 
            style={{ 
              transition: 'transform 0.2s ease',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              flexShrink: 0 
            }} 
          />
        )}
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            ...(placement === 'top' 
              ? { bottom: 'calc(100% + 8px)', left: 0 } 
              : { top: 'calc(100% + 6px)', left: 0 }),
            width: '280px',
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            boxShadow: '0 12px 30px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.08)',
            zIndex: 1100,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            animation: 'popover-in 0.15s cubic-bezier(0.16, 1, 0.3, 1)'
          }}
        >
          {/* ========================================================= */}
          {/* VIEW 1: SWITCH / SELECT BRANCH LIST                       */}
          {/* ========================================================= */}
          {mode === 'list' && (
            <>
              {/* Header */}
              <div style={{
                padding: '8px 10px 7px 10px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <GitBranch size={13} color="#7c3aed" />
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#475569', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
                    {title}
                  </span>
                </div>
                
                {/* Switch to Create Mode button */}
                <button
                  type="button"
                  onClick={() => {
                    setNewBranchName(searchQuery.trim());
                    setMode('create');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontWeight: '600',
                    color: '#7c3aed',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f3ff'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Plus size={12} />
                  <span>New Branch</span>
                </button>
              </div>

              {/* Search input */}
              <div style={{ padding: '8px 10px 6px 10px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  gap: '6px'
                }}>
                  <Search size={12} color="#94a3b8" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setIsOpen(false);
                      else if (e.key === 'Enter' && searchQuery.trim()) {
                        e.preventDefault();
                        if (isQueryNew) {
                          setNewBranchName(searchQuery.trim());
                          setMode('create');
                        } else if (filteredBranches.length > 0) {
                          handleSelectExisting(filteredBranches[0]);
                        }
                      }
                    }}
                    placeholder="Search branches..."
                    style={{
                      width: '100%',
                      border: 'none',
                      outline: 'none',
                      fontSize: '12px',
                      backgroundColor: 'transparent',
                      color: '#0f172a'
                    }}
                  />
                </div>
              </div>

              {/* Branch List */}
              <div style={{ maxHeight: '190px', overflowY: 'auto', padding: '4px' }}>
                {/* Quick button to create from non-matching query */}
                {isQueryNew && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewBranchName(searchQuery.trim());
                      setMode('create');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      width: '100%',
                      padding: '6px 8px',
                      backgroundColor: '#f5f3ff',
                      border: '1px dashed #c4b5fd',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '11.5px',
                      color: '#6d28d9',
                      fontWeight: '600',
                      marginBottom: '4px',
                      textAlign: 'left'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                      <Plus size={12} color="#7c3aed" />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        Create "{searchQuery.trim()}"...
                      </span>
                    </div>
                    <span style={{ fontSize: '10px', color: '#8b5cf6' }}>from {currentBranch}</span>
                  </button>
                )}

                {filteredBranches.map((b) => {
                  const isSelected = b === currentBranch;
                  return (
                    <button
                      key={b}
                      type="button"
                      onClick={() => handleSelectExisting(b)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '6px 8px',
                        backgroundColor: isSelected ? '#f8fafc' : 'transparent',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: isSelected ? '#0f172a' : '#475569',
                        fontWeight: isSelected ? '600' : '400',
                        textAlign: 'left',
                        transition: 'background-color 0.12s ease'
                      }}
                      onMouseEnter={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = '#f1f5f9';
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <GitBranch size={11.5} color={isSelected ? '#7c3aed' : '#94a3b8'} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b}
                        </span>
                      </div>
                      {isSelected && <Check size={12} color="#7c3aed" />}
                    </button>
                  );
                })}

                {filteredBranches.length === 0 && !isQueryNew && (
                  <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px', color: '#94a3b8' }}>
                    No branches found. Click <strong>New Branch</strong> above to create one.
                  </div>
                )}
              </div>
            </>
          )}

          {/* ========================================================= */}
          {/* VIEW 2: CREATE NEW BRANCH (WITH "CHECKOUT FROM")          */}
          {/* ========================================================= */}
          {mode === 'create' && (
            <form onSubmit={handleCreateBranch} style={{ display: 'flex', flexDirection: 'column' }}>
              {/* Header with Back button */}
              <div style={{
                padding: '8px 10px',
                borderBottom: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <button
                  type="button"
                  onClick={() => setMode('list')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                    borderRadius: '4px'
                  }}
                  title="Back to branch list"
                >
                  <ArrowLeft size={13} />
                </button>
                <span style={{ fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                  Create New Branch
                </span>
              </div>

              <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* 1. New Branch Name */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '600', color: '#475569' }}>
                    Branch Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    ref={createInputRef}
                    type="text"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="e.g. feat/user-auth"
                    style={{
                      padding: '6px 8px',
                      fontSize: '12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      outline: 'none',
                      color: '#0f172a',
                      backgroundColor: '#ffffff'
                    }}
                  />
                </div>

                {/* 2. Checkout From (Base Branch) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label style={{ fontSize: '11px', fontWeight: '600', color: '#475569' }}>
                      Checkout from
                    </label>
                    <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                      source branch
                    </span>
                  </div>
                  <select
                    value={checkoutFrom}
                    onChange={(e) => setCheckoutFrom(e.target.value)}
                    style={{
                      padding: '6px 8px',
                      fontSize: '12px',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      outline: 'none',
                      color: '#0f172a',
                      backgroundColor: '#f8fafc',
                      cursor: 'pointer'
                    }}
                  >
                    {branchList.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setMode('list')}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: '11.5px',
                      fontWeight: '500',
                      color: '#64748b',
                      backgroundColor: '#f1f5f9',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={!newBranchName.trim()}
                    style={{
                      flex: 1.5,
                      padding: '6px 10px',
                      fontSize: '11.5px',
                      fontWeight: '600',
                      color: '#ffffff',
                      backgroundColor: newBranchName.trim() ? '#7c3aed' : '#c4b5fd',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: newBranchName.trim() ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <GitBranch size={12} />
                    <span>Create Branch</span>
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
