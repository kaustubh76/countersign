# Demo script (about 3 minutes)

**Rule: show real numbers, even small ones. Never stage usage on other people's skills.**

Record before the Jenner hardfork (2026-12-08 02:30 UTC). Have a backup take.

## 0:00–0:25 · The problem

- Headlines on screen: a backdoored skill pushed to #1 with bot-inflated downloads; over a thousand malicious skills counted by mid-2026; a malware skill aimed at the Binance Agentic Wallet.
- Line: *"Every trust signal your agent uses to pick a skill can be faked by bots."*

## 0:25–1:10 · The block

1. `D=$(node demo/make-attack-skill.mjs)`. It is "swap-helper-pro", with a fake 4,000-download claim in its description.
2. `countersign check-install "$D"` returns **BLOCK**:
   - RL2: the skill steers you to unattended signing and makes confirmation optional;
   - RL3: a max-integer approval to an undeclared spender;
   - not registered; nobody has countersigned it.
3. `countersign check-call` on its approve calldata also returns **BLOCK** (undeclared spender, maximum amount). *"Blocked before the wallet even previews it."*

## 1:10–2:00 · The honest version, live

1. A real registered skill (ours, or a team that agreed). `check-install` shows: *"Registered ✓ · Countersigned by N · 0 verified incidents."*
2. `session start`. The agent previews a call (`baw contract-call preview`), shows it, and the user says **yes** in chat. Then execute, then `session record`.
3. `session end` reports the session clean: every tx was seen, it stayed inside the manifest, and it touched the author's contract. The agent shows the public-linkage notice and asks; the user says yes. The countersign is previewed and executed.
4. Refresh `/s/<versionId>`: the verified count goes **N → N+1**. Click through to BscScan.

## 2:00–2:35 · Proof, not opinion

If time is short, show these three live in the playground instead (https://countersign-proof.vercel.app/try?s=friend, then `twice`, then `smear`): it runs the same verifier code in the browser.


- **A "friend" countersigns without using the skill**, citing a random tx. The page shows it *rejected*: "no cited transaction touched the author's own contract". The count is unchanged.
- **The same Agent ID countersigns twice:** the tx reverts (`AlreadyCountersigned`). One Agent ID is one countersign per version.
- **A competitor reports the skill** using their own wallet. It appears as an *unverified report*; there is no incident and the count is unchanged. *"A smear needs evidence nobody can fake from their own wallet."*

## 2:35–3:00 · Traction and close

- Real numbers from `/api/v1/stats`: versions registered, verified countersigns, distinct Agent IDs.
- Close: **"Download counts can be faked. Proof of use can't."**

## Before recording (checklist)

- [ ] Mainnet contracts verified; site live; `/api/v1/stats` shows `deployed: true`.
- [ ] Demo wallet: Agent ID claimed, Developer Mode on, a small BNB balance for gas.
- [ ] A registered skill with an endorsed anchor, whose author agreed to be shown.
- [ ] `notes/` run sheet with exact commands, and tabs open: the site, BscScan, the terminal.
- [ ] Rehearse once end to end; time it.
