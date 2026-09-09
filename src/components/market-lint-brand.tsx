"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ScanLine } from "lucide-react";

export function MarketLintMark() {
  return (
    <Link href="/" className="ml-brand-mark" aria-label="Market Lint home">
      <span className="ml-brand-icon"><ScanLine className="size-4" /></span>
      <span>MARKET LINT</span>
    </Link>
  );
}

export function MarketLintNav() {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="ml-nav">
      <div className="ml-nav-inner">
        <MarketLintMark />
        <div className="ml-nav-links">
          <Link href="/explore" className={active("/explore") ? "is-active" : undefined} aria-current={active("/explore") ? "page" : undefined}>EXPLORE</Link>
          <Link href="/analyze" className={active("/analyze") ? "is-active" : undefined} aria-current={active("/analyze") ? "page" : undefined}>ANALYZE</Link>
          <Link href="/developers" className={active("/developers") ? "is-active" : undefined} aria-current={active("/developers") ? "page" : undefined}>DEVELOPERS</Link>
        </div>
        <Link href="/connect" className={`ml-nav-cta ${active("/connect") ? "is-active" : ""}`} aria-current={active("/connect") ? "page" : undefined}>
          CONNECT PLATFORM <ArrowUpRight className="size-4" />
        </Link>
      </div>
    </nav>
  );
}

export function MarketLintFooter() {
  return (
    <footer className="ml-footer ml-grid-bg">
      <div className="ml-footer-top">
        <MarketLintMark />
        <p>Prediction-market quality, risk and resolution intelligence.</p>
      </div>
      <div className="ml-footer-grid">
        <div>
          <span>PRODUCT</span>
          <Link href="/explore">Live markets</Link>
          <Link href="/analyze">Analyze</Link>
          <Link href="/connect">Connect platform</Link>
        </div>
        <div>
          <span>INFRASTRUCTURE</span>
          <Link href="/developers">Developer API</Link>
          <Link href="/openapi.json">OpenAPI</Link>
          <Link href="/ready">Readiness</Link>
        </div>
        <div>
          <span>LIVE SOURCES</span>
          <p>Polymarket</p>
          <p>Manifold</p>
          <p>Kalshi</p>
        </div>
        <div>
          <span>SYSTEM</span>
          <p>Guard</p>
          <p>Watch</p>
          <p>Event Graph + Consensus</p>
        </div>
      </div>
      <div className="ml-footer-bottom">MARKET LINT / INTELLIGENCE LAYER / 2026</div>
    </footer>
  );
}

export function MotionField({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`ml-motion-field ${compact ? "ml-motion-field--compact" : ""}`} aria-hidden="true">
      <div className="ml-motion-grid" />
      <div className="ml-glow ml-glow-a" />
      <div className="ml-glow ml-glow-b" />

      <div className="ml-float ml-float-a">
        <div className="ml-geo ml-bevel-frame"><span /><span /><span /></div>
      </div>
      <div className="ml-float ml-float-b">
        <div className="ml-geo ml-torus-pro"><span /></div>
      </div>
      <div className="ml-float ml-float-c">
        <div className="ml-geo ml-voxel-cluster"><span /><span /><span /><span /><span /></div>
      </div>
      <div className="ml-float ml-float-d">
        <div className="ml-geo ml-layered-prism"><span /><span /><span /></div>
      </div>

      <div className="ml-signal-window">
        <div className="ml-signal-window-head"><span className="ml-live-dot" /> LIVE SIGNAL</div>
        <div className="ml-signal-number">87</div>
        <div className="ml-signal-copy">RESOLUTION READINESS</div>
        <div className="ml-signal-bars"><span /><span /><span /><span /><span /></div>
      </div>
    </div>
  );
}

export function SectionTag({ children }: { children: React.ReactNode }) {
  return <span className="ml-section-tag">{children}</span>;
}
