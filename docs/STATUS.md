# STATUS

> The working log for the build. Update it at the end of every milestone and commit it.
> On restart: read this file, then run `git log --oneline -15`, then continue at **Next action**.

**Deadline:** submit by the evening of 2026-12-08 IST (hard deadline 2026-12-09 08:00 UTC). Keep the site up through 2026-12-20.

## Milestones

- [x] **M0** Nov 26: repo scaffold, env/keys, notes, user kit. `pnpm install` and `forge build` pass.
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

### M1 progress

**Done**
- Contracts: SkillRegistry 10.4 KB, Countersign 5.0 KB.
- 32 unit and fuzz tests green.
- 2 fork tests green against the real Agent ID: `RUN_FORK_TESTS=true forge test --match-path 'test/fork/*'`.
- `DeployLocal` works on anvil.
- Mainnet deploy simulated: 4.54M gas ≈ 0.00023 BNB.

**Pending**
- Deployer funding and the user's go-ahead.
- Broadcast, then verification.

## Deployed (BSC mainnet, chain 56)

The deployer is `0xB1B202Bc8D6E93d1aA644C46153c14E086aAE22A`, a fresh key. The addresses below are **predicted**, and hold only if its first two txs are the deploys.

| Contract | Address | Verified |
|---|---|---|
| SkillRegistry | `0x4bB4a3465925A0F4383Ddb774a8C92A9d3c8Ca56` (predicted, nonce 0) | — |
| Countersign | `0xDb1CC0e2F32b6B8C98553Af104e76dD1a184ce58` (predicted, nonce 1) | — |

Attester: `0x42e7487714AEC6844BC0CE49E7de8F5225fF9C30`. Owner: the deployer.

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
