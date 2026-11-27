import type { ReactNode } from "react";
import { CopyButton } from "./CopyButton";

/** A terminal-style block. `copy` is the text the copy button puts on the clipboard (defaults to `code`). */
export function CodeBlock({ code, label = "shell", copy, children }: { code?: string; label?: string; copy?: string | false; children?: ReactNode }) {
  const text = copy === false ? null : (copy ?? code ?? "");
  return (
    <div className="code">
      <div className="code-head">
        <span>{label}</span>
        {text ? <CopyButton text={text} /> : null}
      </div>
      <pre className="bare">{children ?? code}</pre>
    </div>
  );
}

/** One-line command chip with a copy button (used in the hero). */
export function CommandChip({ cmd }: { cmd: string }) {
  return (
    <div className="chip-cmd">
      <span>
        <span className="p">$ </span>
        {cmd}
      </span>
      <CopyButton text={cmd} />
    </div>
  );
}
