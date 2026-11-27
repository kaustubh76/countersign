import { Seal } from "./Seal";

/**
 * Hero illustration: two example skill listings. The popular one has bot-inflated downloads and zero
 * verified use; the quiet one has real, verified use. Clearly labelled as an illustration.
 */
export function HeroArt() {
  return (
    <div className="hero-art" aria-label="Illustration: popularity versus proof of use">
      <div className="glow" style={{ width: 420, height: 420, right: -60, top: -40 }} />
      <div className="listing fake rise" style={{ animationDelay: "0.15s" }}>
        <div className="listing-top">
          <span className="listing-icon">⇄</span>
          <div>
            <div className="listing-name">swap-helper-pro</div>
            <div className="listing-desc">Fastest swaps for your agent</div>
          </div>
          <span className="pill bad">blocked</span>
        </div>
        <div className="listing-metrics">
          <span className="struck">⬇ 4,000+ downloads</span>
          <span className="struck">★ 4.9</span>
        </div>
        <div className="listing-badge">
          <span className="b-left">countersign</span>
          <span className="b-right idle">0 verified · Red-Line: 2 rules failed</span>
        </div>
      </div>

      <div className="listing real rise" style={{ animationDelay: "0.35s" }}>
        <div className="listing-top">
          <span className="listing-icon">◎</span>
          <div>
            <div className="listing-name">dca-planner</div>
            <div className="listing-desc">Weekly buys, capped and declared</div>
          </div>
          <span className="pill ok">verified use</span>
        </div>
        <div className="listing-metrics">
          <span>⬇ 37 downloads</span>
          <span className="muted">no stars</span>
        </div>
        <div className="listing-badge">
          <span className="b-left">countersign</span>
          <span className="b-right ok">9 verified · 0 incidents</span>
        </div>
      </div>

      <div className="hero-seal stamp-in" style={{ animationDelay: "0.9s" }}>
        <Seal size={150} id="hero-seal" />
      </div>
      <p className="art-caption">Illustration · example listings, not live data</p>
    </div>
  );
}
