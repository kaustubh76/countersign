import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Stamp } from "@/components/Stamp";
import { parseScore, scoreLine } from "@/lib/score";
import { SCENARIOS } from "@/lib/sim/scenarios";

const MAX = SCENARIOS.filter((s) => s.group === "fake").length;

export const dynamicParams = false;
export function generateStaticParams() {
  return Array.from({ length: MAX }, (_, i) => ({ n: String(i + 1) }));
}

export async function generateMetadata({ params }: { params: Promise<{ n: string }> }): Promise<Metadata> {
  const n = parseScore((await params).n, MAX);
  if (!n) return {};
  const line = scoreLine(n, MAX);
  return { title: `${n} of ${MAX} fakes tried`, description: line, openGraph: { title: line }, twitter: { title: line } };
}

/** A shared playground score: n of the fakes tried, none counted (fakes never count; the tests pin it). */
export default async function ScorePage({ params }: { params: Promise<{ n: string }> }) {
  const n = parseScore((await params).n, MAX);
  if (!n) notFound();
  return (
    <section className="page-head score-page">
      <div className="wrap">
        <div className="paper punch score-card">
          <div className="punch-head">
            <span>Fakes tried</span>
            <span>
              {n}/{MAX}
            </span>
          </div>
          <div className="punch-body">
            <div className="punch-slots">
              {Array.from({ length: MAX }, (_, i) => (
                <span key={i} className={`slot${i < n ? " done bad" : ""}`}>
                  <span className="slot-n" aria-hidden="true" />
                  {i < n ? <span className="slot-x">✗</span> : null}
                </span>
              ))}
            </div>
          </div>
          <Stamp kind="ok" big className="punch-done">
            0 counted
          </Stamp>
        </div>
        <h1>Bots can fake downloads. Not countersigns.</h1>
        <div className="hero-actions">
          <Link className="btn seal" href="/try">
            Try to fake one
          </Link>
          <Link className="btn line" href="/">
            Attack the certificate
          </Link>
        </div>
      </div>
    </section>
  );
}
