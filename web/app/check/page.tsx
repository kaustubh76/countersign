import type { Metadata } from "next";
import { RULE_TITLES } from "@countersign/redline";
import { COMMIT_SHA, REPO_URL } from "@/lib/site";
import { CheckTool } from "./CheckTool";

export const metadata: Metadata = {
  title: "Red-Line Check",
  description: "A static, deterministic check of an AI-agent skill against the hackathon's safety red lines. GitHub folders, local folders (in your browser), and samples.",
};

export default function CheckPage() {
  const selfSkillUri = /^[0-9a-f]{40}$/.test(COMMIT_SHA) ? `${REPO_URL}/tree/${COMMIT_SHA}/skills/countersign` : null;
  return (
    <div className="page-check wrap">
      <div className="eyebrow">Before you install</div>
      <h1 className="page">
        Red-Line <em>Check.</em>
      </h1>
      <p className="lead">
        A static, deterministic check of a skill folder against the hackathon&apos;s safety red lines. The same files always give
        the same findings and the same report hash, so anyone can re-run it and compare.
      </p>
      <div className="rule-chips">
        {Object.entries(RULE_TITLES).map(([id, title]) => (
          <span key={id} className="rule-chip">
            <span className="mono">{id}</span> {title}
          </span>
        ))}
      </div>
      <CheckTool selfSkillUri={selfSkillUri} />
      <p className="small muted" style={{ marginTop: 32 }}>
        Results are private to you: COUNTERSIGN stores nothing and never publishes other teams&apos; findings. It looks for
        instructions and requests, not topics: a skill that says it <em>never</em> does something is not flagged for mentioning
        it. The verifier treats failures of RL1, RL2, RL3 or RL6 in a registered skill&apos;s published files as a verified
        incident.
      </p>
    </div>
  );
}
