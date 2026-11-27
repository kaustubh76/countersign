/**
 * The COUNTERSIGN seal: a ring of text around a countersign tick, with slightly ragged "ink" edges.
 * Pure SVG (no client JS). `ringText` must not contain the characters < > &.
 */
export function Seal({
  size = 180,
  id = "seal",
  ringText = "COUNTERSIGN · PROOF OF USE · VERIFIED ON-CHAIN · ",
  className,
  color = "var(--seal)",
}: {
  size?: number;
  id?: string;
  ringText?: string;
  className?: string;
  color?: string;
}) {
  return (
    <svg className={`seal-svg ${className ?? ""}`} width={size} height={size} viewBox="0 0 200 200" role="img" aria-label="COUNTERSIGN seal">
      <defs>
        <path id={`${id}-ring`} d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0" />
        <filter id={`${id}-ink`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.6" />
        </filter>
      </defs>
      <g filter={`url(#${id}-ink)`} fill="none" stroke={color}>
        <circle cx="100" cy="100" r="95" strokeWidth="3.2" />
        <circle cx="100" cy="100" r="66" strokeWidth="1.6" />
        <text fill={color} stroke="none" fontFamily="var(--mono)" fontSize="13.2" letterSpacing="2.6" fontWeight="600">
          <textPath href={`#${id}-ring`} startOffset="0">
            {ringText.repeat(2).slice(0, 62)}
          </textPath>
        </text>
        <path d="M70 102 l20 20 l42 -46" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Small mark for the header and favicon-sized uses. */
export function SealMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.4" fill="none" stroke="var(--seal)" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="7.2" fill="none" stroke="var(--seal)" strokeWidth="0.9" opacity="0.7" />
      <path d="M8.3 12.3l2.4 2.4 5-5.4" fill="none" stroke="var(--seal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
