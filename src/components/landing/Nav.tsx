import React from 'react';
import {Icon} from './Primitives';

const GITHUB_URL = 'https://github.com/rhino-project';

export function Nav() {
  return (
    <nav className="ag-nav">
      <div className="ag-nav-inner">
        <div className="ag-nav-left">
          <a href="#top" className="ag-logo">
            <span className="ag-logo-mark">A</span>
            <span>rhino</span>
            <span style={{color: 'var(--ag-fg-faint)', fontSize: 12, marginLeft: 2}}>/dev</span>
          </a>
          <div className="ag-nav-links">
            <a href="#blueprint">Blueprint</a>
            <a href="#features">Features</a>
            <a href="#demo">Demo</a>
            <a href="/docs/intro">Docs</a>
          </div>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontFamily: 'var(--ag-font-mono)',
              fontSize: 12,
              color: 'var(--ag-fg-muted)',
            }}>
            <Icon.github />
            <span>GitHub</span>
          </a>
          <a className="ag-btn" href="/docs/intro" style={{padding: '9px 14px', fontSize: 13}}>
            Docs
          </a>
          <a
            className="ag-btn ag-btn-primary"
            href="/docs/server/getting-started"
            style={{padding: '9px 14px', fontSize: 13}}>
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}
