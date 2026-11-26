import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "COUNTERSIGN: proof-of-use trust for agent skills",
  description:
    "Download counts can be faked. The number of real Agent ID holders whose own wallets used a skill cleanly cannot. Verified from BNB Smart Chain data.",
};

const REPO = process.env.NEXT_PUBLIC_REPO_URL;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <div className="wrap">
            <a className="brand" href="/">
              COUNTERSIGN
            </a>
            <nav className="top">
              <a href="/">Skills</a>
              <a href="/check">Red-Line Check</a>
              <a href="/docs">Docs &amp; API</a>
              {REPO ? <a href={REPO}>Source</a> : null}
            </nav>
          </div>
        </header>
        <main>
          <div className="wrap">{children}</div>
        </main>
        <footer className="site">
          <div className="wrap">
            <p>
              Counts only: this site never shows which wallet or which Agent ID used which skill, and offers no lookup by
              name. Every number is recomputed from BNB Smart Chain data and can be re-verified locally with the
              open-source CLI.
            </p>
            <p>
              Using skills that trade carries risk of loss. Nothing here is financial advice. COUNTERSIGN never signs,
              sends or holds anything.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
