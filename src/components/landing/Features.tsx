import React from 'react';
import {Reveal, Eyebrow, Button, Pill, Icon} from './Primitives';

type Feature = {
  cmd: string;
  title: string;
  desc: string;
  tag: string;
  Icon: React.FC<React.SVGProps<SVGSVGElement>>;
};

const FEATURES: Feature[] = [
  {
    cmd: 'rhino init',
    title: 'AI-Native Architecture',
    desc:
      'Declarative, config-driven models that AI agents can read, scaffold, and extend. Built to be prompted, not hand-coded.',
    tag: 'ai-ready',
    Icon: Icon.cpu,
  },
  {
    cmd: 'rhino:blueprint',
    title: 'Blueprint Generator',
    desc:
      'Define your permission matrix in YAML, generate fully working policies, tests, and seeders — zero AI tokens, fully deterministic.',
    tag: 'zero-token',
    Icon: Icon.bolt,
  },
  {
    cmd: 'resource :posts',
    title: 'Automatic CRUD',
    desc:
      'Register a model, get full REST endpoints instantly. Index, show, store, update, destroy — plus soft-delete, restore, force-delete.',
    tag: 'zero-boilerplate',
    Icon: Icon.terminal,
  },
  {
    cmd: 'POST /login',
    title: 'Auth, Policies & RBAC',
    desc:
      'Token-based auth, role-based access control, and a ResourcePolicy base with attribute-level permissions. Per org, per role.',
    tag: 'security',
    Icon: Icon.shield,
  },
  {
    cmd: '?filter[x]=y&sort=-created',
    title: 'Advanced Querying',
    desc:
      'Filtering, sorting, full-text search, pagination, sparse fieldsets, and eager-loading — all via query string. No controller work.',
    tag: 'spatie-powered',
    Icon: Icon.filter,
  },
  {
    cmd: 'org:acme',
    title: 'Multi-Tenancy',
    desc:
      'Organization-based data isolation with BelongsToOrganization. Cross-tenant FKs are auto-scoped. Subdomain or route-prefix.',
    tag: 'saas-ready',
    Icon: Icon.building,
  },
];

function FeatureCard({f, i}: {f: Feature; i: number}) {
  return (
    <Reveal delay={i * 60}>
      <div className="ag-feature-card">
        <div
          style={{
            fontFamily: 'var(--ag-font-mono)',
            fontSize: 12,
            color: 'var(--ag-fg-dim)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
          <span style={{color: 'var(--ag-accent)'}}>❯</span>
          <span>{f.cmd}</span>
        </div>

        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            border: '1px solid var(--ag-line-bright)',
            background: 'var(--ag-bg-term)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--ag-accent)',
          }}>
          <f.Icon />
        </div>

        <div>
          <h3 style={{fontSize: 17, marginBottom: 6, fontWeight: 550}}>{f.title}</h3>
          <p
            style={{
              margin: 0,
              color: 'var(--ag-fg-muted)',
              fontSize: 14,
              lineHeight: 1.55,
              textWrap: 'pretty' as React.CSSProperties['textWrap'],
            }}>
            {f.desc}
          </p>
        </div>

        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
          <Pill accent>{f.tag}</Pill>
          <span
            style={{
              color: 'var(--ag-fg-faint)',
              fontFamily: 'var(--ag-font-mono)',
              fontSize: 11,
            }}>
            {String(i + 1).padStart(2, '0')} / {String(FEATURES.length).padStart(2, '0')}
          </span>
        </div>
      </div>
    </Reveal>
  );
}

export function Features() {
  return (
    <section className="ag-section" id="features" style={{position: 'relative'}}>
      <div className="ag-wrap">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'end',
            marginBottom: 48,
            gap: 40,
            flexWrap: 'wrap',
          }}>
          <div>
            <Reveal>
              <Eyebrow>Built-In</Eyebrow>
            </Reveal>
            <Reveal delay={80}>
              <h2 style={{marginTop: 20, maxWidth: 640}}>
                Everything you need,<br />
                <span className="ag-accent">out of the box.</span>
              </h2>
            </Reveal>
          </div>
          <Reveal delay={160}>
            <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
              <span style={{color: 'var(--ag-fg-muted)', fontSize: 14}}>+22 more</span>
              <Button href="/intro">
                <span>All 28 features</span>
                <Icon.arrow className="ag-arrow" />
              </Button>
            </div>
          </Reveal>
        </div>

        <div
          className="ag-features-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 16,
          }}>
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} f={f} i={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
