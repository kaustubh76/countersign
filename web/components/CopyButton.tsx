"use client";

import { useState } from "react";

export function CopyButton({ text, label = "copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={`copy ${done ? "done" : ""} ${className ?? ""}`}
      aria-label={done ? "Copied" : `Copy ${label === "copy" ? "to clipboard" : label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? "copied ✓" : label}
    </button>
  );
}
