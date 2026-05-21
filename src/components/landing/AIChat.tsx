import React, {useState, useEffect, useRef, type ReactNode} from 'react';
import {Reveal, CodeWindow, Eyebrow, Icon} from './Primitives';

function ChatMessage({
  role,
  children,
  delay = 0,
  inView,
}: {
  role: 'user' | 'ai';
  children: ReactNode;
  delay?: number;
  inView: boolean;
}) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [inView, delay]);

  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        opacity: shown ? 1 : 0,
        transform: shown ? 'none' : 'translateY(6px)',
        transition: 'opacity .5s ease, transform .5s ease',
        marginBottom: 18,
      }}>
      <div
        style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: isUser ? 'var(--ag-bg-3)' : 'var(--ag-accent)',
          color: isUser ? 'var(--ag-fg-muted)' : 'var(--ag-accent-ink)',
          fontFamily: 'var(--ag-font-mono)',
          fontSize: 11,
          fontWeight: 600,
          boxShadow: isUser ? 'none' : '0 0 16px -2px var(--ag-accent-glow)',
        }}>
        {isUser ? 'U' : '✦'}
      </div>
      <div style={{flex: 1, minWidth: 0}}>
        <div
          style={{
            fontFamily: 'var(--ag-font-mono)',
            fontSize: 11,
            color: 'var(--ag-fg-dim)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            marginBottom: 6,
          }}>
          {isUser ? 'You' : 'Claude · rhino-blueprint'}
        </div>
        <div style={{color: 'var(--ag-fg)', fontSize: 14, lineHeight: 1.6}}>{children}</div>
      </div>
    </div>
  );
}

export function AIChat() {
  const ref = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      {threshold: 0.25},
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  return (
    <section className="ag-section" id="ai" ref={ref}>
      <div className="ag-wrap">
        <div
          className="ag-ai-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 0.85fr) minmax(0, 1.15fr)',
            gap: 72,
            alignItems: 'start',
          }}>
          <div>
            <Reveal>
              <Eyebrow>AI-Powered</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
              <h2 style={{marginTop: 20, marginBottom: 20}}>
                Describe what you need.<br />
                <span className="ag-accent">AI writes the Blueprint.</span>
              </h2>
            </Reveal>
            <Reveal delay={160}>
              <p
                style={{
                  fontSize: 16.5,
                  color: 'var(--ag-fg-muted)',
                  maxWidth: 440,
                  textWrap: 'pretty' as React.CSSProperties['textWrap'],
                }}>
                Claude and Cursor read the Rhino conventions and emit a YAML blueprint. You
                review it like a diff. The framework — not the model — turns it into production
                code.
              </p>
            </Reveal>
            <Reveal delay={240}>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: '28px 0 0',
                  display: 'grid',
                  gap: 14,
                }}>
                {(
                  [
                    ['Declarative.', 'No more guessing at controllers.'],
                    ['Reviewable.', 'A 30-line YAML beats a 300-line PR.'],
                    ['Deterministic.', 'Same YAML → same code, every time.'],
                  ] as const
                ).map(([k, v]) => (
                  <li key={k} style={{display: 'flex', gap: 10}}>
                    <span style={{color: 'var(--ag-accent)', marginTop: 3}}>
                      <Icon.check />
                    </span>
                    <span style={{color: 'var(--ag-fg-muted)'}}>
                      <b style={{color: 'var(--ag-fg)'}}>{k}</b> {v}
                    </span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <CodeWindow title="claude code — ~/acme" glow>
              <div style={{padding: '4px 2px'}}>
                <ChatMessage role="user" delay={200} inView={inView}>
                  Create a <code style={{color: 'var(--ag-accent)'}}>Contract</code> model with{' '}
                  <code style={{color: 'var(--ag-fg)'}}>title</code>,{' '}
                  <code style={{color: 'var(--ag-fg)'}}>total_value</code>, and{' '}
                  <code style={{color: 'var(--ag-fg)'}}>status</code>. Admins can create all fields
                  but only update title + status. Viewers can see id, title, status only.
                </ChatMessage>

                <ChatMessage role="ai" delay={1100} inView={inView}>
                  <div style={{color: 'var(--ag-fg-muted)', marginBottom: 10}}>
                    Running <span className="ag-accent">/rhino-blueprint</span>. Here's the YAML:
                  </div>
                  <div
                    style={{
                      background: 'var(--ag-bg-0)',
                      border: '1px solid var(--ag-line-soft)',
                      borderRadius: 8,
                      padding: '12px 14px',
                      fontFamily: 'var(--ag-font-mono)',
                      fontSize: 12.5,
                      lineHeight: 1.7,
                    }}>
                    <pre style={{margin: 0, fontFamily: 'inherit', whiteSpace: 'pre'}}>
                      <span className="ag-key">model</span>
                      <span className="ag-pun">:</span> <span className="ag-str">Contract</span>
                      {'\n'}
                      <span className="ag-key">columns</span>
                      <span className="ag-pun">:</span>
                      {'\n'}
                      {'  '}
                      <span className="ag-pun">-</span>{' '}
                      <span className="ag-key">title</span>
                      <span className="ag-pun">:</span>{'       '}
                      <span className="ag-kw">string</span>{' '}
                      <span className="ag-cm"># required</span>
                      {'\n'}
                      {'  '}
                      <span className="ag-pun">-</span>{' '}
                      <span className="ag-key">total_value</span>
                      <span className="ag-pun">:</span>{' '}
                      <span className="ag-kw">decimal</span>
                      {'\n'}
                      {'  '}
                      <span className="ag-pun">-</span>{' '}
                      <span className="ag-key">status</span>
                      <span className="ag-pun">:</span>{'      '}
                      <span className="ag-kw">enum</span>
                      <span className="ag-pun">(</span>
                      <span className="ag-str">draft</span>
                      <span className="ag-pun">,</span>{' '}
                      <span className="ag-str">signed</span>
                      <span className="ag-pun">,</span>{' '}
                      <span className="ag-str">void</span>
                      <span className="ag-pun">)</span>
                      {'\n'}
                      <span className="ag-key">permissions</span>
                      <span className="ag-pun">:</span>
                      {'\n'}
                      {'  '}
                      <span className="ag-key">admin</span>
                      <span className="ag-pun">:</span>
                      {'\n'}
                      {'    '}
                      <span className="ag-key">create</span>
                      <span className="ag-pun">:</span>{' '}
                      <span className="ag-str">[title, total_value, status]</span>
                      {'\n'}
                      {'    '}
                      <span className="ag-key">update</span>
                      <span className="ag-pun">:</span>{' '}
                      <span className="ag-str">[title, status]</span>
                      {'\n'}
                      {'    '}
                      <span className="ag-key">show</span>
                      <span className="ag-pun">:</span>{'   '}
                      <span className="ag-str">*</span>
                      {'\n'}
                      {'  '}
                      <span className="ag-key">viewer</span>
                      <span className="ag-pun">:</span>
                      {'\n'}
                      {'    '}
                      <span className="ag-key">show</span>
                      <span className="ag-pun">:</span>{'   '}
                      <span className="ag-str">[id, title, status]</span>
                    </pre>
                  </div>
                </ChatMessage>

                <ChatMessage role="user" delay={2400} inView={inView}>
                  Now generate the code.
                </ChatMessage>

                <ChatMessage role="ai" delay={3100} inView={inView}>
                  <div
                    style={{
                      background: 'var(--ag-bg-0)',
                      border: '1px solid var(--ag-line-soft)',
                      borderRadius: 8,
                      padding: '10px 12px',
                      fontFamily: 'var(--ag-font-mono)',
                      fontSize: 12.5,
                      lineHeight: 1.85,
                    }}>
                    <div>
                      <span className="ag-prompt" />
                      php artisan <span className="ag-fn">rhino:blueprint</span>{' '}
                      <span className="ag-str">contracts.yaml</span>
                    </div>
                    {['Model', 'Migration', 'Factory', 'Policy', 'Tests', 'Seeder'].map((x, i) => (
                      <div
                        key={x}
                        style={{
                          color: 'var(--ag-fg-muted)',
                          animation: inView
                            ? `ag-fadeIn .4s ${3.4 + i * 0.15}s both`
                            : 'none',
                        }}>
                        <span className="ag-output-ok">✓</span> {x}
                      </div>
                    ))}
                    <div style={{marginTop: 8, color: 'var(--ag-accent)'}}>
                      Done —{' '}
                      <span style={{color: 'var(--ag-fg-muted)'}}>
                        6 files generated. <span className="ag-cm">Zero AI tokens used.</span>
                      </span>
                    </div>
                  </div>
                  <div style={{marginTop: 12}}>
                    <a
                      href="#blueprint"
                      style={{
                        color: 'var(--ag-accent)',
                        fontFamily: 'var(--ag-font-mono)',
                        fontSize: 13,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                      See the generated code ↓
                    </a>
                  </div>
                </ChatMessage>
              </div>
            </CodeWindow>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
