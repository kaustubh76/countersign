import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { SealMark } from "@/components/Seal";
import { REPO_URL, RULESET, SITE_URL } from "@/lib/site";
import "./globals.css";

const display = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-instrument", display: "swap" });
const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

const DESCRIPTION =
  "Download counts can be faked. The number of real Agent ID holders whose own wallets used a skill cleanly cannot. Proof-of-use trust for AI-agent skills, verified from BNB Smart Chain data.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "COUNTERSIGN · proof-of-use trust for agent skills", template: "%s · COUNTERSIGN" },
  description: DESCRIPTION,
  openGraph: { type: "website", siteName: "COUNTERSIGN", title: "Download counts can be faked. Proof of use can't.", description: DESCRIPTION, url: SITE_URL },
  twitter: { card: "summary_large_image", title: "Download counts can be faked. Proof of use can't.", description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#0b0c0f", colorScheme: "dark" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        <header className="site">
          <div className="wrap">
            <Link className="brand" href="/" aria-label="COUNTERSIGN home">
              <SealMark size={24} />
              COUNTERSIGN
            </Link>
            <Nav repo={REPO_URL} />
          </div>
        </header>
        <main>{children}</main>
        <footer className="site">
          <div className="wrap">
            <div className="cols">
              <div>
                <Link className="brand" href="/">
                  <SealMark size={22} />
                  COUNTERSIGN
                </Link>
                <p style={{ marginTop: 14, maxWidth: 380 }}>
                  Proof-of-use trust for AI-agent skills: distinct Agent ID holders whose own wallets used an exact skill
                  version cleanly, verified from BNB Smart Chain data.
                </p>
              </div>
              <div>
                <h4>Product</h4>
                <ul>
                  <li>
                    <Link href="/try">Try to fake it</Link>
                  </li>
                  <li>
                    <Link href="/check">Red-Line Check</Link>
                  </li>
                  <li>
                    <Link href="/authors">Get a badge for your skill</Link>
                  </li>
                  <li>
                    <Link href="/docs">Docs &amp; API</Link>
                  </li>
                </ul>
              </div>
              <div>
                <h4>Open source</h4>
                <ul>
                  <li>
                    <a href={REPO_URL} rel="noreferrer">
                      Source on GitHub (MIT)
                    </a>
                  </li>
                  <li>
                    <a href={`${REPO_URL}/blob/main/docs/threat-model.md`} rel="noreferrer">
                      Threat model
                    </a>
                  </li>
                  <li>
                    <Link href="/docs#ruleset">Ruleset {RULESET.split("/")[1]}</Link>
                  </li>
                  <li>
                    <a href="/api/v1/stats">Live stats (JSON)</a>
                  </li>
                </ul>
              </div>
            </div>
            <div className="fine">
              <p>
                Counts only: this site never shows which wallet or which Agent ID used which skill, and offers no lookup by
                name or wallet. Every number is recomputed from BNB Smart Chain data and can be re-verified with the
                open-source CLI.
              </p>
              <p>
                Using skills that trade carries risk of loss. Nothing here is financial advice. COUNTERSIGN never signs,
                sends or holds anything.
              </p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
