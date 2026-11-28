# STATUS

> The working log for the build. Update it at the end of every milestone and commit it.
> On restart: read this file, then run `git log --oneline -15`, then continue at **Next action**.

**Deadline:** submit by the evening of 2026-12-08 IST (hard deadline 2026-12-09 08:00 UTC). Keep the site up through 2026-12-20.

## Milestones

- [x] **M0** Nov 26: scaffold, env/keys, notes, user kit.
- [~] **M1** Nov 26–28: contracts.
  - [x] Built: SkillRegistry 12.3 KB (several attesters, `checkCall`), Countersign 5.0 KB, GuardedExecutor 1.7 KB.
  - [x] Tested: 42 unit/fuzz tests, plus 2 fork tests against the real Agent ID.
  - [x] `DeployLocal` works, and the mainnet deploy of all three is simulated: ≈0.00028 BNB at 0.05 gwei (5.68 M gas).
  - [ ] Mainnet broadcast, blocked on deployer funding and the user's go-ahead.
  - [ ] BscScan and Sourcify verification.
- [~] **M2** Nov 27–29: core, author flow, redline.
  - [x] `core`: hash, manifest, versionId, RPC fallback, views.
  - [x] Author CLI.
  - [x] Redline v1, now with RL4 (owner powers from verified source). Our own skill passes it with zero findings.
  - [x] The Red-Line attester (`pnpm attest`) and published reports.
  - [ ] Register our skill from kausty.ai and endorse the anchor. Needs the deploy.
- [x] **M3** verifier + user flow.
  - Ruleset v1 (C1–C5, I1–I3, claims).
  - User commands: check-install, check-call, check-preview, session, countersign/report, status.
  - SKILL.md.
  - `scripts/e2e-local.sh`: 12 green steps on anvil.
- [x] **M4** web: **live at https://countersign-proof.vercel.app** since Nov 27.
  - Repo: https://github.com/kaustubh76/countersign (public). CI is green.
  - Vercel: project `countersign-proof` (`prj_FP5KLQ2xOJhGZeyoiWpF8ovMgIHj`) is git-connected, so every push to `main` deploys to production.
  - "Ink & seal" redesign. Landing page with a live BNB Smart Chain strip (`/api/v1/chain`) and an honest launch status.
  - `/try`: 15 scenarios run through the real verifier in the browser on a simulated chain, plus a build-your-own panel. Each outcome is pinned by `web/test/scenarios.test.ts`.
  - `/check`: GitHub folder, local folder (checked in the browser, never uploaded), and samples.
  - `/authors`: countersign.json builder. `/docs`: ruleset table and API.
  - The site's own copy passes our Red-Line Check, and the companion's `DEFAULT_API` points at the live domain.
  - **Nov 27, "Notarized document" redesign** (user: too AI-looking, too much text).
    - The hero is a paper certificate. "Send 1,000 bots" vs "Use it for real" both run the real verifier (`web/lib/duel.ts`).
    - Condensed caps, mono type, stamps and ledgers.
    - Words in `<main>`: `/` 1,001 → 246, `/try` 734 → 350, `/authors` 491 → 216.
    - Every page fits 390 px.
  - **Nov 27, "make it hookier" pass** (user picked: bot swarm + live counter, sign it yourself, real-use sequence).
    - Hero: made-up bot downloads tick up on their own while "Countersigns 0" gets circled in red pen. "Send 1,000 bots" fires a swarm that is struck out. "Use it for real" plays the session, C1–C5 and a green seal. The signature line can be signed by hand, and the real contract check voids the ink (`HeroDuel`, `BotSwarm`, `InkPad`, `lib/duel.ts`).
    - Landing: the attack ledger runs scenarios inline. The countersign receipt is annotated in red pen. The malicious sample is shown as a redacted page (bars only; its wording never reaches the site). 241 words.
    - `/try`: punch card of the 11 fakes, verdict first, case first on phones. Share links go to `/r/<n>`, which has its own preview image.
    - `/check` opens with a samples ledger. `/authors` uses a checklist instead of the 01–04 strip.
    - Checked: phones at 390 and 375 px, reduced motion, dev strict mode, self-scan 0.
  - **Nov 28, first impression + share hooks** (user picked both).
    - At load the certificate drops onto the desk and "Not countersigns." stamps in (transform only, so LCP is unaffected).
    - The headline reacts: red pen strikes "downloads." after the bots, and a green tick lands on "countersigns." when one counts. On desktop the paper tilts toward the cursor.
    - Link previews for `/`, `/try` and `/r/<n>` use the site's own fonts (`web/assets/og`, OFL; Plex Mono unmodified). The 11 score cards render at build time.
    - A Share link appears under the certificate after the first move; its text always starts with "Demo:".
    - New: a themed 404 page and a closing "Your move." band. `main` clips horizontal overflow.
  - **Nov 28, "Watch it" + live API console** (user: "go on!" to the two open ideas).
    - **"Watch it"** (`/watch` redirects to `/?watch=1`): the landing plays itself in about 20 s. It runs 1,000 bots, a hand-forged signature, real use, the same Agent ID again, the six ledger attacks, the receipt, the blocked skill, then "Your move."
      - Any scroll, tap, key or tab switch hands control back.
      - Keys: B, S, R, W and Esc (keycap hints are desktop-only CSS).
      - `lib/tour.ts`. Hero actions read state from a ref, so scripted sequences never act on stale state.
      - Landing is 244 words.
    - **/docs API console:** each endpoint is a row you press. It sends the real request and shows status, time, size, Vercel cache, and tinted JSON, with changed lines flashing.
      - `GET /chain` runs by itself on view.
      - `POST /check` is prefilled with our own skill at the build's commit, and passes.
      - Copy as curl. Helpers in `lib/apiConsole.ts`.
    - Checked on desktop and 390/375 px: the tour runs 20.5 s with the expected end state, no overflow, reduced motion and strict mode clean; all six endpoints answer as expected.
  - **Nov 28, spec-conformance round** (user: apply the ideation doc and the Excalidraw diagram "without fail"; chose all three §16.2 stretch goals). An item-by-item audit found 8 gaps; all are closed:
    - **RL4** (must-ship §16.1): owner powers (mint, fee, pause, blacklist, withdraw, upgrade, arbitrary call) read from the contracts' verified source and checked against the skill's text, through proxies. Sourcify keyless; Etherscan only with a paid key. Live-tested on the Agent ID registry (adminRegister = owner mint), BSC USDC (EIP-1967 proxy), USDT, CAKE, PancakeRouter.
    - **"Skill repo + contracts"**: `--contracts` on the CLI, a field on /check, `contracts` in `POST /api/v1/check`.
    - **RL3** no longer fails honest skills without a manifest (only addresses handed to fund-moving calls in code); timed transfers to fixed addresses now fail.
    - **The attester flow**: `pnpm attest <versionId>` re-checks the canonical content and unchanged code, runs the full check, never publishes a failure, writes `web/public/attestations/<chain>/<versionId>.json`, then prints the `cast send`. `--verify` re-runs it. /s links the report and shows "matches the chain ✓". /authors has "Get attested" (issue template).
    - **Pre-flight**: works before the deploy (static only); always says the human signal ("Registered ✓ · Red-line attested ✓ · Guarded ✓ · Countersigned by N (E established) · K verified incidents"); a risk notice on every warn/block; max-amount and operator approvals blocked even without a manifest (§13 demo); `countersign choose` (§6.3).
    - **Stretch goals**: several attesters (`setAttester(address,bool)`); the GuardedExecutor (opt-in ERC-2771 forwarder; calls outside the manifest revert on-chain); W1 "established" countersigners (Agent ID age isn't used: the registry stores no mint time).
    - **Web**: versions with incidents rank last; stats add `uniqueAgents.union` and `totals.attested`; the badge adds "red-line ✓"; /docs "How it fits" (the Excalidraw lanes, with its legend colours) and the Red-Line rules.
    - Checked against a live local chain: the site shows union 4, attested 1, the report matching the chain, a guarded anchor.
- [ ] **M5** Nov 27–Dec 6: genuine onboarding. Unique Agent ID gates: 10 by Dec 1, 20 by Dec 4, 30 by Dec 6.
- [~] **M6** Dec 4–7.
  - [x] README, threat model, manifest spec and hash spec.
  - [x] Demo script, plus `demo/make-attack-skill.mjs`.
  - [x] Submission copy and outreach kit.
  - [x] CI workflow.
  - [ ] Fill in the addresses and URLs.
  - [ ] Record the demo before Jenner (Dec 8 02:30 UTC).
- [ ] **Submit** Dec 8 evening IST.

## How to check everything

```sh
export PATH="$HOME/.foundry/bin:$HOME/Library/pnpm:$PATH"
(cd contracts && forge test)                                                  # 32 tests
(cd contracts && RUN_FORK_TESTS=true forge test --match-path 'test/fork/*')   # real Agent ID on BSC
pnpm -r test                                                                  # 183 tests (core 61, redline 54, web 60, companion 8)
RUN_NET_TESTS=1 pnpm --filter @countersign/redline test                       # RL4 live on BSC contracts (Sourcify)
scripts/e2e-local.sh                                                          # 16 steps on anvil
```

## Deployed (BSC mainnet, chain 56)

The deployer is `0xB1B202Bc8D6E93d1aA644C46153c14E086aAE22A`, a fresh key whose private key is only in `.env`. The addresses below are **predicted**, and hold only if its first two txs are the deploys.

| Contract | Address | Verified |
|---|---|---|
| SkillRegistry | `0x4bB4a3465925A0F4383Ddb774a8C92A9d3c8Ca56` (predicted, nonce 0) | — |
| Countersign | `0xDb1CC0e2F32b6B8C98553Af104e76dD1a184ce58` (predicted, nonce 1) | — |
| GuardedExecutor | `0x307b3a3A837971E1b8DA673041c1dB5A8AE6bbE5` (predicted, nonce 2) | — |

The Nov 28 dry run (`forge script script/Deploy.s.sol`) produced exactly these three addresses.

- **Attester:** `0x42e7487714AEC6844BC0CE49E7de8F5225fF9C30`.
- **Owner:** the deployer.
- The predicted addresses are already in `skills/countersign/countersign.json`.
- **After deploying,** fill `DEPLOYMENTS[56]` in `packages/core/src/deployments.ts` (with `guardedExecutor` and `deployBlock`), then rebuild the skill bundle.

## Unique Agent ID addresses interacting

| Date | Registry | Countersign | Union |
|---|---|---|---|
| — | 0 | 0 | 0 |

## Waiting on the user

- Fund the deployer (≈0.005 BNB) and the attester (≈0.002 BNB). On Nov 27 the user said funding isn't available yet.
- Verification path: Etherscan's free API no longer covers BNB Chain (Etherscan KB, late 2025), so a free `ETHERSCAN_API_KEY` won't verify on BscScan. Plan: `forge verify-contract --verifier sourcify` (keyless), and BscScan's free web "Verify & Publish" with the standard-JSON input. A paid key is optional.
- Pair `baw`, enable Developer Mode, and run the 2 preview-only checks (`notes/user-kit.md`).
- ~~Create the GitHub repo and the Vercel project~~: done Nov 27.

## Open notes

- The bundle is 856 KB unminified (mostly viem). Consider trimming before freezing v1.0.0.
- `DEFAULT_API` is `https://countersign-proof.vercel.app`. The old placeholder, `countersign.vercel.app`, is someone else's site. The URL is baked into the skill bundle and its content hash, so don't change it after mainnet registration.
- The Vercel MCP returns 403 on `create_project`, so project-level writes go through `vercel api`. `gh` and `vercel` live in `/opt/homebrew/bin`.

## Kill criteria (ideation §15)

1. Is the call visible before signing? Waits on the user's preview-only `baw contract-call preview` check (`notes/user-kit.md`). `check-preview` is built for it.
2. 10+ public hackathon skills by Nov 28: **yes**. On Nov 28, a GitHub code search found 20+ public repos whose SKILL.md drives `baw contract-call`.
3. A path to 30 real Agent IDs: the outreach plan (M5).

## Next action

Mainnet deploy, as soon as the deployer is funded and the user says go:
1. `forge script script/Deploy.s.sol --rpc-url bsc --broadcast` (three contracts, ≈0.0003 BNB).
2. Verify all three on Sourcify (`forge verify-contract --verifier sourcify`, keyless) and on BscScan (web form, standard-JSON input).
3. Fill `DEPLOYMENTS[56]` (with `guardedExecutor`), rebuild the bundle and commit. The site switches from "launching" to live numbers on the next push. **The bundle is part of our skill's content hash: freeze it before registering.**
4. Register our skill from kausty.ai via `baw`, using `--uri https://github.com/kaustubh76/countersign/tree/<commit>/skills/countersign`. Then endorse the anchor from the deployer.
5. Attest it: `pnpm attest <versionId> --from 0x42e7487714AEC6844BC0CE49E7de8F5225fF9C30` (RL4 reads our contracts from Sourcify). Commit and push the report, then send the printed `cast send` from the attester key, after the user's go-ahead.

Meanwhile (no funding needed):
- outreach with the live site (`docs/outreach-kit.md` now has the real URLs);
- rehearse the demo with `/watch` (the 20 s tour) and `/try`; the §13 block beat already works before the deploy;
- run `scripts/scan-skills.ts` on the public hackathon skills (results stay in `notes/`), for the free Red-Line Check offer;
- optionally trim the bundle size.
