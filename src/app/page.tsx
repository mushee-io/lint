import Link from "next/link";
import { Activity, ArrowUpRight, Braces, GitBranch, ScanLine, ShieldCheck } from "lucide-react";
import { MarketLintFooter, MarketLintNav, MotionField, SectionTag } from "@/components/market-lint-brand";

const systems = [
  { icon: ShieldCheck, name: "Guard", eyebrow: "PRE-LISTING", copy: "Score market construction before it goes live. Catch ambiguity, weak resolution criteria, duplicate risk and missing sources." },
  { icon: Activity, name: "Watch", eyebrow: "LIVE SURVEILLANCE", copy: "Track probability, liquidity, volume, source freshness and market-risk signals after listing." },
  { icon: GitBranch, name: "Event Graph", eyebrow: "CANONICAL EVENTS", copy: "Group markets that refer to the same underlying event and preserve relationships across protocols." },
  { icon: Braces, name: "Consensus", eyebrow: "CROSS-PROTOCOL", copy: "Compare independent venues only when enough real data exists to make the comparison meaningful." },
];

export default function Home() {
  return (
    <main className="ml-page">
      <MarketLintNav />

      <section className="ml-shell ml-grid-bg grid min-h-[760px] lg:grid-cols-[1.02fr_.98fr]">
        <div className="flex flex-col justify-between border-b border-[var(--ml-line)] p-6 sm:p-10 lg:border-b-0 lg:border-r lg:p-14 xl:p-16">
          <div>
            <SectionTag>Live prediction-market intelligence</SectionTag>
            <h1 className="ml-display mt-12 max-w-[780px] text-[clamp(4rem,7vw,8.5rem)]">
              The intelligence layer for prediction markets.
            </h1>
            <p className="ml-copy mt-8 max-w-2xl text-lg md:text-xl">
              Market Lint inspects how markets are written, resolved and behaving — before listing and while live.
            </p>
          </div>

          <div className="mt-12 flex flex-wrap items-center gap-3">
            <Link href="/explore" className="ml-button-primary">Explore live markets <ArrowUpRight className="size-4" /></Link>
            <Link href="/connect" className="ml-button-secondary">Connect your platform <ArrowUpRight className="size-4" /></Link>
          </div>
        </div>
        <MotionField />
      </section>

      <section className="ml-shell grid border-b border-[var(--ml-line)] bg-white lg:grid-cols-[1.2fr_repeat(4,.7fr)]">
        <div className="flex min-h-24 items-center border-b border-[var(--ml-line)] px-6 lg:border-b-0 lg:border-r lg:px-8">
          <span className="ml-eyebrow">LIVE PUBLIC INPUTS</span>
        </div>
        {["POLYMARKET", "MANIFOLD", "KALSHI", "PARTNER FEEDS"].map((name, index) => (
          <div key={name} className="flex min-h-24 items-center justify-between border-b border-[var(--ml-line)] px-6 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
            <span className="text-sm font-medium tracking-[-.02em]">{name}</span>
            <span className={index < 3 ? "ml-status-live ml-mono text-[10px]" : "ml-mono text-[10px] text-slate-400"}>{index < 3 ? "LIVE" : "READY"}</span>
          </div>
        ))}
      </section>

      <section className="ml-shell ml-blue-panel relative overflow-hidden border-b border-[var(--ml-line)]">
        <div className="absolute inset-0 opacity-20 ml-grid-bg" />
        <div className="relative grid min-h-[760px] lg:grid-cols-[.9fr_1.1fr]">
          <div className="flex flex-col justify-between border-b border-white/30 p-7 sm:p-10 lg:border-b-0 lg:border-r lg:p-14 xl:p-16">
            <div>
              <span className="inline-flex border border-white/50 bg-white/10 px-3 py-2 font-mono text-[10px] tracking-[.16em]">SYSTEM / 01</span>
              <h2 className="mt-10 max-w-xl text-5xl font-medium leading-[.94] tracking-[-.065em] sm:text-7xl">See risk before the market goes live.</h2>
              <p className="mt-7 max-w-lg text-lg leading-8 text-white/80">Guard turns raw market wording into a decision-ready quality check without pretending uncertainty is certainty.</p>
            </div>
            <Link href="/analyze" className="mt-12 inline-flex w-fit items-center gap-2 border border-white/70 bg-white px-5 py-3 font-mono text-[11px] font-semibold tracking-[.08em] text-[var(--ml-ink)]">TRY GUARD <ArrowUpRight className="size-4" /></Link>
          </div>

          <div className="grid content-center gap-5 p-6 sm:p-10 lg:p-14">
            <div className="ml-cut-card bg-white/95 p-6 text-[var(--ml-ink)] sm:p-8">
              <div className="flex items-start justify-between gap-8">
                <div>
                  <span className="ml-eyebrow">EXAMPLE VERDICT</span>
                  <h3 className="mt-4 text-3xl tracking-[-.045em]">Will BTC close above $150k on Dec 31, 2026?</h3>
                </div>
                <div className="text-right">
                  <div className="text-5xl font-medium tracking-[-.07em]">74</div>
                  <span className="ml-mono text-[9px] text-slate-500">QUALITY / 100</span>
                </div>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                <div className="border border-[var(--ml-line)] bg-[var(--ml-pale)] p-4"><span className="ml-eyebrow">DECISION</span><strong className="mt-3 block text-xl">REVIEW</strong></div>
                <div className="border border-[var(--ml-line)] p-4"><span className="ml-eyebrow">SOURCE</span><strong className="mt-3 block text-xl">MISSING</strong></div>
                <div className="border border-[var(--ml-line)] p-4"><span className="ml-eyebrow">OUTCOMES</span><strong className="mt-3 block text-xl">CLEAR</strong></div>
              </div>
              <p className="ml-copy mt-6 text-sm">Price source is not specified. Add an authoritative BTC-USD source and exact settlement timestamp before listing.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="ml-cut-card bg-white/15 p-6 text-white backdrop-blur"><ScanLine className="size-5" /><p className="mt-8 text-2xl tracking-[-.045em]">Deterministic scoring with visible reasons.</p></div>
              <div className="ml-cut-card bg-white/15 p-6 text-white backdrop-blur"><Activity className="size-5" /><p className="mt-8 text-2xl tracking-[-.045em]">No synthetic fallback when data is unavailable.</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="ml-shell ml-grid-bg bg-[var(--ml-ice)] px-6 py-24 sm:px-10 lg:px-14 xl:px-16">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-end">
          <div>
            <SectionTag>One intelligence stack</SectionTag>
            <h2 className="ml-display mt-8 max-w-xl text-5xl sm:text-7xl">Quality, monitoring and context in one layer.</h2>
          </div>
          <p className="ml-copy max-w-2xl text-lg">Market Lint is not another venue. It sits behind operators and gives every market a clearer path from creation to resolution.</p>
        </div>

        <div className="mt-14 grid gap-px border border-[var(--ml-line)] bg-[var(--ml-line)] md:grid-cols-2">
          {systems.map(({ icon: Icon, name, eyebrow, copy }, index) => (
            <article key={name} className="group min-h-[330px] bg-white p-7 transition hover:bg-[#eff8ff] sm:p-9">
              <div className="flex items-start justify-between gap-6">
                <span className="grid size-14 place-items-center border border-[var(--ml-line)] bg-[var(--ml-pale)]"><Icon className="size-5 text-[var(--ml-cobalt)]" /></span>
                <span className="ml-mono text-[10px] text-slate-400">0{index + 1}</span>
              </div>
              <p className="ml-eyebrow mt-14">{eyebrow}</p>
              <h3 className="mt-3 text-4xl tracking-[-.055em]">{name}</h3>
              <p className="ml-copy mt-4 max-w-md">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ml-shell grid border-t border-[var(--ml-line)] bg-white md:grid-cols-3">
        {[
          ["03", "PUBLIC SOURCES", "Polymarket, Manifold and Kalshi feed the live public network."],
          ["07", "INTELLIGENCE DIMENSIONS", "Construction, resolution, provenance, activity and operational quality signals."],
          ["00", "CUSTODY ACCESS", "Market Lint needs market metadata, not wallet keys or trading permissions."],
        ].map(([value, title, copy]) => (
          <div key={title} className="min-h-[290px] border-b border-[var(--ml-line)] p-8 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
            <div className="text-7xl font-medium tracking-[-.08em] text-[var(--ml-cobalt)]">{value}</div>
            <p className="ml-eyebrow mt-8">{title}</p>
            <p className="ml-copy mt-4 max-w-sm">{copy}</p>
          </div>
        ))}
      </section>

      <section className="ml-shell ml-grid-bg border-t border-[var(--ml-line)] bg-[var(--ml-pale)] px-6 py-24 text-center sm:px-10">
        <SectionTag>Connect to Market Lint</SectionTag>
        <h2 className="ml-display mx-auto mt-8 max-w-5xl text-6xl sm:text-8xl">Bring your market feed. Keep your trading stack.</h2>
        <p className="ml-copy mx-auto mt-7 max-w-2xl text-lg">Validate one market publicly, then move into a read-only partner pilot when you are ready.</p>
        <div className="mt-9 flex justify-center"><Link href="/connect" className="ml-button-primary">Connect your platform <ArrowUpRight className="size-4" /></Link></div>
      </section>

      <MarketLintFooter />
    </main>
  );
}
