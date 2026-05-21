import React, { useState, useRef, useCallback } from 'react';
import { useDoc } from '@docusaurus/plugin-content-docs/client';
import useBaseUrl from '@docusaurus/useBaseUrl';

/**
 * Determines the tech stack from the doc's edit URL path.
 * Returns 'server' | 'nestjs' | 'rails' | null
 */
function getStackFromEditUrl(editUrl: string): string | null {
  if (editUrl.includes('/docs/nestjs/')) return 'nestjs';
  if (editUrl.includes('/docs/rails/')) return 'rails';
  // Default to server (Laravel) for all other doc pages
  if (editUrl.includes('/docs/')) return 'server';
  return null;
}

function buildSkillUrl(baseUrl: string, stack: string): string {
  return `${baseUrl}skills/${stack}/SKILL.md`;
}

function buildRawUrl(editUrl: string): string {
  return editUrl
    .replace('github.com', 'raw.githubusercontent.com')
    .replace('/tree/', '/');
}

function buildMessage(skillUrl: string, rawUrl: string, question: string): string {
  if (!question.trim()) {
    return `Read from ${skillUrl} and let me know when you are ready for questions. If you need additional context, the full documentation page is at ${rawUrl}`;
  }
  return `Read from ${skillUrl} and answer this question: ${question}`;
}

const ChatGPTIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path
      d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855l-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023l-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135l-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365l2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.607-1.5z"
      fill="currentColor"
    />
  </svg>
);

const ClaudeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="m3.127 10.604 3.135-1.76.053-.153-.053-.085H6.11l-.525-.032-1.791-.048-1.554-.065-1.505-.08-.38-.081L0 7.832l.036-.234.32-.214.455.04 1.009.069 1.513.105 1.097.064 1.626.17h.259l.036-.105-.089-.065-.068-.064-1.566-1.062-1.695-1.121-.887-.646-.48-.327-.243-.306-.104-.67.435-.48.585.04.15.04.593.456 1.267.981 1.654 1.218.242.202.097-.068.012-.049-.109-.181-.9-1.626-.96-1.655-.428-.686-.113-.411a2 2 0 0 1-.068-.484l.496-.674L4.446 0l.662.089.279.242.411.94.666 1.48 1.033 2.014.302.597.162.553.06.17h.105v-.097l.085-1.134.157-1.392.154-1.792.052-.504.25-.605.497-.327.387.186.319.456-.045.294-.19 1.23-.37 1.93-.243 1.29h.142l.161-.16.654-.868 1.097-1.372.484-.545.565-.601.363-.287h.686l.505.751-.226.775-.707.895-.585.759-.839 1.13-.524.904.048.072.125-.012 1.897-.403 1.024-.186 1.223-.21.553.258.06.263-.218.536-1.307.323-1.533.307-2.284.54-.028.02.032.04 1.029.098.44.024h1.077l2.005.15.525.346.315.424-.053.323-.807.411-3.631-.863-.872-.218h-.12v.073l.726.71 1.331 1.202 1.667 1.55.084.383-.214.302-.226-.032-1.464-1.101-.565-.497-1.28-1.077h-.084v.113l.295.432 1.557 2.34.08.718-.112.234-.404.141-.444-.08-.911-1.28-.94-1.44-.759-1.291-.093.053-.448 4.821-.21.246-.484.186-.403-.307-.214-.496.214-.98.258-1.28.21-1.016.19-1.263.112-.42-.008-.028-.092.012-.953 1.307-1.448 1.957-1.146 1.227-.274.109-.477-.247.045-.44.266-.39 1.586-2.018.956-1.25.617-.723-.004-.105h-.036l-4.212 2.736-.75.096-.324-.302.04-.496.154-.162 1.267-.871z" />
  </svg>
);

export default function AskAI(): React.ReactNode {
  const [question, setQuestion] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { metadata } = useDoc();
  const baseUrl = useBaseUrl('/');

  const stack = metadata.editUrl ? getStackFromEditUrl(metadata.editUrl) : null;
  const skillUrl = stack ? buildSkillUrl(baseUrl, stack) : '';
  const rawUrl = metadata.editUrl ? buildRawUrl(metadata.editUrl) : '';

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
  }, []);

  const handleAsk = (provider: 'chatgpt' | 'claude') => {
    if (!skillUrl) return;

    const message = buildMessage(skillUrl, rawUrl, question);
    const encoded = encodeURIComponent(message);

    const url =
      provider === 'chatgpt'
        ? `https://chatgpt.com/?q=${encoded}`
        : `https://claude.ai/new?q=${encoded}`;

    window.open(url, '_blank', 'noopener');
    setQuestion('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  if (!skillUrl) return null;

  return (
    <div className="ask-ai">
      <div className="ask-ai__bar">
        <textarea
          ref={textareaRef}
          className="ask-ai__input"
          placeholder="Ask AI about this page..."
          value={question}
          rows={1}
          onChange={(e) => {
            setQuestion(e.target.value);
            autoResize();
          }}
        />
        <div className="ask-ai__buttons">
          <button
            className="ask-ai__btn ask-ai__btn--chatgpt"
            onClick={() => handleAsk('chatgpt')}
            title="Ask with ChatGPT"
          >
            <ChatGPTIcon />
            <span>ChatGPT</span>
          </button>
          <button
            className="ask-ai__btn ask-ai__btn--claude"
            onClick={() => handleAsk('claude')}
            title="Ask with Claude"
          >
            <ClaudeIcon />
            <span>Claude</span>
          </button>
        </div>
      </div>
    </div>
  );
}
