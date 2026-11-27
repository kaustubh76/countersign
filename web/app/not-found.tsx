import Link from "next/link";
import { Stamp } from "@/components/Stamp";

/** Any unknown URL (and scores or versions that don't exist): a voided document, and two ways back in. */
export default function NotFound() {
  return (
    <section className="page-head nf">
      <div className="wrap">
        <div className="paper nf-doc">
          <div className="cert-head">
            <span>Document</span>
            <span>404</span>
          </div>
          <h1 className="nf-title">No such page.</h1>
          <Stamp kind="bad" big className="nf-stamp">
            Void
          </Stamp>
        </div>
        <div className="hero-actions">
          <Link className="btn seal" href="/">
            Attack the certificate
          </Link>
          <Link className="btn line" href="/try">
            Try to fake one
          </Link>
        </div>
      </div>
    </section>
  );
}
