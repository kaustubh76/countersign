"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/try", label: "Try to fake it" },
  { href: "/check", label: "Red-Line Check" },
  { href: "/authors", label: "For authors" },
  { href: "/docs", label: "Docs & API" },
];

export function Nav({ repo }: { repo: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  return (
    <>
      <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="site-nav" onClick={() => setOpen((o) => !o)}>
        {open ? "Close" : "Menu"}
      </button>
      <nav id="site-nav" className={`top ${open ? "open" : ""}`}>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href || path.startsWith(`${l.href}/`) ? "active" : undefined}>
            {l.label}
          </Link>
        ))}
        <a className="gh" href={repo} rel="noreferrer">
          GitHub ↗
        </a>
      </nav>
    </>
  );
}
