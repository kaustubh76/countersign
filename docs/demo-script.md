# Demo script (about 3 minutes)

**Rule: show real numbers, even small ones. Never stage usage on other people's skills.**

Record before the Jenner hardfork (2026-12-08 02:30 UTC). Have a backup take.

**Optional 20-second cold open:** https://countersign-proof.vercel.app/watch plays the landing page by itself. It runs 1,000 bots, a hand-forged signature, real use, the same Agent ID again, six more attacks, the receipt, and the blocked skill. Every verdict is the real verifier on a simulated chain, and the page says "demo". For a manual take, press B (bots), S (sign by hand), R (real use), W (the tour) and Esc (stop). Any scroll, tap or key stops the tour.

## 0:00–0:25 · The problem

- Headlines on screen: a backdoored skill pushed to #1 with bot-inflated downloads; over a thousand malicious skills counted by mid-2026; a malware skill aimed at the Binance Agentic Wallet.
- Line: *"Every trust signal your agent uses to pick a skill can be faked by bots."*

## 0:25–1:10 · The block

1. `D=$(node demo/make-attack-skill.mjs)`. It is "swap-helper-pro", with a fake 4,000-download claim in its description.
2. `countersign check-install "$D"` returns **BLOCK** (it works before the mainnet deploy too, with the Red-Line Check alone):
   - ❌ Red-line, RL2: the skill steers you to unattended signing and makes confirmation optional;
   - ❌ Red-line, RL3: a max-integer approval hard-coded to an address nothing declares;
   - ❌ Human signal: *"Not registered · Countersigned by 0 · 0 verified incidents"*, plus the risk notice.
3. The call itself: `countersign check-call --skill "$D" --to 0x55d398326f99059fF775485246999027B3197955 --data $(cast calldata 'approve(address,uint256)' 0x000000000000000000000000000000000000bEEF $(cast max-uint))` returns **BLOCK**: ❌ Manifest: an approval for the maximum amount, to a spender the skill never declared. *"Blocked before the wallet even previews it."*

## 1:10–2:00 · The honest version, live

1. A real registered skill (ours, or a team that agreed). `check-install` shows: *"Registered ✓ · Red-line attested ✓ · Countersigned by N · 0 verified incidents."* Open its page, `/s/<versionId>`: the attestation's report link says *"matches the chain ✓"*.
2. `session start`. The agent previews a call (`baw contract-call preview`), shows it, and the user says **yes** in chat. Then execute, then `session record`.
3. `session end` reports the session clean: every tx was seen, it stayed inside the manifest, and it touched the author's contract. The agent shows the public-linkage notice and asks; the user says yes. The countersign is previewed and executed.
4. Refresh `/s/<versionId>`: the verified count goes **N → N+1**. Click through to BscScan.

## 2:00–2:35 · Proof, not opinion

If time is short, show these three live in the playground instead (https://countersign-proof.vercel.app/try?s=friend, then `twice`, then `smear`): it runs the same verifier code in the browser.


- **A "friend" countersigns without using the skill**, citing a random tx. The page shows it *rejected*: "no cited transaction touched the author's own contract". The count is unchanged.
- **The same Agent ID countersigns twice:** the tx reverts (`AlreadyCountersigned`). One Agent ID is one countersign per version.
- **A competitor reports the skill** using their own wallet. It appears as an *unverified report*; there is no incident and the count is unchanged. *"A smear needs evidence nobody can fake from their own wallet."*

**Optional beat, "the chain says no":** for a skill whose contract opted into the GuardedExecutor, `check-call --guarded` prints the preview routed through it, and a call outside the manifest reverts on-chain (`OutsideManifest`). `scripts/e2e-local.sh` step 13 shows it on a local chain.

## 2:35–3:00 · Traction and close

- Real numbers from `/api/v1/stats`: versions registered, verified countersigns, attested versions, distinct Agent IDs (`uniqueAgents.union`). On camera, open https://countersign-proof.vercel.app/docs#api and press `GET /api/v1/stats`. The console sends the real request and shows the response.
- Close: **"Download counts can be faked. Proof of use can't."**

## Before recording (checklist)

- [ ] Mainnet contracts verified; site live; `/api/v1/stats` shows `deployed: true`.
- [ ] Demo wallet: Agent ID claimed, Developer Mode on, a small BNB balance for gas.
- [ ] A registered skill with an endorsed anchor, whose author agreed to be shown.
- [ ] Our own version attested (`pnpm attest <versionId> --from <attester>`, report pushed, attester tx sent after the go-ahead).
- [ ] `notes/` run sheet with exact commands, and tabs open: the site, BscScan, the terminal.
- [ ] Rehearse once end to end; time it.
