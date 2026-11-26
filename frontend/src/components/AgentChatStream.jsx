import React, { useState, useRef, useEffect } from 'react';
import { 
  Terminal, 
  FileText, 
  FileCode, 
  Search, 
  Check, 
  AlertCircle, 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Sparkles, 
  Brain, 
  CheckCircle2, 
  Folder,
  Loader2
} from 'lucide-react';

/**
 * Renders a Markdown-like formatted message safely without external dependencies
 */
function FormattedText({ content = '', isStreaming = false }) {
  if (!content) return null;

  // Split by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div style={{ fontSize: '14px', lineHeight: '1.7', color: 'var(--text-primary)' }}>
      {parts.map((part, index) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w+)?\n([\s\S]*?)```/);
          const lang = match ? match[1] || '' : '';
          const code = match ? match[2] : part.slice(3, -3);

          return <CodeBlock key={index} language={lang} code={code} />;
        }

        return <InlineFormattedText key={index} text={part} />;
      })}
      {isStreaming && (
        <span 
          style={{ 
            display: 'inline-block', 
            width: '6px', 
            height: '14px', 
            backgroundColor: 'var(--primary)', 
            marginLeft: '4px',
            verticalAlign: 'middle',
            animation: 'pulse 1s infinite'
          }} 
        />
      )}
    </div>
  );
}

function InlineFormattedText({ text }) {
  const lines = text.split('\n');

  return (
    <>
      {lines.map((line, lIdx) => {
        // Heading check
        if (line.startsWith('### ')) {
          return <h4 key={lIdx} style={{ fontSize: '15px', fontWeight: '600', margin: '14px 0 6px 0', color: 'var(--text-primary)' }}>{renderInline(line.slice(4))}</h4>;
        }
        if (line.startsWith('## ')) {
          return <h3 key={lIdx} style={{ fontSize: '16px', fontWeight: '700', margin: '16px 0 8px 0', color: 'var(--text-primary)' }}>{renderInline(line.slice(3))}</h3>;
        }
        if (line.startsWith('# ')) {
          return <h2 key={lIdx} style={{ fontSize: '18px', fontWeight: '700', margin: '18px 0 10px 0', color: 'var(--text-primary)' }}>{renderInline(line.slice(2))}</h2>;
        }
        // Bullet list
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <div key={lIdx} style={{ display: 'flex', gap: '8px', marginLeft: '12px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>•</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        }
        // Numbered list
        const numMatch = line.match(/^(\d+)\.\s(.*)/);
        if (numMatch) {
          return (
            <div key={lIdx} style={{ display: 'flex', gap: '8px', marginLeft: '12px', marginBottom: '4px' }}>
              <span style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: '12px', marginTop: '2px' }}>{numMatch[1]}.</span>
              <span>{renderInline(numMatch[2])}</span>
            </div>
          );
        }

        if (!line.trim()) {
          return <div key={lIdx} style={{ height: '8px' }} />;
        }

        return <p key={lIdx} style={{ marginBottom: '6px' }}>{renderInline(line)}</p>;
      })}
    </>
  );
}

function renderInline(text) {
  // Support bold **text** and inline `code`
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);

  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code 
          key={idx} 
          style={{ 
            backgroundColor: '#f1f5f9', 
            padding: '2px 6px', 
            borderRadius: '4px', 
            fontFamily: 'var(--font-mono)', 
            fontSize: '12.5px',
            color: '#0f172a',
            border: '1px solid #e2e8f0'
          }} 
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={idx} style={{ color: '#0f172a', fontWeight: '600' }}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function CodeBlock({ language, code }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ 
      margin: '12px 0', 
      borderRadius: '8px', 
      border: '1px solid var(--border-color)', 
      backgroundColor: '#f8fafc', 
      overflow: 'hidden' 
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        padding: '6px 12px', 
        backgroundColor: '#f1f5f9', 
        borderBottom: '1px solid var(--border-color)',
        fontSize: '11px',
        color: 'var(--text-secondary)'
      }}>
        <span style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', fontWeight: '600', letterSpacing: '0.5px' }}>
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          style={{
            background: 'transparent',
            border: 'none',
            color: copied ? 'var(--accent-ready)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            cursor: 'pointer',
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: '4px'
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre style={{ 
        padding: '12px', 
        margin: 0, 
        overflowX: 'auto', 
        fontFamily: 'var(--font-mono)', 
        fontSize: '12.5px', 
        lineHeight: '1.6', 
        color: '#0f172a' 
      }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Text-only Thinking Animation: Clean text with animated pulsing dots (no boxes, no background colors)
 */
function SimpleThinkingText() {
  return (
    <div className="thinking-text-wrap">
      <span className="thinking-label">Thinking</span>
      <span className="thinking-dot">.</span>
      <span className="thinking-dot">.</span>
      <span className="thinking-dot">.</span>
    </div>
  );
}

/**
 * Message Thread Component displaying user turns and Claude streaming responses
 * Clean, unboxed design with pure text stream
 */
export default function AgentChatStream({ messages = [], isAgentRunning = false, activeRepos = [] }) {
  const containerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const isAutoScrollRef = useRef(true);

  // Detect user manual scroll to avoid hijacking scroll if reading previous turns
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= 120;
    isAutoScrollRef.current = isAtBottom;
  };

  useEffect(() => {
    if (isAutoScrollRef.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isAgentRunning]);

  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      style={{ 
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex', 
        flexDirection: 'column', 
        gap: '20px', 
        paddingRight: '6px',
        paddingBottom: '24px', 
        width: '100%',
        boxSizing: 'border-box',
        scrollBehavior: 'smooth'
      }}
    >
      {messages.map((turn, index) => {
        if (turn.role === 'user') {
          return (
            <div 
              key={turn.id || index} 
              style={{ 
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'flex-end', 
                width: '100%',
                padding: '2px 0'
              }}
            >
              {/* User Label: You • Just now */}
              <div style={{
                fontSize: '11.5px',
                color: '#94a3b8',
                marginBottom: '4px',
                marginRight: '2px'
              }}>
                {turn.userName || 'You'} • {turn.time || 'Just now'}
              </div>

              {/* User Bubble */}
              <div style={{ 
                maxWidth: '75%', 
                color: '#0f172a', 
                whiteSpace: 'pre-wrap', 
                backgroundColor: '#f1f5f9',
                padding: '10px 16px',
                borderRadius: '12px',
                fontSize: '14px',
                lineHeight: '1.6',
                wordBreak: 'break-word',
                fontWeight: '400'
              }}>
                {typeof turn.content === 'string' ? turn.content : (turn.text || JSON.stringify(turn.content))}
              </div>
            </div>
          );
        }

        // Assistant Turn
        const isCurrentActiveTurn = isAgentRunning && index === messages.length - 1;

        return (
          <div 
            key={turn.id || index} 
            style={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'flex-start', 
              width: '100%',
              padding: '2px 0',
              gap: '6px'
            }}
          >
            {/* Assistant Header: Claude */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: '#64748b',
              marginBottom: '2px'
            }}>
              <span style={{ fontWeight: '600', color: '#0f172a' }}>
                {turn.author || 'Claude'}
              </span>
              {turn.thoughtTime && (
                <span>
                  • Thought for {turn.thoughtTime}
                </span>
              )}
            </div>

            {/* Assistant Content Container - No boxes, no borders, no cards */}
            <div style={{
              width: '100%',
              maxWidth: '850px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {/* Text-only Thinking Animation while working */}
              {isCurrentActiveTurn && !turn.text && !turn.error && (
                <SimpleThinkingText />
              )}

              {/* Error Message */}
              {turn.error && (
                <div style={{ 
                  color: '#dc2626',
                  fontSize: '13.5px',
                  lineHeight: '1.5'
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '2px' }}>Request failed</div>
                  <div>{turn.text || 'Unable to communicate with agent service.'}</div>
                </div>
              )}

              {/* Assistant Main Final Output */}
              {!turn.error && turn.text && (
                <FormattedText 
                  content={turn.text} 
                  isStreaming={isCurrentActiveTurn} 
                />
              )}

              {/* Optional Code Snippet Display if supplied */}
              {turn.codeSnippet && (
                <div style={{ marginTop: '8px' }}>
                  <CodeBlock language="tsx" code={turn.codeSnippet} />
                </div>
              )}

              {/* Interrupted message */}
              {turn.interrupted && (
                <div style={{ 
                  fontSize: '12.5px',
                  color: '#d97706',
                  fontStyle: 'italic',
                  marginTop: '4px'
                }}>
                  Agent turn was interrupted
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div ref={messagesEndRef} style={{ height: '1px', flexShrink: 0 }} />

      <style>{`
        .thinking-text-wrap {
          display: inline-flex;
          align-items: baseline;
          font-size: 14px;
          color: #64748b;
          user-select: none;
          padding: 2px 0;
          line-height: 1.6;
        }

        .thinking-label {
          letter-spacing: -0.01em;
        }

        .thinking-dot {
          display: inline-block;
          font-weight: 600;
          opacity: 0.2;
          animation: thinking-dot-bounce 1.4s infinite ease-in-out both;
        }

        .thinking-dot:nth-child(2) {
          animation-delay: 0s;
        }
        .thinking-dot:nth-child(3) {
          animation-delay: 0.2s;
        }
        .thinking-dot:nth-child(4) {
          animation-delay: 0.4s;
        }

        @keyframes thinking-dot-bounce {
          0%, 80%, 100% {
            opacity: 0.2;
            transform: translateY(0);
          }
          40% {
            opacity: 1;
            transform: translateY(-2px);
          }
        }
      `}</style>
    </div>
  );
}
