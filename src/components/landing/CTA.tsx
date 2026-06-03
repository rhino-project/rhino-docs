import React from 'react';
import {Reveal, Eyebrow, Button, Icon} from './Primitives';

const GITHUB_URL = 'https://github.com/rhino-project';

function Bracket({pos}: {pos: 'tl' | 'tr' | 'bl' | 'br'}) {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 18,
    height: 18,
    borderColor: 'var(--ag-accent-dim)',
    borderStyle: 'solid',
    borderWidth: 0,
  };
  const map: Record<string, React.CSSProperties> = {
    tl: {top: 16, left: 16, borderTopWidth: 1, borderLeftWidth: 1},
    tr: {top: 16, right: 16, borderTopWidth: 1, borderRightWidth: 1},
    bl: {bottom: 16, left: 16, borderBottomWidth: 1, borderLeftWidth: 1},
    br: {bottom: 16, right: 16, borderBottomWidth: 1, borderRightWidth: 1},
  };
  return <span style={{...base, ...map[pos]}} />;
}

function FooterCol({title, items}: {title: string; items: {label: string; href: string}[]}) {
  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--ag-font-mono)',
          fontSize: 11,
          color: 'var(--ag-fg-dim)',
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          marginBottom: 14,
        }}>
        {title}
      </div>
      <ul style={{listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8}}>
        {items.map((x) => (
          <li key={x.label}>
            <a href={x.href} style={{color: 'var(--ag-fg-muted)', fontSize: 13}}>
              {x.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CTA() {
  return (
    <section className="ag-section" id="cta" style={{position: 'relative', overflow: 'hidden'}}>
      <div className="ag-ambient-glow" style={{top: '10%', opacity: 0.4}} />
      <div className="ag-wrap" style={{position: 'relative'}}>
        <div
          style={{
            position: 'relative',
            border: '1px solid var(--ag-line)',
            borderRadius: 20,
            background:
              'radial-gradient(ellipse at 30% 0%, oklch(1 0 0 / 0.04), transparent 60%), ' +
              'linear-gradient(180deg, var(--ag-bg-1), var(--ag-bg-0))',
            padding: '72px 56px',
            overflow: 'hidden',
          }}>
          <Bracket pos="tl" />
          <Bracket pos="tr" />
          <Bracket pos="bl" />
          <Bracket pos="br" />

          <div
            className="ag-cta-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 1fr',
              gap: 48,
              alignItems: 'center',
            }}>
            <div>
              <Reveal>
                <Eyebrow>Ready to ship</Eyebrow>
              </Reveal>
              <Reveal delay={80}>
                <h2 style={{marginTop: 22}}>
                  Stop writing boilerplate.<br />
                  <span className="ag-accent">Start shipping.</span>
                </h2>
              </Reveal>
              <Reveal delay={160}>
                <p
                  style={{
                    color: 'var(--ag-fg-muted)',
                    fontSize: 17,
                    marginTop: 18,
                    maxWidth: 480,
                    textWrap: 'pretty' as React.CSSProperties['textWrap'],
                  }}>
                  Install Rhino and ship your API today — in Laravel, Rails, or NestJS.
                </p>
              </Reveal>
              <Reveal delay={240}>
                <div style={{display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap'}}>
                  <Button variant="primary" href="/intro">
                    Read the docs <Icon.arrow className="ag-arrow" />
                  </Button>
                  <Button href={GITHUB_URL} target="_blank" rel="noreferrer">
                    <Icon.github /> Star on GitHub
                  </Button>
                </div>
              </Reveal>
            </div>

            <Reveal delay={200}>
              <div
                style={{
                  fontFamily: 'var(--ag-font-mono)',
                  fontSize: 13.5,
                  background: 'var(--ag-bg-term)',
                  border: '1px solid var(--ag-line)',
                  borderRadius: 12,
                  padding: '18px 20px',
                  boxShadow: 'var(--ag-shadow-card)',
                }}>
                <div
                  style={{
                    color: 'var(--ag-fg-dim)',
                    fontSize: 11,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}>
                  # 60 seconds to first endpoint
                </div>
                <div>
                  <span className="ag-prompt" />
                  composer require <span className="ag-str">rhino-project/rhino-laravel</span>
                </div>
                <div>
                  <span className="ag-prompt" />
                  php artisan <span className="ag-fn">rhino:install</span>
                </div>
                <div>
                  <span className="ag-prompt" />
                  php artisan <span className="ag-fn">rhino:generate</span>{' '}
                  <span className="ag-str">Post</span>
                </div>
                <div style={{color: 'var(--ag-accent)', marginTop: 8}}>
                  → 8 endpoints ready at /api/posts
                </div>
              </div>
            </Reveal>
          </div>
        </div>

        <footer
          className="ag-footer-grid"
          style={{
            marginTop: 80,
            borderTop: '1px dashed var(--ag-line-soft)',
            paddingTop: 40,
            display: 'grid',
            gridTemplateColumns: '1.6fr 1fr 1fr 1fr',
            gap: 40,
          }}>
          <div>
            <div className="ag-logo" style={{marginBottom: 12}}>
              <span className="ag-logo-mark">A</span>
              <span>rhino</span>
              <span style={{color: 'var(--ag-fg-faint)', fontSize: 12, marginLeft: 2}}>/dev</span>
            </div>
            <p style={{color: 'var(--ag-fg-dim)', fontSize: 13, maxWidth: 320, margin: 0}}>
              The right way AI agents write code. Automatic REST APIs for Laravel, Rails &
              NestJS.
            </p>
            <div
              style={{
                marginTop: 20,
                fontFamily: 'var(--ag-font-mono)',
                fontSize: 11.5,
                color: 'var(--ag-fg-faint)',
              }}>
              © {new Date().getFullYear()} Startsoft · MIT licensed
            </div>
          </div>
          <FooterCol
            title="Servers"
            items={[
              {label: 'Laravel', href: '/server/getting-started'},
              {label: 'Rails', href: '/rails/getting-started'},
              {label: 'NestJS', href: '/nestjs/getting-started'},
            ]}
          />
          <FooterCol
            title="Clients"
            items={[
              {label: 'React', href: '/react/getting-started'},
              {label: 'React Native', href: '/react-native/getting-started'},
            ]}
          />
          <FooterCol
            title="More"
            items={[
              {label: 'Docs', href: '/intro'},
              {label: 'GitHub', href: GITHUB_URL},
              {label: 'Blueprint', href: '/server/blueprint'},
            ]}
          />
        </footer>
      </div>
    </section>
  );
}
