import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock } from "@/components/CodeBlock";
import { getIndex } from "@/lib/data";
import { SITE_URL } from "@/lib/site";
import { ManifestBuilder } from "./ManifestBuilder";

export const metadata: Metadata = {
  title: "For authors",
  description: "Declare what your skill may do, register it from your Agent ID wallet, and earn a badge only real users can raise.",
};
export const revalidate = 300;

export default async function AuthorsPage() {
  const index = await getIndex();
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <h1>A badge bots can&apos;t raise.</h1>
          <p className="mono-line">declare · check · register · show it · about ten minutes</p>
          {!index.deployed ? <p className="notice">Registration opens at mainnet launch.</p> : null}
          <ol className="steps-strip">
            <li>
              <span className="n">01</span>
              <b>Declare</b>
              <span>countersign.json, below</span>
            </li>
            <li>
              <span className="n">02</span>
              <b>Check</b>
              <span>
                the <Link href="/check">Red-Line Check</Link>
              </span>
            </li>
            <li>
              <span className="n">03</span>
              <b>Register</b>
              <span>from your Agent ID wallet</span>
            </li>
            <li>
              <span className="n">04</span>
              <b>Show it</b>
              <span>a badge in your README</span>
            </li>
          </ol>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <div className="band-head">
            <h2>countersign.json</h2>
            <span className="mono dim">validated live · same code as the registry</span>
          </div>
          <ManifestBuilder />
        </div>
      </section>

      <section className="band">
        <div className="wrap split">
          <div>
            <h2>Register, then show it</h2>
            <p className="lede">You preview and confirm the transaction. Nothing signs for you.</p>
          </div>
          <div className="stack">
            <CodeBlock label="register" code={"countersign register ./my-skill \\\n  --uri https://github.com/<you>/<repo>/tree/<commit>/my-skill \\\n  --from <your Agent ID wallet>"} />
            <CodeBlock label="readme badge" code={`[![countersign](${SITE_URL}/api/v1/badge/<versionId>.svg)](${SITE_URL}/s/<versionId>)`} />
          </div>
        </div>
      </section>

      <section className="band">
        <div className="wrap">
          <h2>Ground rules</h2>
          <ul className="terse">
            <li>No rewards for countersigns.</li>
            <li>No countersign swaps. Pairs show as &quot;peer&quot;, never in the count.</li>
            <li>No account farms. One countersign per Agent ID, each with its own session.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
