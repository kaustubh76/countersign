/** Share links for the playground: /r/<n> means "tried n of the fakes". Fakes never count (pinned by tests). */
export function parseScore(param: string, max: number): number | null {
  if (!/^[1-9][0-9]?$/.test(param)) return null;
  const n = Number(param);
  return n >= 1 && n <= max ? n : null;
}

export const scoreLine = (n: number, max: number) => `I tried ${n} of ${max} ways to fake a countersign. None counted.`;
