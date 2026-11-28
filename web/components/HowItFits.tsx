import Link from "next/link";
import { bscscan, REPO_URL } from "@/lib/site";

/**
 * The architecture as drawn in the original design (publish → use → prove, on top of Agent ID), with the
 * legend's colours: blue runs in the user's agent, green is on-chain, yellow is the wallet, orange is the
 * Red-Line Check. Every box links to the real thing.
 */
type Kind = "agent" | "chain" | "wallet" | "check" | "person";
interface Box {
  label: string;
  sub: string;
  kind: Kind;
  href?: string;
}

const AGENT_ID = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";

export function HowItFits({ registry, countersign, executor }: { registry?: string; countersign?: string; executor?: string }) {
  const chainLink = (a: string | undefined) => (a ? `${bscscan("address", a)}#code` : "#contracts");
  const lanes: { id: string; name: string; boxes: Box[]; loop?: string }[] = [
    {
      id: "A",
      name: "Publish",
      boxes: [
        { label: "Skill author", sub: "countersign.json", kind: "person", href: "/authors" },
        { label: "Red-Line Check", sub: "RL1–RL8 · attests a pass", kind: "check", href: "/check" },
        { label: "SkillRegistry", sub: "hash · manifest · attesters", kind: "chain", href: chainLink(registry) },
      ],
    },
    {
      id: "B",
      name: "Use",
      boxes: [
        { label: "You ⇄ your agent", sub: "you confirm every action", kind: "person", href: "#install" },
        { label: "Pre-flight", sub: "allow · warn · block", kind: "agent", href: `${REPO_URL}/blob/main/skills/countersign/SKILL.md` },
        { label: "Agentic Wallet", sub: "preview → you say yes", kind: "wallet" },
        { label: "GuardedExecutor", sub: "optional: reverts off-manifest calls", kind: "chain", href: chainLink(executor) },
        { label: "Author's contract", sub: "declared in the manifest", kind: "chain" },
      ],
    },
    {
      id: "C",
      name: "Prove",
      boxes: [
        { label: "Session check", sub: "your own txs only", kind: "agent", href: `${REPO_URL}/blob/main/skills/countersign/SKILL.md#3-prove-the-session-then-countersign` },
        { label: "Countersign", sub: "one per Agent ID", kind: "chain", href: chainLink(countersign) },
        { label: "Verifier", sub: "C1–C5 · I1–I3 · W1", kind: "agent", href: "#ruleset" },
        { label: "Badge + API", sub: "counts only", kind: "check", href: "#api" },
      ],
      loop: "↺ feeds the next pre-flight",
    },
  ];
  return (
    <div className="fits">
      {lanes.map((lane) => (
        <div key={lane.id} className="fits-lane">
          <div className="fits-name">
            <span>{lane.id}</span>
            {lane.name}
          </div>
          <ol className="fits-flow">
            {lane.boxes.map((b) => (
              <li key={b.label} className={`fits-box ${b.kind}`}>
                {b.href ? b.href.startsWith("/") || b.href.startsWith("#") ? <Link href={b.href}>{b.label}</Link> : <a href={b.href} rel="noreferrer">{b.label}</a> : <b>{b.label}</b>}
                <span>{b.sub}</span>
              </li>
            ))}
            {lane.loop ? <li className="fits-loop">{lane.loop}</li> : null}
          </ol>
        </div>
      ))}
      <a className="fits-base" href={bscscan("address", AGENT_ID)} rel="noreferrer">
        <b>Agent ID registry</b>
        <span>gates every register, countersign and report: handleOf → ownerOf · one per person · soulbound</span>
      </a>
      <div className="fits-key" aria-hidden="true">
        <span className="agent">in your agent</span>
        <span className="chain">on-chain</span>
        <span className="wallet">your wallet</span>
        <span className="check">Red-Line Check</span>
      </div>
    </div>
  );
}
