import React, {useState} from 'react';
import AIDownloadModal from './AIDownloadModal';

const AIIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round">
    <path d="M12 2a4 4 0 0 1 4 4v2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2V6a4 4 0 0 1 4-4z" />
    <circle cx="9" cy="14" r="1" fill="currentColor" />
    <circle cx="15" cy="14" r="1" fill="currentColor" />
  </svg>
);

export default function AIDownloadButton(): React.ReactNode {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        className="ai-download-trigger"
        onClick={() => setIsOpen(true)}
        title="Download the Rhino init skill for your AI tool">
        <AIIcon />
        <span>Get Rhino</span>
      </button>
      {isOpen && <AIDownloadModal onClose={() => setIsOpen(false)} />}
    </>
  );
}
