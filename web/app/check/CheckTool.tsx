"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FLAG_ANCHOR, MANIFEST_FILE, parseManifest, type SkillFile } from "@countersign/core/browser";
import { checkSkill, reportHash, type RedlineReport } from "@countersign/redline";
import { RedlineReportView, type CheckView, type ManifestSummary } from "@/components/RedlineReport";
import { Stamp } from "@/components/Stamp";
import { ATTACK_SAMPLE_NAME, attackSampleFiles } from "@/lib/attackSample";
import { filesFromDrop, filesFromInput } from "@/lib/localFiles";
import { verdictOf } from "@/lib/verdict";

type Tab = "github" | "local";

function summarize(files: SkillFile[]): { manifest: ManifestSummary | null; manifestProblem: string | null } {
  const f = files.find((x) => x.path === MANIFEST_FILE);
  if (!f) return { manifest: null, manifestProblem: `no ${MANIFEST_FILE} (needed to register)` };
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
  const [contracts, setContracts] = useState("");
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

  const runGithub = useCallback(async (target: string, own = "") => {
    setBusy(true);
    setError(null);
    setView(null);
    try {
      const given = own.split(/[\s,]+/).filter(Boolean);
      const res = await fetch("/api/v1/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ uri: target, ...(given.length ? { contracts: given } : {}) }),
      });
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

  const sampleVerdict = useMemo(() => verdictOf(checkSkill(attackSampleFiles())), []);

  const runAttack = useCallback(() => {
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
      setContracts(q.get("contracts") ?? "");
      void runGithub(q.get("uri")!, q.get("contracts") ?? "");
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
            ["github", "GitHub"],
            ["local", "Local folder"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "github" ? (
        <div className="check-panel">
          <form
            className="check"
            onSubmit={(e) => {
              e.preventDefault();
              void runGithub(uri.trim(), contracts);
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
            <button type="submit" className="btn seal" disabled={busy}>
              {busy ? "Checking…" : "Run check"}
            </button>
            <input
              className="check-contracts"
              value={contracts}
              onChange={(e) => setContracts(e.target.value)}
              placeholder="your contracts, optional: 0x…, 0x…"
              spellCheck={false}
              aria-label="Your own contract addresses (optional), for RL4 owner powers"
            />
          </form>
          <p className="mono-line">pinned to a commit · read-only · nothing stored · RL4 reads your contracts&apos; verified source</p>
        </div>
      ) : null}

      {tab === "local" ? (
        <label
          className={`paper dropzone ${drag ? "drag" : ""}`}
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
          <span className="cap">Drop a skill folder</span>
          <p>or click to choose one · checked in this tab, never uploaded</p>
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
      ) : null}

      {!view && !busy && !error ? (
        <div className="ledger samples-ledger">
          <button type="button" className="ledger-row" onClick={runAttack}>
            <span className="k">{ATTACK_SAMPLE_NAME}</span>
            <span className="why">&quot;4,000+ downloads&quot; · a planted sample</span>
            <span className="leader" />
            <Stamp kind={sampleVerdict.kind}>{sampleVerdict.stamp}</Stamp>
          </button>
          {selfSkillUri ? (
            <button
              type="button"
              className="ledger-row"
              onClick={() => {
                setTab("github");
                setUri(selfSkillUri);
                void runGithub(selfSkillUri);
              }}
            >
              <span className="k">countersign</span>
              <span className="why">our own skill, this commit</span>
              <span className="leader" />
              <span className="try">run</span>
            </button>
          ) : null}
        </div>
      ) : null}

      <div ref={resultRef} style={{ scrollMarginTop: 90 }}>
        {busy ? <p className="mono-line">checking…</p> : null}
        {error ? <p className="notice bad">{error}</p> : null}
        {view ? <RedlineReportView view={view} /> : null}
      </div>
    </>
  );
}
