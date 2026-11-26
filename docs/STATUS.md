# STATUS

> The working log for the build. Update it at the end of every milestone and commit it.
> On restart: read this file, then run `git log --oneline -15`, then continue at **Next action**.

**Deadline:** submit by the evening of 2026-12-08 IST (hard deadline 2026-12-09 08:00 UTC). Keep the site up through 2026-12-20.

## Milestones

- [ ] **M0** Nov 26: repo scaffold, env/keys, notes, user kit. Done when `pnpm install` and `forge build` pass.
- [ ] **M1** Nov 26–27:
  - SkillRegistry + Countersign
  - unit, fuzz and fork tests
  - ABI frozen
  - mainnet deploy (after go-ahead)
  - BscScan + Sourcify verification
- [ ] **M2** Nov 27–29:
  - `core` (hash, manifest, versionId, RPC, views)
  - companion author commands
  - redline-lite
  - our skill registered from the team Agent ID wallet, anchor endorsed
- [ ] **M3** Nov 29–Dec 2: verifier ruleset v1 (C1–C5, I1–I3, claims), companion user flow, SKILL.md, anvil e2e.
- [ ] **M4** Dec 1–3: web (badge, API, check, docs) live on Vercel.
- [ ] **M5** Nov 27–Dec 6: genuine onboarding. Unique Agent ID gates: 10 by Dec 1, 20 by Dec 4, 30 by Dec 6.
- [ ] **M6** Dec 4–7: README, threat model, demo recorded before Jenner (Dec 8 02:30 UTC), submission copy.
- [ ] **Submit** Dec 8 evening IST.

## Deployed (BSC mainnet, chain 56)

| Contract | Address | Verified |
|---|---|---|
| SkillRegistry | — | — |
| Countersign | — | — |

## Unique Agent ID addresses interacting

| Date | Registry | Countersign | Union |
|---|---|---|---|
| — | 0 | 0 | 0 |

## Waiting on the user

- Pair `baw` and enable Developer Mode; run the 2 preview-only checks (`notes/user-kit.md`).
- Fund the deployer and attester; add `ETHERSCAN_API_KEY` to `.env`.
- Create the GitHub repo and the Vercel project.

## Next action

M1: write `SkillRegistry.sol`, `Countersign.sol`, `MockAgentID.sol` and their tests.
