import type { Metadata } from "next";
import { RULE_TITLES } from "@countersign/redline";
import { COMMIT_SHA, REPO_URL } from "@/lib/site";
import { CheckTool } from "./CheckTool";

export const metadata: Metadata = {
  title: "Red-Line Check",
  description: "Check an AI-agent skill against the hackathon's safety red lines: a GitHub folder, a local folder (in your browser), or a sample.",
};

const SHORT: Record<string, string> = {
  RL1: "pairing",
  RL2: "confirmation",
  RL3: "approvals",
  RL5: "branding",
  RL6: "secrets",
  RL7: "returns",
  RL8: "risk warning",
};

export default function CheckPage() {
  const selfSkillUri = /^[0-9a-f]{40}$/.test(COMMIT_SHA) ? `${REPO_URL}/tree/${COMMIT_SHA}/skills/countersign` : null;
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <h1>Red-Line check.</h1>
          <p className="mono-line">static · deterministic · private · same files, same report hash</p>
          <div className="rule-tags">
            {Object.keys(RULE_TITLES).map((id) => (
              <span key={id}>
                <b>{id}</b>
                {SHORT[id]}
              </span>
            ))}
          </div>
        </div>
      </section>
      <section className="page-body">
        <div className="wrap">
          <CheckTool selfSkillUri={selfSkillUri} />
        </div>
      </section>
    </>
  );
}
