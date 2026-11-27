/** How a countersign is earned, as three linked nodes. Pure markup + CSS animation. */
const NODES = [
  { ico: "ID", title: "A real Agent ID", sub: "one per wallet · soulbound" },
  { ico: "{ }", title: "A real session", sub: "its own txs to the author's contract" },
  { ico: "✓", title: "A countersign", sub: "cites those txs · anyone re-checks" },
];

export function Flow() {
  return (
    <ol className="flow">
      {NODES.map((n, i) => (
        <li key={n.title} className="flow-item">
          <div className="flow-node">
            <span className="flow-ico">{n.ico}</span>
            <b>{n.title}</b>
            <span>{n.sub}</span>
          </div>
          {i < NODES.length - 1 ? (
            <span className="flow-link" aria-hidden="true">
              <span className="flow-pulse" style={{ animationDelay: `${i * 0.6}s` }} />
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
