import Link from "next/link";
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
  return (
    <nav className="ml-nav">
      <div className="ml-nav-inner">
        <MarketLintMark />
        <div className="ml-nav-links">
          <Link href="/explore">EXPLORE</Link>
          <Link href="/analyze">ANALYZE</Link>
          <Link href="/developers">DEVELOPERS</Link>
        </div>
        <Link href="/connect" className="ml-nav-cta">
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
        <div className="ml-prism ml-prism-cobalt"><span /><span /><span /></div>
      </div>
      <div className="ml-float ml-float-b">
        <div className="ml-orb"><div className="ml-orb-core" /></div>
      </div>
      <div className="ml-float ml-float-c">
        <div className="ml-ring"><span /></div>
      </div>
      <div className="ml-float ml-float-d">
        <div className="ml-prism ml-prism-sky"><span /><span /><span /></div>
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
