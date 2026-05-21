import {useState} from 'react';
import type {ReactNode} from 'react';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import {motion} from 'framer-motion';
import {LaravelIcon, RailsIcon, NestIcon} from '../components/FrameworkIcons';
import AIDownloadModal from '../components/AIDownloadModal';
import './vibe.css';

const GITHUB_URL = 'https://github.com/rhino-project/rhino-laravel';

// ─── Data ──────────────────────────────────────────────────────────────────────

const PROBLEMS = [
  {icon: '\u{1F513}', title: 'No Authentication', desc: 'AI skips login, tokens, and session management. Anyone can access anything.'},
  {icon: '\u{1F6AB}', title: 'No Authorization', desc: 'No role-based access control. Every user sees and does everything.'},
  {icon: '\u{26A0}\u{FE0F}', title: 'No Input Validation', desc: 'APIs accept any data. SQL injection, XSS, mass assignment \u2014 wide open.'},
  {icon: '\u{1F3E2}', title: 'No Multi-Tenancy', desc: 'User A sees User B\'s data. No organization-level isolation.'},
  {icon: '\u{1F47B}', title: 'No Audit Trail', desc: 'No idea who changed what, or when. Good luck debugging production.'},
  {icon: '\u{1F35D}', title: 'Spaghetti Architecture', desc: 'Business logic in controllers, no patterns, impossible to maintain.'},
  {icon: '\u{1F9EA}', title: 'No Tests', desc: 'AI doesn\'t write tests unless you beg. And even then, they barely cover anything.'},
  {icon: '\u{1F525}', title: 'Security Holes', desc: 'Mass assignment, missing CSRF, exposed secrets. Your app is a liability.'},
];

const SOLUTIONS = [
  {problem: 'No auth?', title: 'Built-in Authentication', desc: 'Login, register, password reset, token management. Works out of the box.', tag: 'security'},
  {problem: 'No permissions?', title: 'Role-Based Policies', desc: 'Fine-grained, convention-based authorization. Define who can do what per resource.', tag: 'access-control'},
  {problem: 'No validation?', title: 'Smart Validation', desc: 'Per-role validation rules for store and update. Type-safe, auto-enforced.', tag: 'data-integrity'},
  {problem: 'Data leaking?', title: 'Multi-Tenancy Built In', desc: 'Organization-scoped data isolation via subdomain or route prefix. Zero config.', tag: 'saas-ready'},
  {problem: 'No audit trail?', title: 'Automatic Audit Logs', desc: 'Who changed what, when. Full history on every model, out of the box.', tag: 'compliance'},
  {problem: 'Messy code?', title: 'Blueprint Generator', desc: 'Define permissions in YAML, generate policies, tests, and seeders. Deterministic, zero AI tokens.', tag: 'architecture'},
  {problem: 'Too much code?', title: 'Zero Boilerplate', desc: 'Register a model, get a full REST API. No controllers, no routes, no manual setup.', tag: 'zero-code'},
  {problem: 'Not production-ready?', title: 'Battle-Tested Patterns', desc: 'Built by senior devs who\'ve shipped production SaaS. Framework conventions, not AI guesses.', tag: 'production'},
];

const WITHOUT = [
  'No login or token management',
  'Every user can access every endpoint',
  'APIs accept any data without validation',
  'All users see all data, no isolation',
  'No record of who changed what',
  'AI-generated spaghetti code everywhere',
  'Zero test coverage',
  'Exposed to common security attacks',
];

const WITH = [
  'Auth with login, register, password reset',
  'Role-based policies per resource and action',
  'Smart validation with per-role field rules',
  'Multi-tenant data isolation per organization',
  'Full audit trail on every model change',
  'Convention-based architecture, clean patterns',
  'Blueprint generates tests from YAML',
  'Built-in security following framework best practices',
];

type ServerFramework = 'laravel' | 'rails' | 'nestjs';

const INSTALL_COMMANDS: Record<ServerFramework, string> = {
  laravel: 'composer require rhino-project/rhino-laravel:^4.0',
  rails: 'bundle add rhino-rails -v "~> 4.0"',
  nestjs: 'npm install @rhino-dev/rhino-nestjs@^4.0',
};

const FW_TABS: {id: ServerFramework; label: string; icon: React.FC}[] = [
  {id: 'laravel', label: 'Laravel', icon: LaravelIcon},
  {id: 'rails', label: 'Rails', icon: RailsIcon},
  {id: 'nestjs', label: 'NestJS', icon: NestIcon},
];

// ─── Components ────────────────────────────────────────────────────────────────

function FadeIn({children, delay = 0, className}: {children: ReactNode; delay?: number; className?: string}) {
  return (
    <motion.div
      initial={{opacity: 0, y: 30}}
      whileInView={{opacity: 1, y: 0}}
      viewport={{once: true, margin: '-80px'}}
      transition={{duration: 0.6, delay, ease: [0.22, 1, 0.36, 1]}}
      className={className}>
      {children}
    </motion.div>
  );
}

function CopyButton({text}: {text: string}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button className="vb-copy-btn" onClick={handleCopy}>
      {copied ? 'copied!' : 'copy'}
    </button>
  );
}

// ─── Deep Dive Carousel ────────────────────────────────────────────────────────

type DeepCategory = 'security' | 'authorization' | 'architecture';

const DEEP_CATEGORIES: {id: DeepCategory; label: string}[] = [
  {id: 'security', label: 'Security Holes'},
  {id: 'authorization', label: 'No Authorization'},
  {id: 'architecture', label: 'Spaghetti Code'},
];

interface DeepSlide {
  category: DeepCategory;
  title: string;
  desc: string;
  bad?: {label: string; code: string};
  good?: {label: string; code: string};
}

const DEEP_SLIDES: DeepSlide[] = [
  {
    category: 'security',
    title: 'Mass Assignment',
    desc: 'AI creates models with no field protection. Any user can send is_admin: true and escalate their own privileges. The #1 vulnerability in Laravel apps.',
    bad: {label: 'What AI generates', code: `// No protection — any field can be changed
public function update(Request $request, User $user)
{
    $user->update($request->all());
    // role, is_admin, email_verified... all exposed
}`},
    good: {label: 'What Rhino does', code: `// Only permitted fields accepted, per role
// Admin: name, email, role
// Editor: name, email
// Viewer: nothing
// Enforced by policy. Zero controller code.`},
  },
  {
    category: 'security',
    title: 'SQL Injection via Raw Queries',
    desc: 'AI falls back to raw SQL with string concatenation for complex queries. Rhino\'s query builder uses safe, parameterized scopes — no raw SQL ever.',
  },
  {
    category: 'security',
    title: 'Secrets in Source Code',
    desc: 'AI hardcodes API keys and JWT secrets directly in config files. Committed to git. Rhino follows framework conventions: all secrets from env vars, never from code.',
  },
  {
    category: 'security',
    title: 'No Rate Limiting',
    desc: 'AI never adds rate limiting. Your login can be brute-forced at 10,000 req/sec. Rhino\'s auth follows framework throttling conventions out of the box.',
  },
  {
    category: 'authorization',
    title: 'IDOR — Insecure Direct Object Reference',
    desc: 'AI returns any record by ID regardless of who\'s asking. User A sees User B\'s invoices. The most common API vulnerability in OWASP Top 10.',
    bad: {label: 'What AI generates', code: `// Anyone can see any invoice
public function show($id)
{
    return Invoice::findOrFail($id);
    // No ownership check. No org scoping.
}`},
    good: {label: 'What Rhino does', code: `// Automatic org scoping + policy check
// GET /api/{org_slug}/invoices/42
// 1. Scopes ALL queries to current org
// 2. Checks policy: can this user view?
// 3. Hides fields by role
// 4. Returns 403 if unauthorized`},
  },
  {
    category: 'authorization',
    title: 'No Role Differentiation',
    desc: 'AI gives every user the same permissions. An intern can delete production data. Rhino lets you define viewer, editor, admin — per resource, per action.',
  },
  {
    category: 'authorization',
    title: 'Column-Level Data Leaking',
    desc: 'Even with "can view" checks, AI returns every column. Viewers see total_value, profit_margin, internal_notes. Rhino\'s HidableColumns filters fields by role automatically.',
  },
  {
    category: 'authorization',
    title: 'No Multi-Tenant Isolation',
    desc: 'AI has no concept of organizations. In B2B SaaS, Company A sees Company B\'s data. Rhino scopes every query to the current org through middleware.',
  },
  {
    category: 'architecture',
    title: '500-Line Controllers',
    desc: 'AI puts validation, auth, queries, formatting, and error handling all in one controller. One file does everything.',
    bad: {label: 'What AI generates', code: `class InvoiceController extends Controller
{
    public function index(Request $request)
    {
        // 20 lines auth + 30 lines queries
        // 15 lines permissions + 10 lines formatting
        // ...repeated for show, store, update, delete
    }
    // Total: 500+ lines
}`},
    good: {label: 'What Rhino does', code: `// config/rhino.php
return [
    'models' => [
        'invoices' => Invoice::class,
    ],
];
// That's it. Zero controllers needed.`},
  },
  {
    category: 'architecture',
    title: 'Copy-Paste Everywhere',
    desc: 'AI copies patterns across 15 controllers with slight variations. Change one validation rule? Update all 15 files. Rhino: define rules once on the model.',
  },
  {
    category: 'architecture',
    title: 'No Separation of Concerns',
    desc: 'AI doesn\'t create policies, form requests, or scopes. Everything lives in the controller. Rhino enforces clean architecture through conventions.',
  },
  {
    category: 'architecture',
    title: 'Inconsistent API Responses',
    desc: 'One endpoint returns {"user": {...}}, another {"data": {...}}, a third returns raw model. Rhino standardizes every response: data wrapping, pagination, errors.',
  },
  {
    category: 'architecture',
    title: 'No Blueprint for the Future',
    desc: 'AI has no concept of your permission matrix or how your app evolves. Rhino\'s Blueprint: define structure in YAML, generate policies, tests, and seeders deterministically.',
  },
];

function DeepDiveCarousel() {
  const [category, setCategory] = useState<DeepCategory>('security');
  const [slideIdx, setSlideIdx] = useState(0);

  const slides = DEEP_SLIDES.filter((s) => s.category === category);
  const slide = slides[slideIdx] || slides[0];

  const changeCategory = (cat: DeepCategory) => {
    setCategory(cat);
    setSlideIdx(0);
  };

  const prev = () => setSlideIdx((i) => (i > 0 ? i - 1 : slides.length - 1));
  const next = () => setSlideIdx((i) => (i < slides.length - 1 ? i + 1 : 0));

  return (
    <section className="vb-carousel-section">
      <FadeIn>
        <div className="vb-section-header">
          <span className="vb-section-badge vb-section-badge--red">DEEP DIVE</span>
          <h2>What's really wrong with AI-generated code</h2>
          <p>Click through real examples of what AI gets wrong — and how Rhino fixes it.</p>
        </div>
      </FadeIn>

      <FadeIn delay={0.1}>
        <div className="vb-carousel">
          <div className="vb-carousel-tabs">
            {DEEP_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className={`vb-carousel-tab ${category === cat.id ? 'vb-carousel-tab--active' : ''}`}
                onClick={() => changeCategory(cat.id)}>
                {cat.label}
              </button>
            ))}
          </div>

          <div className="vb-carousel-card">
            <div className="vb-carousel-card-header">
              <span className="vb-carousel-counter">{slideIdx + 1} / {slides.length}</span>
              <h3>{slide.title}</h3>
            </div>

            <p className="vb-carousel-desc">{slide.desc}</p>

            {slide.bad && (
              <div className="vb-deep-code">
                <div className="vb-deep-code-bar">
                  <span className="vb-deep-code-dot vb-deep-code-dot--bad" />
                  <span className="vb-deep-code-label">{slide.bad.label}</span>
                </div>
                <pre className="vb-deep-pre">{slide.bad.code}</pre>
              </div>
            )}

            {slide.good && (
              <div className="vb-deep-code">
                <div className="vb-deep-code-bar">
                  <span className="vb-deep-code-dot vb-deep-code-dot--good" />
                  <span className="vb-deep-code-label">{slide.good.label}</span>
                </div>
                <pre className="vb-deep-pre">{slide.good.code}</pre>
              </div>
            )}

            <div className="vb-carousel-nav">
              <button className="vb-carousel-btn" onClick={prev}>{'\u2190'} Prev</button>
              <div className="vb-carousel-dots">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    className={`vb-carousel-dot ${i === slideIdx ? 'vb-carousel-dot--active' : ''}`}
                    onClick={() => setSlideIdx(i)} />
                ))}
              </div>
              <button className="vb-carousel-btn" onClick={next}>Next {'\u2192'}</button>
            </div>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function VibePage(): ReactNode {
  const [installFw, setInstallFw] = useState<ServerFramework>('laravel');
  const [getAgentOpen, setGetAgentOpen] = useState(false);

  return (
    <Layout
      title="Stop Vibe Coding Blind"
      description="Rhino makes AI-generated code production-ready. Built-in auth, permissions, validation, multi-tenancy, and audit trails. For Laravel, Rails, and NestJS.">
      <div className="vb">

        {/* ═══════════ HERO ═══════════ */}
        <section className="vb-hero">
          <div className="vb-hero-grid" />
          <div className="vb-hero-glow" />

          <div className="vb-hero-inner">
            <motion.div
              className="vb-badge"
              initial={{opacity: 0, scale: 0.9}}
              animate={{opacity: 1, scale: 1}}
              transition={{duration: 0.5, delay: 0.1}}>
              FOR VIBE CODERS
            </motion.div>

            <motion.h1
              className="vb-hero-headline"
              initial={{opacity: 0, y: 20}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: 0.6, delay: 0.2}}>
              The right way{' '}
              <span className="vb-hero-accent">AI agents write code.</span>
            </motion.h1>

            <motion.p
              className="vb-hero-sub"
              initial={{opacity: 0, y: 20}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: 0.6, delay: 0.35}}>
              Your AI writes code fast. But it skips authentication, ignores permissions, forgets validation, and never writes tests. Rhino fixes all of that with one package.
            </motion.p>

            <motion.div
              className="vb-hero-buttons"
              initial={{opacity: 0, y: 20}}
              animate={{opacity: 1, y: 0}}
              transition={{duration: 0.6, delay: 0.5}}>
              <button
                type="button"
                className="vb-btn-primary"
                onClick={() => setGetAgentOpen(true)}>
                Get Rhino
              </button>
              <Link className="vb-btn-primary" to="/server/getting-started">
                Read the Docs
              </Link>
              <Link className="vb-btn-secondary" href={GITHUB_URL}>
                View on GitHub
              </Link>
            </motion.div>
            {getAgentOpen && <AIDownloadModal onClose={() => setGetAgentOpen(false)} />}
          </div>
        </section>

        {/* ═══════════ PROBLEMS ═══════════ */}
        <section className="vb-problems-section">
          <FadeIn>
            <div className="vb-section-header">
              <span className="vb-section-badge vb-section-badge--red">THE PROBLEM</span>
              <h2>What vibe coding actually produces</h2>
              <p>AI is fast. But fast doesn't mean correct. Here's what your AI-generated backend is missing.</p>
            </div>
          </FadeIn>

          <div className="vb-problems-grid">
            {PROBLEMS.map((p, i) => (
              <FadeIn key={p.title} delay={i * 0.05}>
                <div className="vb-problem-card">
                  <span className="vb-problem-icon">{p.icon}</span>
                  <h3>{p.title}</h3>
                  <p>{p.desc}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ═══════════ SOLUTIONS ═══════════ */}
        <section className="vb-solutions-section">
          <FadeIn>
            <div className="vb-section-header">
              <span className="vb-section-badge">THE FIX</span>
              <h2>Rhino was built for this</h2>
              <p>Every problem above has a solution. Built by senior developers, not generated by AI.</p>
            </div>
          </FadeIn>

          <div className="vb-solutions-grid">
            {SOLUTIONS.map((s, i) => (
              <FadeIn key={s.title} delay={i * 0.05}>
                <div className="vb-solution-card">
                  <div className="vb-solution-problem">{s.problem}</div>
                  <h3>{s.title}</h3>
                  <p>{s.desc}</p>
                  <span className="vb-solution-tag">{s.tag}</span>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ═══════════ DEEP DIVE CAROUSEL ═══════════ */}
        <DeepDiveCarousel />

        {/* ═══════════ COMPARISON ═══════════ */}
        <section className="vb-compare-section">
          <FadeIn>
            <div className="vb-section-header">
              <span className="vb-section-badge">THE DIFFERENCE</span>
              <h2>Before and after</h2>
            </div>
          </FadeIn>

          <FadeIn delay={0.1}>
            <div className="vb-compare-grid">
              <div className="vb-compare-col">
                <div className="vb-compare-header vb-compare-header--bad">Without Rhino</div>
                <ul className="vb-compare-list">
                  {WITHOUT.map((item) => (
                    <li key={item} className="vb-compare-item">
                      <span className="vb-compare-icon vb-compare-icon--bad">{'\u2717'}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="vb-compare-col">
                <div className="vb-compare-header vb-compare-header--good">With Rhino</div>
                <ul className="vb-compare-list">
                  {WITH.map((item) => (
                    <li key={item} className="vb-compare-item">
                      <span className="vb-compare-icon vb-compare-icon--good">{'\u2713'}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </FadeIn>
        </section>

        {/* ═══════════ CTA ═══════════ */}
        <section className="vb-cta-section">
          <FadeIn>
            <h2>Start building the right way</h2>
            <p>One package. Production-ready APIs. All the features your AI forgot to add.</p>

            <div className="vb-cta-install">
              <div className="vb-install-tabs-mini">
                {FW_TABS.map((t) => (
                  <button
                    key={t.id}
                    className={`vb-install-tab-mini ${installFw === t.id ? 'vb-install-tab-mini--active' : ''}`}
                    onClick={() => setInstallFw(t.id)}>
                    <t.icon /> {t.label}
                  </button>
                ))}
              </div>
              <div className="vb-install-bar">
                <span className="vb-dollar">$</span>
                <code>{INSTALL_COMMANDS[installFw]}</code>
                <CopyButton text={INSTALL_COMMANDS[installFw]} />
              </div>
            </div>

            <div className="vb-cta-buttons">
              <Link className="vb-btn-primary" to="/server/getting-started">
                Read the Docs
              </Link>
              <Link className="vb-btn-secondary" href={GITHUB_URL}>
                View on GitHub
              </Link>
            </div>
          </FadeIn>
        </section>

      </div>
    </Layout>
  );
}
