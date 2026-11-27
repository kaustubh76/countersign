"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FLAG_ANCHOR, MANIFEST_FILE, parseManifest, type SkillFile } from "@countersign/core/browser";
import { checkSkill, reportHash, type RedlineReport } from "@countersign/redline";
import { RedlineReportView, type CheckView, type ManifestSummary } from "@/components/RedlineReport";
import { ATTACK_SAMPLE_NAME, attackSampleFiles } from "@/lib/attackSample";
import { filesFromDrop, filesFromInput } from "@/lib/localFiles";

type Tab = "github" | "local" | "samples";

function summarize(files: SkillFile[]): { manifest: ManifestSummary | null; manifestProblem: string | null } {
  const f = files.find((x) => x.path === MANIFEST_FILE);
  if (!f) return { manifest: null, manifestProblem: `no ${MANIFEST_FILE} in the skill folder (needed to register; see For authors)` };
  try {
    const m = parseManifest(JSON.parse(new TextDecoder().decode(f.bytes)));
    return {
      manifest: {
        manifestHash: m.manifestHash,
        publisher: m.publisher,
        targets: m.onchain.targets.length,
        flows: m.onchain.flows.length,
        anchors: m.onchain.targets.filter((t) => (t.flags & FLAG_ANCHOR) !== 0).length,
      },
      manifestProblem: null,
    };
  } catch (e) {
    return { manifest: null, manifestProblem: (e as Error).message };
  }
}

function localView(files: SkillFile[], label: string, source: CheckView["source"], redact = false): CheckView {
  const report = checkSkill(files);
  return { source, label, report, reportHash: reportHash(report), redact, ...summarize(files) };
}

export function CheckTool({ selfSkillUri }: { selfSkillUri: string | null }) {
  const [tab, setTab] = useState<Tab>("github");
  const [uri, setUri] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<CheckView | null>(null);
  const [drag, setDrag] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const show = (v: CheckView | null, err: string | null = null) => {
    setView(v);
    setError(err);
    setBusy(false);
    if (v) setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const runGithub = useCallback(async (target: string) => {
    setBusy(true);
    setError(null);
    setView(null);
    try {
      const res = await fetch("/api/v1/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uri: target }) });
      const body = (await res.json()) as {
        error?: string;
        report?: RedlineReport;
        reportHash?: string;
        manifest?: ManifestSummary | null;
        manifestProblem?: string | null;
      };
      if (!res.ok || !body.report) return show(null, body.error ?? `check failed (${res.status})`);
      const short = target.replace(/^https:\/\/github\.com\//, "");
      show({ source: "github", label: short, report: body.report, reportHash: body.reportHash ?? "", manifest: body.manifest ?? null, manifestProblem: body.manifestProblem ?? null });
    } catch (e) {
      show(null, (e as Error).message);
    }
  }, []);

  const runAttack = useCallback(() => {
    setTab("samples");
    show(localView(attackSampleFiles(), `${ATTACK_SAMPLE_NAME} (deliberately malicious sample)`, "sample", true));
  }, []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("sample") === "attack") runAttack();
    else if (q.get("sample") === "self" && selfSkillUri) {
      setUri(selfSkillUri);
      void runGithub(selfSkillUri);
    } else if (q.get("uri")) {
      setUri(q.get("uri")!);
      void runGithub(q.get("uri")!);
    }
  }, [runAttack, runGithub, selfSkillUri]);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    folderInput.current?.setAttribute("directory", "");
  }, [tab]);

  async function onLocal(get: () => Promise<SkillFile[]>, label: string) {
    setBusy(true);
    setError(null);
    setView(null);
    try {
      const files = await get();
      show(localView(files, label, "local"));
    } catch (e) {
      show(null, (e as Error).message);
    }
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label="What to check">
        {(
          [
            ["github", "GitHub folder"],
            ["local", "Local folder"],
            ["samples", "Samples"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "github" ? (
        <div className="card flat check-panel">
          <form
            className="check"
            onSubmit={(e) => {
              e.preventDefault();
              void runGithub(uri.trim());
            }}
          >
            <input
              value={uri}
              onChange={(e) => setUri(e.target.value)}
              placeholder="https://github.com/<owner>/<repo>/tree/<commit>/<skill-folder>"
              spellCheck={false}
              aria-label="Commit-pinned GitHub folder URL"
              required
            />
            <button disabled={busy}>{busy ? "Checking…" : "Run check"}</button>
          </form>
          <p className="tiny faint" style={{ margin: "10px 0 0" }}>
            The folder must be pinned to a commit (the same form <code>countersign register --uri</code> takes), so the result
            is reproducible. Read-only: nothing is stored.
            {selfSkillUri ? (
              <>
                {" "}
                <button
                  type="button"
                  className="link tiny"
                  onClick={() => {
                    setUri(selfSkillUri);
                    void runGithub(selfSkillUri);
                  }}
                >
                  Try it on COUNTERSIGN&apos;s own skill
                </button>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {tab === "local" ? (
        <div
          className={`card flat check-panel dropzone ${drag ? "drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const items = e.dataTransfer.items;
            void onLocal(() => filesFromDrop(items), "a dropped folder");
          }}
        >
          <div className="drop-icon" aria-hidden="true">
            ⇣
          </div>
          <p style={{ margin: "6px 0" }}>
            <strong>Drop your skill folder here</strong> (the one with <code>SKILL.md</code>), or
          </p>
          <label className="btn ghost small" style={{ cursor: "pointer" }}>
            Choose a folder
            <input
              ref={folderInput}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const list = e.target.files;
                if (list?.length) void onLocal(() => filesFromInput(list), list[0]!.webkitRelativePath.split("/")[0] || "a local folder");
              }}
            />
          </label>
          <p className="tiny faint" style={{ marginTop: 12 }}>
            Hashed and checked in this browser tab with the same code as the CLI. Your files are never uploaded. Up to 2,000 files
            / 25 MB; <code>.git</code>, <code>node_modules</code> and <code>.DS_Store</code> are skipped, as in the content-hash spec.
          </p>
        </div>
      ) : null}

      {tab === "samples" ? (
        <div className="grid two">
          <button type="button" className="sample-card bad" onClick={runAttack}>
            <span className="pill bad">malicious sample</span>
            <span className="sample-title">{ATTACK_SAMPLE_NAME}</span>
            <span className="sample-desc">
              &quot;Fastest swaps, 4,000+ downloads.&quot; Two red lines in two files: it talks the user out of confirming, and its
              script grants a token permission to an address it never declared. Built in your browser, never installed.
            </span>
            <span className="sample-go">Run the check →</span>
          </button>
          <button
            type="button"
            className="sample-card ok"
            disabled={!selfSkillUri}
            onClick={() => {
              if (!selfSkillUri) return;
              setTab("github");
              setUri(selfSkillUri);
              void runGithub(selfSkillUri);
            }}
          >
            <span className="pill ok">real skill</span>
            <span className="sample-title">countersign (our own companion skill)</span>
            <span className="sample-desc">
              The skill this site ships, fetched from GitHub at the exact commit this site was built from. It passes its own
              check without exempting itself.
            </span>
            <span className="sample-go">{selfSkillUri ? "Run the check →" : "available on the deployed site"}</span>
          </button>
        </div>
      ) : null}

      <div ref={resultRef} style={{ scrollMarginTop: 90 }}>
        {busy ? <p className="muted" style={{ marginTop: 24 }}>Checking…</p> : null}
        {error ? <p className="notice bad">{error}</p> : null}
        {view ? <RedlineReportView view={view} /> : null}
      </div>
    </>
  );
}
