import { Archivo, IBM_Plex_Mono, Mrs_Saint_Delafield } from "next/font/google";

/** Condensed heavy caps for headings (wdth axis), normal width for body text. */
export const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo", display: "swap" });
/** Typewriter mono for ledgers, data and code. */
export const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono", display: "swap" });
/** Handwritten signatures on certificates. */
export const signature = Mrs_Saint_Delafield({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-signature" });
