import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { SealMark } from "@/components/Seal";
import { Ticker } from "@/components/Ticker";
import { archivo, plexMono, signature } from "@/lib/fonts";
import { REPO_URL, SITE_URL } from "@/lib/site";
import "./globals.css";

const DESCRIPTION = "Bots can fake downloads. Not countersigns. Proof-of-use trust for AI-agent skills, verified from BNB Smart Chain data.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "COUNTERSIGN · bots can fake downloads, not countersigns", template: "%s · COUNTERSIGN" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "COUNTERSIGN", title: "Bots can fake downloads. Not countersigns.", description: DESCRIPTION, url: SITE_URL },
  twitter: { card: "summary_large_image", title: "Bots can fake downloads. Not countersigns.", description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#0d0d0c", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${archivo.variable} ${plexMono.variable} ${signature.variable}`}>
      <body>
        <Ticker />
        <header className="site">
          <div className="wrap">
            <Link className="wordmark" href="/" aria-label="COUNTERSIGN home">
              <SealMark size={22} />
              Countersign
            </Link>
            <Nav repo={REPO_URL} />
          </div>
        </header>
        <main>{children}</main>
        <footer className="site">
          <div className="wrap">
            <div className="foot-top">
              <Link className="wordmark" href="/">
                <SealMark size={20} />
                Countersign
              </Link>
              <nav className="foot-links">
                <Link href="/try">Play</Link>
                <Link href="/check">Check</Link>
                <Link href="/authors">Authors</Link>
                <Link href="/docs">Docs</Link>
                <a href={REPO_URL} rel="noreferrer">
                  GitHub
                </a>
                <a href="/api/v1/stats">Stats JSON</a>
              </nav>
            </div>
            <p>Counts only: no wallet or name lookups, ever. Every number is recomputed from BNB Smart Chain data.</p>
            <p>Skills that trade carry risk of loss. Nothing here is financial advice. COUNTERSIGN never signs, sends or holds anything.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
