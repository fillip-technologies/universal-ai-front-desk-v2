// Minimal path-based router. The app has only a handful of top-level screens,
// and the backend's SPA fallback already serves index.html for every non-API
// path, so plain History API navigation is all that's needed.
import React, { useEffect, useState } from 'react';

const NAV_EVENT = 'jansunwayi:navigate';

export function navigate(to: string, { replace = false } = {}) {
  if (to === window.location.pathname + window.location.hash) return;
  if (replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  window.dispatchEvent(new Event(NAV_EVENT));
  // Jump to an in-page anchor (e.g. "/#features") after the new view renders.
  const hash = to.split('#')[1];
  if (hash) requestAnimationFrame(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }));
  else window.scrollTo(0, 0);
}

export function usePathname(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const sync = () => setPath(window.location.pathname);
    window.addEventListener('popstate', sync);
    window.addEventListener(NAV_EVENT, sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener(NAV_EVENT, sync);
    };
  }, []);
  return path;
}

type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  to: string;
  /** Extra classes applied when `to` matches the current path. */
  activeClassName?: string;
};

export function Link({ to, activeClassName, className, onClick, ...props }: LinkProps) {
  const path = usePathname();
  const active = activeClassName && path === to.split('#')[0];
  return (
    <a
      href={to}
      className={[className, active ? activeClassName : ''].filter(Boolean).join(' ')}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        onClick?.(e);
        // Let the browser handle new-tab / modified clicks natively.
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(to);
      }}
      {...props}
    />
  );
}
