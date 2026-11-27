import type { CSSProperties } from "react";
import { InView } from "@/lib/motion";
import { pen } from "@/lib/penFont";
import type { RedactedFile } from "@/lib/redaction";
import { PenMark } from "./PenMark";
import { Stamp, type StampKind } from "./Stamp";

const v = (o: Record<string, string | number>) => Object.fromEntries(Object.entries(o).map(([k, x]) => [`--${k}`, typeof x === "number" ? `${x}ms` : x])) as CSSProperties;

/**
 * The malicious sample as the Red-Line Check saw it: every line is a bar (its wording never reaches this
 * page), flagged lines are blacked out and noted in red pen, then the verdict is stamped.
 */
export function RedactedPage({ files, name, verdict }: { files: RedactedFile[]; name: string; verdict: { kind: StampKind; stamp: string; sub: string } }) {
  let i = 0;
  const all = files.reduce((n, f) => n + f.lines.length, 0);
  const redactAt = all * 55 + 200;
  let flagged = 0;
  return (
    <InView className="redacted-wrap">
      <div className="paper redacted">
        {files.map((f, fi) => (
          <div key={f.path} className="rd-file">
            <div className="rd-head">
              <span>{f.path}</span>
              {fi === 0 ? <span>{name}</span> : null}
            </div>
            {f.lines.map((l) => {
              const t = i++ * 55;
              const flag = l.notes.some((n) => n.sev === "fail");
              const at = redactAt + (flag ? flagged++ : flagged) * 380;
              return (
                <div key={l.n} className={`rd-line${flag ? " flag" : ""}`}>
                  <span className="rd-n" aria-hidden="true" />
                  <span className="rd-text">
                    {l.len ? <span className="rd-bar" style={{ ...v({ t, r: at }), width: `min(100%, ${l.len}ch)` }} /> : null}
                    {flag ? <PenMark kind="underline" className="rd-under" delay={at + 120} /> : null}
                  </span>
                  <span className="rd-notes">
                    {l.notes.map((n) => (
                      <span key={n.rule} className={`rd-note ${n.sev} ${pen.className}`} style={v({ t: at + 200 })}>
                        {n.rule} · {n.short}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
        <div className="rd-verdict" style={v({ t: redactAt + flagged * 380 + 250 })}>
          <Stamp kind={verdict.kind} big className="rd-stamp">
            {verdict.stamp}
          </Stamp>
          <span className="rd-sub">not installed</span>
        </div>
      </div>
    </InView>
  );
}
