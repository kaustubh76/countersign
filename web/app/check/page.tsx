import { CheckForm } from "./CheckForm";

export const metadata = { title: "Red-Line Check · COUNTERSIGN" };

export default function CheckPage() {
  return (
    <>
      <h1>Red-Line Check</h1>
      <p className="lead">
        A static, deterministic check of a skill folder against the hackathon&apos;s safety red lines: confirmation
        bypass, uncapped approvals and undeclared recipients, wallet-secret requests, pairing outside the Binance App,
        brand impersonation, promised returns, and a risk-warning advisory.
      </p>
      <p className="muted small">
        Paste a GitHub folder URL <strong>pinned to a commit</strong>. The check is read-only: nothing is stored and no
        wallet is involved. Results are private to you; COUNTERSIGN never publishes other teams&apos; findings. The same
        check runs locally with <code>countersign redline &lt;skill-dir&gt;</code>.
      </p>
      <CheckForm />
    </>
  );
}
