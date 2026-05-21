import React, {useState, useEffect, useRef, type ReactNode, type CSSProperties} from 'react';

/* ---------- Reveal on scroll ---------- */
export function Reveal({
  children,
  delay = 0,
  as: Tag = 'div',
  className = '',
  style,
}: {
  children: ReactNode;
  delay?: number;
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
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
      {threshold: 0.15},
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Comp = Tag as React.ElementType;
  return (
    <Comp
      ref={ref as React.Ref<HTMLElement>}
      className={`ag-reveal ${inView ? 'ag-in' : ''} ${className}`}
      style={{transitionDelay: `${delay}ms`, ...style}}>
      {children}
    </Comp>
  );
}

/* ---------- Code / terminal window ---------- */
export function CodeWindow({
  title,
  children,
  glow,
  actions,
  className = '',
  style,
}: {
  title?: string;
  children: ReactNode;
  glow?: boolean;
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`ag-win ${glow ? 'ag-win-glow' : ''} ${className}`} style={style}>
      <div className="ag-win-head">
        <span className="ag-win-dots"><i /><i /><i /></span>
        {title && <span className="ag-win-title">{title}</span>}
        {actions && (
          <div style={{marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center'}}>
            {actions}
          </div>
        )}
      </div>
      <div className="ag-win-body">{children}</div>
    </div>
  );
}

/* ---------- Copy button ---------- */
export function CopyButton({text, label = 'Copy'}: {text: string; label?: string}) {
  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <button className={`ag-copy-btn ${copied ? 'ag-copied' : ''}`} onClick={onCopy}>
      {copied ? (
        <>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <path d="M3 8.5l3.5 3.5 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}

/* ---------- Tabs ---------- */
export type Tab = {id: string; label: string};
export function Tabs({
  tabs,
  value,
  onChange,
  size = 'md',
}: {
  tabs: Tab[];
  value: string;
  onChange: (id: string) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="ag-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          className={`ag-tab ${value === t.id ? 'ag-on' : ''}`}
          onClick={() => onChange(t.id)}
          style={size === 'sm' ? {padding: '5px 10px', fontSize: 11.5} : undefined}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Eyebrow ---------- */
export function Eyebrow({children}: {children: ReactNode}) {
  return (
    <span className="ag-eyebrow">
      <span className="ag-dot" />
      {children}
    </span>
  );
}

/* ---------- Button ---------- */
export function Button({
  variant = 'default',
  children,
  href,
  onClick,
  target,
  rel,
}: {
  variant?: 'default' | 'primary';
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  target?: string;
  rel?: string;
}) {
  const cls = `ag-btn ${variant === 'primary' ? 'ag-btn-primary' : ''}`;
  if (href) {
    return (
      <a className={cls} href={href} target={target} rel={rel}>
        {children}
      </a>
    );
  }
  return (
    <button className={cls} onClick={onClick}>
      {children}
    </button>
  );
}

/* ---------- Pill ---------- */
export function Pill({children, accent}: {children: ReactNode; accent?: boolean}) {
  return <span className={`ag-pill ${accent ? 'ag-accent-pill' : ''}`}>{children}</span>;
}

/* ---------- Icons ---------- */
type IconProps = React.SVGProps<SVGSVGElement>;
export const Icon = {
  arrow: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M3.5 8h9M8 3.5l4.5 4.5L8 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  star: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M8 1.2l2.12 4.3 4.74.68-3.43 3.35.81 4.72L8 12l-4.24 2.25.81-4.72L1.14 6.18l4.74-.68L8 1.2z" />
    </svg>
  ),
  github: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  ),
  check: (p: IconProps) => (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M3 8.5l3.5 3.5 7-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  bolt: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M9.5 1L3 9h4l-1 6 6.5-8.5H8.5L9.5 1z" />
    </svg>
  ),
  terminal: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M2 4l3 4-3 4M7 12h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  filter: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M2 3h12l-4.5 5.5V13l-3 1.5v-6L2 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  building: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="3" y="2" width="10" height="12" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 5h1M9 5h1M6 8h1M9 8h1M6 11h1M9 11h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  shield: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <path d="M8 1.5l5.5 2v4.5c0 3.5-2.5 6-5.5 6.5-3-.5-5.5-3-5.5-6.5V3.5L8 1.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
  cpu: (p: IconProps) => (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" {...p}>
      <rect x="4" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 1v3M10 1v3M6 12v3M10 12v3M1 6h3M1 10h3M12 6h3M12 10h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
};
