import React, {useState, useEffect, useRef} from 'react';
import {Reveal, CodeWindow, CopyButton, Tabs, Eyebrow, Button, Icon, type Tab} from './Primitives';

const GITHUB_URL = 'https://github.com/rhino-project';

const INSTALL: Record<string, {cmd: string}> = {
  laravel: {cmd: 'composer require rhino-project/rhino-laravel'},
  rails: {cmd: 'bundle add rhino'},
  nestjs: {cmd: 'npm install @rhino-project/rhino-nestjs'},
  react: {cmd: 'npm install @rhino-project/rhino-react'},
};

function InstallWidget() {
  const [fw, setFw] = useState('laravel');
  const tabs: Tab[] = [
    {id: 'laravel', label: 'Laravel'},
    {id: 'rails', label: 'Rails'},
    {id: 'nestjs', label: 'NestJS'},
    {id: 'react', label: 'React'},
  ];
  const entry = INSTALL[fw];
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <Tabs tabs={tabs} value={fw} onChange={setFw} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          border: '1px solid var(--ag-line)',
          borderRadius: 10,
          background: 'var(--ag-bg-term)',
          fontFamily: 'var(--ag-font-mono)',
          fontSize: 13.5,
        }}>
        <span style={{color: 'var(--ag-accent)'}}>$</span>
        <span style={{color: 'var(--ag-fg)', flex: 1, overflow: 'auto', whiteSpace: 'nowrap'}}>
          {entry.cmd}
        </span>
        <CopyButton text={entry.cmd} />
      </div>
    </div>
  );
}

/* Typewriter */
type Part = {text: string; cls?: string};
type Line =
  | {type: 'typed'; parts: Part[]; delay?: number; cps?: number}
  | {type: 'output'; parts: Part[]; delay?: number};

function useTypewriter(lines: Line[], {start = true, speed = 32} = {}) {
  const [idx, setIdx] = useState(0);
  const [typedLen, setTypedLen] = useState(0);
  const [done, setDone] = useState(false);

  const getFlatLen = (line: Line) =>
    (line.parts || []).reduce((n, p) => n + (p.text?.length || 0), 0);

  useEffect(() => {
    if (!start || done) return;
    if (idx >= lines.length) {
      setDone(true);
      return;
    }
    const line = lines[idx];
    if (line.type === 'typed') {
      const total = getFlatLen(line);
      if (typedLen < total) {
        const t = setTimeout(() => setTypedLen((v) => v + 1), 1000 / (line.cps || speed));
        return () => clearTimeout(t);
      } else {
        const t = setTimeout(() => {
          setIdx((v) => v + 1);
          setTypedLen(0);
        }, line.delay ?? 180);
        return () => clearTimeout(t);
      }
    } else {
      const t = setTimeout(() => setIdx((v) => v + 1), line.delay ?? 60);
      return () => clearTimeout(t);
    }
  }, [idx, typedLen, start, done, lines, speed]);

  return {idx, typedLen, done};
}

function renderTypedParts(parts: Part[], maxLen: number) {
  const out: React.ReactNode[] = [];
  let budget = maxLen;
  parts.forEach((p, i) => {
    if (budget <= 0) return;
    const take = Math.min(p.text.length, budget);
    out.push(
      <span key={i} className={p.cls || ''}>
        {p.text.slice(0, take)}
      </span>,
    );
    budget -= take;
  });
  return out;
}

function renderFullParts(parts: Part[]) {
  return parts.map((p, i) => (
    <span key={i} className={p.cls || ''}>
      {p.text}
    </span>
  ));
}

const HERO_LINES: Line[] = [
  {
    type: 'typed',
    parts: [
      {text: '❯ ', cls: 'ag-prompt'},
      {text: 'php artisan ', cls: 'ag-pun'},
      {text: 'rhino:blueprint', cls: 'ag-fn'},
      {text: ' contracts.yaml', cls: 'ag-str'},
    ],
    delay: 220,
  },
  {type: 'output', parts: [{text: '  ✓ ', cls: 'ag-output-ok'}, {text: 'Model', cls: 'ag-pun'}, {text: '      app/Models/Contract.php', cls: 'ag-path'}]},
  {type: 'output', parts: [{text: '  ✓ ', cls: 'ag-output-ok'}, {text: 'Migration', cls: 'ag-pun'}, {text: '  database/migrations/2026_..._contracts.php', cls: 'ag-path'}]},
  {type: 'output', parts: [{text: '  ✓ ', cls: 'ag-output-ok'}, {text: 'Policy', cls: 'ag-pun'}, {text: '     app/Policies/ContractPolicy.php', cls: 'ag-path'}]},
  {type: 'output', parts: [{text: '  ✓ ', cls: 'ag-output-ok'}, {text: 'Factory', cls: 'ag-pun'}, {text: '    database/factories/ContractFactory.php', cls: 'ag-path'}]},
  {type: 'output', parts: [{text: '  ✓ ', cls: 'ag-output-ok'}, {text: 'Tests', cls: 'ag-pun'}, {text: '      tests/Feature/ContractTest.php', cls: 'ag-path'}]},
  {type: 'output', parts: [{text: '  ✓ ', cls: 'ag-output-ok'}, {text: 'Seeder', cls: 'ag-pun'}, {text: '     database/seeders/ContractSeeder.php', cls: 'ag-path'}]},
  {type: 'output', parts: [{text: ''}]},
  {
    type: 'output',
    parts: [
      {text: '  Done. ', cls: 'ag-output-ok'},
      {text: '6 files generated from YAML — ', cls: 'ag-output'},
      {text: 'zero AI tokens used.', cls: 'ag-cm'},
    ],
    delay: 420,
  },
  {type: 'output', parts: [{text: ''}]},
  {
    type: 'typed',
    parts: [
      {text: '❯ ', cls: 'ag-prompt'},
      {text: 'curl ', cls: 'ag-pun'},
      {text: '-X POST ', cls: 'ag-kw'},
      {text: 'https://acme.api.dev/contracts', cls: 'ag-str'},
    ],
    delay: 240,
  },
  {type: 'output', parts: [{text: '  {', cls: 'ag-pun'}]},
  {type: 'output', parts: [{text: '    "id":', cls: 'ag-key'}, {text: ' "ctr_01H…K9"', cls: 'ag-str'}, {text: ',', cls: 'ag-pun'}]},
  {type: 'output', parts: [{text: '    "title":', cls: 'ag-key'}, {text: ' "MSA — Northwind"', cls: 'ag-str'}, {text: ',', cls: 'ag-pun'}]},
  {type: 'output', parts: [{text: '    "total_value":', cls: 'ag-key'}, {text: ' 240000', cls: 'ag-num'}, {text: ',', cls: 'ag-pun'}]},
  {type: 'output', parts: [{text: '    "status":', cls: 'ag-key'}, {text: ' "draft"', cls: 'ag-str'}, {text: ',', cls: 'ag-pun'}]},
  {
    type: 'output',
    parts: [
      {text: '    "_meta":', cls: 'ag-key'},
      {text: ' { ', cls: 'ag-pun'},
      {text: '"policy":', cls: 'ag-key'},
      {text: ' "ContractPolicy"', cls: 'ag-str'},
      {text: ', ', cls: 'ag-pun'},
      {text: '"scope":', cls: 'ag-key'},
      {text: ' "org:acme"', cls: 'ag-str'},
      {text: ' }', cls: 'ag-pun'},
    ],
  },
  {type: 'output', parts: [{text: '  }', cls: 'ag-pun'}]},
];

function HeroTerminal() {
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(false);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setStart(true);
      return;
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setStart(true);
          io.disconnect();
        }
      },
      {threshold: 0.3},
    );
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);

  const {idx, typedLen, done} = useTypewriter(HERO_LINES, {start, speed: 40});

  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [idx, typedLen]);

  return (
    <div ref={ref}>
      <CodeWindow
        title="~/acme  —  zsh"
        glow
        actions={
          <span
            style={{
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
              color: 'var(--ag-fg-dim)',
              fontSize: 11.5,
              fontFamily: 'var(--ag-font-mono)',
            }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 99,
                background: 'var(--ag-accent)',
                boxShadow: '0 0 10px var(--ag-accent-glow)',
              }}
            />
            live
          </span>
        }>
        <div ref={bodyRef} style={{maxHeight: 460, minHeight: 460, overflow: 'auto'}}>
          {HERO_LINES.slice(0, idx + 1).map((line, i) => {
            const isCurrent = i === idx;
            if (line.type === 'typed') {
              return (
                <div key={i} style={{whiteSpace: 'pre'}}>
                  {isCurrent
                    ? renderTypedParts(line.parts, typedLen)
                    : renderFullParts(line.parts)}
                  {isCurrent && !done && <span className="ag-cursor" />}
                </div>
              );
            }
            return (
              <div key={i} style={{whiteSpace: 'pre'}}>
                {renderFullParts(line.parts)}
              </div>
            );
          })}
          {done && (
            <div style={{whiteSpace: 'pre'}}>
              <span className="ag-prompt" />
              <span className="ag-cursor" />
            </div>
          )}
        </div>
      </CodeWindow>
    </div>
  );
}

export function Hero() {
  return (
    <header
      id="top"
      className="ag-section ag-noise"
      style={{paddingTop: 72, paddingBottom: 80, position: 'relative', overflow: 'hidden'}}>
      <div className="ag-grid-bg" />
      <div className="ag-ambient-glow" />
      <div className="ag-wrap" style={{position: 'relative'}}>
        <div
          className="ag-hero-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1fr)',
            gap: 64,
            alignItems: 'center',
          }}>
          <div>
            <Reveal>
              <Eyebrow>Automatic REST APIs — Laravel · Rails · NestJS</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
              <h1 style={{marginTop: 22, marginBottom: 22}}>
                The right way<br />
                AI&nbsp;agents <span className="ag-accent">write code.</span>
              </h1>
            </Reveal>
            <Reveal delay={160}>
              <p
                style={{
                  fontSize: 18,
                  lineHeight: 1.55,
                  color: 'var(--ag-fg-muted)',
                  maxWidth: 560,
                  margin: 0,
                  textWrap: 'pretty' as React.CSSProperties['textWrap'],
                }}>
                Register a model, get a secure API. Permissions, validation, multi-tenancy, and
                audit trails — all built in. AI agents ship better code when the framework, not
                the model, owns the conventions.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div style={{marginTop: 32, maxWidth: 480}}>
                <InstallWidget />
              </div>
            </Reveal>

            <Reveal delay={320}>
              <div style={{marginTop: 24, display: 'flex', gap: 10, flexWrap: 'wrap'}}>
                <Button variant="primary" href="#demo">
                  Get started <Icon.arrow className="ag-arrow" />
                </Button>
                <Button href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <Icon.github /> Star on GitHub
                </Button>
              </div>
            </Reveal>

            <Reveal delay={400}>
              <div
                style={{
                  marginTop: 40,
                  paddingTop: 24,
                  borderTop: '1px dashed var(--ag-line-soft)',
                  display: 'flex',
                  gap: 28,
                  flexWrap: 'wrap',
                  fontFamily: 'var(--ag-font-mono)',
                  fontSize: 12,
                  color: 'var(--ag-fg-dim)',
                }}>
                <span><span className="ag-accent">28</span> built-in features</span>
                <span><span className="ag-accent">0</span> AI tokens for scaffolding</span>
                <span><span className="ag-accent">3</span> frameworks</span>
                <span>MIT licensed</span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={200}>
            <HeroTerminal />
          </Reveal>
        </div>
      </div>
    </header>
  );
}
