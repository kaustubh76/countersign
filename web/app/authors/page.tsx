import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { getIndex } from "@/lib/data";
import { SITE_URL } from "@/lib/site";
import { ManifestBuilder } from "./ManifestBuilder";

export const metadata: Metadata = {
  title: "Get a proof-of-use badge",
  description: "For skill authors: declare what your skill may do in countersign.json, pass the Red-Line Check, register from your Agent ID wallet, and earn a badge only real users can raise.",
};
export const revalidate = 300;

export default async function AuthorsPage() {
  const index = await getIndex();
  return (
    <div className="page-authors">
      <section className="wrap">
        <div className="eyebrow">For skill authors</div>
        <h1 className="page">
          A badge only <em>real users</em> can raise.
        </h1>
        <p className="lead">
          Declare what your skill may do, register the exact version from your Agent ID wallet, and your badge shows how many
          distinct Agent ID holders used it cleanly from their own wallets. About ten minutes.
        </p>
        {!index.deployed ? (
          <p className="notice">
            Registration opens when the COUNTERSIGN contracts are live on BNB Smart Chain (<Link href="/#live">launch status</Link>). You
            can write your <code>countersign.json</code> and pass the Red-Line Check today.
          </p>
        ) : null}
      </section>

      <section className="wrap author-steps">
        <div className="grid four">
          <div className="card step">
            <div className="step-n">01</div>
            <h3>Declare</h3>
            <p className="muted small">Write countersign.json below: your contracts, functions and caps. Mark your own contract as the anchor.</p>
          </div>
          <div className="card step">
            <div className="step-n">02</div>
            <h3>Check</h3>
            <p className="muted small">
              Run the <Link href="/check">Red-Line Check</Link> on your folder. It runs in the browser; fix any findings.
            </p>
          </div>
          <div className="card step">
            <div className="step-n">03</div>
            <h3>Register</h3>
            <p className="muted small">From your Agent ID wallet, with the folder pinned to a GitHub commit. You preview and confirm the transaction.</p>
          </div>
          <div className="card step">
            <div className="step-n">04</div>
            <h3>Show it</h3>
            <p className="muted small">Put the badge in your README and invite real users. Every countersign is checked from chain data.</p>
          </div>
        </div>
      </section>

      <section className="block">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">Step 1</div>
            <h2>
              Write your <em>countersign.json.</em>
            </h2>
            <p>
              It lives in your skill folder, so the content hash covers it. Validated live with the same code the registry uses:
              the manifest hash below is exactly what <code>SkillRegistry</code> will store.
            </p>
          </div>
          <ManifestBuilder />
        </div>
      </section>

      <section className="block">
        <div className="wrap split">
          <div>
            <div className="eyebrow">Steps 3 &amp; 4</div>
            <h2>
              Register, then <em>show it.</em>
            </h2>
            <p className="lead">
              The companion prints a <code>baw contract-call preview</code> for your Agent ID wallet. You review the preview and confirm
              in chat; nothing is signed for you. Re-running it on an already registered version says so.
            </p>
            <ul className="checklist">
              <li>Pin the folder to a commit: the verifier re-hashes exactly those files.</li>
              <li>Your anchor&apos;s owner() should be your publisher wallet, so it is endorsed at registration.</li>
              <li>Every countersign must cite a real session touching your anchor within 48 hours.</li>
            </ul>
          </div>
          <div className="stack">
            <CodeBlock
              label="register (from your Agent ID wallet)"
              code={"countersign register ./my-skill \\\n  --uri https://github.com/<you>/<repo>/tree/<commit>/my-skill \\\n  --from <your Agent ID wallet>"}
            />
            <CodeBlock label="README badge" code={`[![countersign](${SITE_URL}/api/v1/badge/<versionId>.svg)](${SITE_URL}/s/<versionId>)`} />
          </div>
        </div>
      </section>

      <section className="block tight">
        <div className="wrap">
          <div className="card ground-rules">
            <h3>Ground rules</h3>
            <ul className="checklist bad">
              <li>No rewards, giveaways or perks for countersigning. A countersign is only worth something if it is unpaid.</li>
              <li>No &quot;countersign mine and I&apos;ll countersign yours&quot;. Reciprocal pairs are detected and shown as a separate peer count.</li>
              <li>No farms of accounts. One Agent ID countersigns a version once, and each one needs its own real session.</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
