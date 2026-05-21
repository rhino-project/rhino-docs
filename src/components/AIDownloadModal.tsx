import React, {useState, useEffect, useCallback} from 'react';
import {createPortal} from 'react-dom';
import useBaseUrl from '@docusaurus/useBaseUrl';

interface AIDownloadModalProps {
  onClose: () => void;
}

type AiTool = 'claude' | 'cursor' | 'codex';
type OsPlatform = 'mac' | 'windows' | 'linux';

const AI_TOOLS: {id: AiTool; label: string; desc: string}[] = [
  {id: 'claude', label: 'Claude Code', desc: 'Install as a slash command → run /rhino:init'},
  {id: 'cursor', label: 'Cursor', desc: 'Install as a rule file for AI context'},
  {id: 'codex', label: 'Codex / Other', desc: 'Install as an agents file'},
];

const OS_TABS: {id: OsPlatform; label: string}[] = [
  {id: 'mac', label: 'macOS'},
  {id: 'windows', label: 'Windows'},
  {id: 'linux', label: 'Linux'},
];

const SKILL_URL = 'https://rhino-project.org/skills/init/rhino-init.md';

const DEST_PATHS: Record<AiTool, {unix: string; win: string; instruction: string}> = {
  claude: {
    unix: '.claude/commands/rhino-init.md',
    win: '.claude\\commands\\rhino-init.md',
    instruction: 'Then run /rhino:init in Claude Code',
  },
  cursor: {
    unix: '.cursor/rules/rhino-init.md',
    win: '.cursor\\rules\\rhino-init.md',
    instruction: 'Cursor will use this as context when you ask it to set up Rhino',
  },
  codex: {
    unix: 'AGENTS.md',
    win: 'AGENTS.md',
    instruction: 'Your AI tool will use this as the project agent instructions',
  },
};

function buildCliCommand(tool: AiTool, os: OsPlatform): string {
  const dest = DEST_PATHS[tool];
  const path = os === 'windows' ? dest.win : dest.unix;
  const dir = path.includes('/') || path.includes('\\')
    ? (os === 'windows'
      ? path.substring(0, path.lastIndexOf('\\'))
      : path.substring(0, path.lastIndexOf('/')))
    : null;

  if (!dir) {
    // No directory needed (e.g., AGENTS.md at root)
    if (os === 'windows') {
      return `curl -sL ${SKILL_URL} -o ${path}`;
    }
    return `curl -sL ${SKILL_URL} -o ${path}`;
  }

  if (os === 'windows') {
    return `mkdir ${dir} 2>nul & curl -sL ${SKILL_URL} -o ${path}`;
  }
  return `mkdir -p ${dir} && curl -sL ${SKILL_URL} -o ${path}`;
}

function detectOS(): OsPlatform {
  if (typeof navigator === 'undefined') return 'mac';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('win')) return 'windows';
  if (ua.includes('linux')) return 'linux';
  return 'mac';
}

export default function AIDownloadModal({
  onClose,
}: AIDownloadModalProps): React.ReactNode {
  const [copied, setCopied] = useState(false);
  const [tool, setTool] = useState<AiTool>('claude');
  const [os, setOs] = useState<OsPlatform>(detectOS);
  const baseUrl = useBaseUrl('/');

  const skillUrl = `${baseUrl}skills/init/rhino-init.md`.replace(/\/\//g, '/');
  const cliCommand = buildCliCommand(tool, os);

  const handleDownload = useCallback(() => {
    window.open(skillUrl, '_blank', 'noopener');
  }, [skillUrl]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(cliCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [cliCommand]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return createPortal(
    <div className="ai-modal-overlay" onClick={onClose}>
      <div className="ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal__header">
          <h2 className="ai-modal__title">Get Started with Rhino</h2>
          <button className="ai-modal__close" onClick={onClose} title="Close">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <p className="ai-modal__desc">
          Choose your AI coding tool. The init skill will ask you questions, install
          everything, and set up your project with all Rhino features.
        </p>

        {/* AI Tool Selection */}
        <div className="ai-modal__platforms">
          {AI_TOOLS.map((t) => (
            <button
              key={t.id}
              className={`ai-modal__platform ${tool === t.id ? 'ai-modal__platform--selected' : ''}`}
              onClick={() => { setTool(t.id); setCopied(false); }}>
              <div className="ai-modal__platform-radio">
                {tool === t.id ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="#00ffff" strokeWidth="1.5" />
                    <circle cx="8" cy="8" r="4" fill="#00ffff" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="#484f58" strokeWidth="1.5" />
                  </svg>
                )}
              </div>
              <div className="ai-modal__platform-info">
                <span className="ai-modal__platform-name">{t.label}</span>
                <span className="ai-modal__platform-desc">{t.desc}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="ai-modal__divider">
          <span>download or paste in terminal</span>
        </div>

        {/* Download Button */}
        <button className="ai-modal__download" onClick={handleDownload}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download rhino-init.md
        </button>

        <p className="ai-modal__save-hint">
          Save to: <code>{os === 'windows' ? DEST_PATHS[tool].win : DEST_PATHS[tool].unix}</code>
        </p>

        {/* CLI Command */}
        <div className="ai-modal__os-tabs">
          {OS_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`ai-modal__os-tab ${os === tab.id ? 'ai-modal__os-tab--active' : ''}`}
              onClick={() => { setOs(tab.id); setCopied(false); }}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="ai-modal__cli">
          <code className="ai-modal__cli-code">{cliCommand}</code>
          <button className="ai-modal__cli-copy" onClick={handleCopy}>
            {copied ? 'copied!' : 'copy'}
          </button>
        </div>

        <p className="ai-modal__hint">
          {DEST_PATHS[tool].instruction}
        </p>
      </div>
    </div>,
    document.body,
  );
}
