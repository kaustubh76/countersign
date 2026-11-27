import type { Metadata } from "next";
import Link from "next/link";
import { RULESET } from "@/lib/site";
import { Builder } from "./Builder";
import { Playground } from "./Playground";

export const metadata: Metadata = {
  title: "Try to fake it",
  description: "Play the attacker: 11 ways to fake a trust signal, run against COUNTERSIGN's real verifier in your browser. None of them count.",
};

export default function TryPage() {
  return (
    <div className="page-try">
      <section className="wrap try-head">
        <div className="eyebrow">Play the attacker</div>
        <h1 className="page">
          Try to fake <em>proof of use.</em>
        </h1>
        <p className="lead">
          You want <strong>dca-planner</strong>&apos;s badge to go up without anyone really using it. Pick an attack. This page
          runs COUNTERSIGN&apos;s real verifier, <code>{RULESET}</code> (the same code the CLI and this site&apos;s API use), in
          your browser against a simulated BNB Smart Chain, and shows exactly which rule stops you.
        </p>
        <div className="row tight">
          <span className="pill">simulated chain</span>
          <span className="pill ok">real verifier code</span>
          <span className="pill">nothing leaves your browser</span>
          <span className="pill">fictional wallets &amp; skill</span>
        </div>
      </section>

      <Playground />

      <section className="block">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Build your own</div>
            <h2>
              Craft a countersign, <em>rule by rule.</em>
            </h2>
            <p>
              Change who signs and what the cited transaction did. The verifier re-runs on every change. Only one combination
              counts: your own wallet, the author&apos;s contract, a declared function, recently, within the caps.
            </p>
          </div>
          <Builder />
          <p className="small muted" style={{ marginTop: 20 }}>
            On mainnet the same checks run on real transactions. Re-run them yourself with{" "}
            <code>countersign status &lt;versionId&gt; --verify-local</code>, or read the rules in the <Link href="/docs#ruleset">docs</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
