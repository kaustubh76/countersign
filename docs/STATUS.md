# STATUS

> The working log for the build. Update it at the end of every milestone and commit it.
> On restart: read this file, then run `git log --oneline -15`, then continue at **Next action**.

**Deadline:** submit by the evening of 2026-12-08 IST (hard deadline 2026-12-09 08:00 UTC). Keep the site up through 2026-12-20.

## Milestones

- [x] **M0** Nov 26: scaffold, env/keys, notes, user kit.
- [~] **M1** Nov 26–27: contracts.
  - [x] Built: SkillRegistry 10.4 KB, Countersign 5.0 KB.
  - [x] Tested: 32 unit/fuzz tests, plus 2 fork tests against the real Agent ID.
  - [x] `DeployLocal` works, and the mainnet deploy is simulated (≈0.00023 BNB).
  - [ ] Mainnet broadcast, blocked on deployer funding and the user's go-ahead.
  - [ ] BscScan and Sourcify verification.
- [~] **M2** Nov 27–29: core, author flow, redline.
  - [x] `core`: hash, manifest, versionId, RPC fallback, views.
  - [x] Author CLI.
  - [x] Redline v1. Our own skill passes it with zero findings.
  - [ ] Register our skill from kausty.ai and endorse the anchor. Needs the deploy.
- [x] **M3** verifier + user flow.
  - Ruleset v1 (C1–C5, I1–I3, claims).
  - User commands: check-install, check-call, check-preview, session, countersign/report, status.
  - SKILL.md.
  - `scripts/e2e-local.sh`: 12 green steps on anvil.
- [~] **M4** web.
  - [x] Pages: live totals, version page, check, docs.
  - [x] API: version, badge SVG, versions, stats, check.
  - [x] Builds, and is smoke-tested against anvil (counts only; no wallets in any response).
  - [ ] **Vercel deploy**: needs the user's go-ahead and a project/team. Set `NEXT_PUBLIC_REPO_URL` and `NEXT_PUBLIC_SITE_URL`, then update `DEFAULT_API` in the companion.
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
pnpm -r test                                                                  # 80 tests
scripts/e2e-local.sh                                                          # full flow on anvil
```

## Deployed (BSC mainnet, chain 56)

The deployer is `0xB1B202Bc8D6E93d1aA644C46153c14E086aAE22A`, a fresh key whose private key is only in `.env`. The addresses below are **predicted**, and hold only if its first two txs are the deploys.

| Contract | Address | Verified |
|---|---|---|
| SkillRegistry | `0x4bB4a3465925A0F4383Ddb774a8C92A9d3c8Ca56` (predicted, nonce 0) | — |
| Countersign | `0xDb1CC0e2F32b6B8C98553Af104e76dD1a184ce58` (predicted, nonce 1) | — |

- **Attester:** `0x42e7487714AEC6844BC0CE49E7de8F5225fF9C30`.
- **Owner:** the deployer.
- The predicted addresses are already in `skills/countersign/countersign.json`.
- **After deploying,** fill `DEPLOYMENTS[56]` in `packages/core/src/deployments.ts` (with deployBlock), then rebuild the skill bundle.

## Unique Agent ID addresses interacting

| Date | Registry | Countersign | Union |
|---|---|---|---|
| — | 0 | 0 | 0 |

## Waiting on the user

- Fund the deployer (≈0.005 BNB) and the attester (≈0.002 BNB).
- Add `ETHERSCAN_API_KEY` to `.env`.
- Pair `baw`, enable Developer Mode, and run the 2 preview-only checks (`notes/user-kit.md`).
- Create the GitHub repo and the Vercel project.

## Open notes

- The bundle is 774 KB unminified (mostly viem). Consider trimming before freezing v1.0.0.
- `DEFAULT_API` in `packages/companion/src/context.ts` is a placeholder (`countersign.vercel.app`). Set it once the Vercel domain is known.

## Next action

Mainnet deploy, as soon as the deployer is funded and the user says go:
1. `forge script script/Deploy.s.sol --rpc-url bsc --broadcast`.
2. Verify on BscScan, falling back to web standard-JSON; also verify on Sourcify.
3. Fill `DEPLOYMENTS[56]`, rebuild the bundle and commit.
4. Register our skill from kausty.ai via `baw`, then endorse the anchor from the deployer.

Then the Vercel deploy and outreach. Optional meanwhile: trim the bundle size.
