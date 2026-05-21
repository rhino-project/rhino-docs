import React, { useState, useRef, useEffect } from 'react';
import {useHistory, useLocation} from '@docusaurus/router';
import { LaravelIcon, RailsIcon, ReactIcon, NestIcon } from './FrameworkIcons';

const DjangoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M11.146 0h3.924v18.166c-2.013.382-3.491.535-5.096.535-4.791 0-7.288-2.166-7.288-6.32 0-4.002 2.65-6.6 6.753-6.6.637 0 1.121.05 1.707.203zm0 9.143a3.894 3.894 0 00-1.325-.204c-1.988 0-3.134 1.223-3.134 3.365 0 2.09 1.096 3.236 3.109 3.236.433 0 .79-.025 1.35-.102V9.142zM21.314 6.06v9.098c0 3.134-.229 4.638-.917 5.937-.637 1.249-1.478 2.039-3.211 2.905l-3.644-1.733c1.733-.815 2.574-1.53 3.109-2.625.561-1.121.739-2.421.739-5.835V6.059h3.924zM17.39.021h3.924v4.026H17.39z" fill="#092E20"/>
  </svg>
);

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 10 10"
    fill="none"
    style={{
      transition: 'transform 0.2s',
      transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    }}
  >
    <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

type Framework = {
  id: string;
  label: string;
  icon: React.FC;
  href?: string;
  comingSoon?: boolean;
};

type FrameworkCategory = {
  label: string;
  items: Framework[];
};

const categories: FrameworkCategory[] = [
  {
    label: 'Server',
    items: [
      { id: 'laravel', label: 'Laravel', icon: LaravelIcon, href: '/server/getting-started' },
      { id: 'rails', label: 'Rails', icon: RailsIcon, href: '/rails/getting-started' },
      { id: 'nestjs', label: 'NestJS', icon: NestIcon, href: '/nestjs/getting-started' },
      { id: 'django', label: 'Django', icon: DjangoIcon, comingSoon: true },
    ],
  },
  {
    label: 'Client',
    items: [
      { id: 'react', label: 'React', icon: ReactIcon, href: '/react/getting-started' },
    ],
  },
];

const allFrameworks = categories.flatMap((c) => c.items);

export default function FrameworkDropdown(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const history = useHistory();
  const location = useLocation();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Determine which framework is "current" based on the URL
  const current = allFrameworks.find((fw) => fw.href && location.pathname.startsWith(fw.href.replace('/getting-started', '')))
    || allFrameworks[0];

  return (
    <div className="framework-dropdown" ref={ref}>
      <button
        className="framework-dropdown__trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <current.icon />
        <span>{current.label}</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="framework-dropdown__menu">
          {categories.map((category, catIdx) => (
            <React.Fragment key={category.label}>
              {catIdx > 0 && <div className="framework-dropdown__divider" />}
              <div className="framework-dropdown__category">{category.label}</div>
              {category.items.map((fw) => (
                <button
                  key={fw.id}
                  className={`framework-dropdown__item ${fw.id === current.id ? 'framework-dropdown__item--active' : ''} ${fw.comingSoon ? 'framework-dropdown__item--disabled' : ''}`}
                  onClick={() => {
                    if (!fw.comingSoon && fw.href) {
                      history.push(fw.href);
                      setOpen(false);
                    }
                  }}
                  disabled={fw.comingSoon}
                >
                  <fw.icon />
                  <span className="framework-dropdown__item-label">{fw.label}</span>
                  {fw.comingSoon && (
                    <span className="framework-dropdown__badge">soon</span>
                  )}
                  {fw.id === current.id && (
                    <svg className="framework-dropdown__check" width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M3 7l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
