import { Caveat } from "next/font/google";

/** Legible red-pen notes in the margins. Its own module, so only pages that use it preload it. */
export const pen = Caveat({ subsets: ["latin"], weight: "600", display: "swap" });
