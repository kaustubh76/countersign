# Threat model and honest limits

COUNTERSIGN makes **machine-checkable claims about on-chain behaviour**, and nothing more. Being precise about that is what makes the number worth trusting.

## What a countersign proves

A countersign counts (verifier ruleset `countersign.ruleset/v1`) only if **every** cited transaction:
- succeeded on BNB Smart Chain;
- was sent by the countersigner's own Agent ID wallet;
- was mined after the version was registered and at most 48 hours before the countersign;
- called a function the manifest declares, on a contract it declares, with native value within its cap;
- targets a contract whose code has not changed since registration;
- shows approvals and direct transfers by the signer that match declared flows within their caps;

and **at least one** of those transactions called an *anchor*: a contract whose `owner()` endorsed this version, i.e. one the author provably controls.

The signer is not the registrant or an endorser, and has not also reported this version. Each Agent ID can countersign a version once, and can cite a given transaction only once across all versions.

> In one sentence: **a real Agent ID wallet made successful, in-manifest calls to the author's own contract shortly before countersigning.**

It does **not** prove that the countersigner is a unique human, or that the skill (rather than the user) chose those calls.

## Attacks and why they fail

| Attack | Defence |
|---|---|
| A bot farm of fresh wallets countersigns | Only Agent ID holders can call `countersign`. The ID is resolved on-chain via `handleOf`, with one per address, soulbound and minted only with SPACE ID's signature. Each farm identity still needs its own Agent ID **and** its own on-chain session with the author's contract. |
| Friends countersign without using the skill | Their cited txs must be their own, in-manifest calls to the author's anchor within 48 h. Otherwise the verifier rejects the record (`not-from-signer`, `undeclared-target`, `no-anchor-hit`, `outside-window`). |
| Citing ordinary history (a normal DEX swap) as "usage" | Routers and shared tokens cannot be endorsed anchors, so a session that never touches the author's contract does not count. |
| The author countersigns their own skill | The contract rejects the registrant (`SelfCountersign`); the verifier also excludes endorsers. |
| "Countersign mine, I'll countersign yours" | Reciprocal author pairs go into a separate **peer** count, not the headline. |
| Recycling one session onto many versions | Each Agent ID can cite a tx hash once (`consumed[keccak(agentId, txHash)]`). Txs must also be newer than the version's registration. |
| Copying someone else's tx hashes | `from` must equal the countersigner. Hashes are consumed per Agent ID, so nobody can burn someone else's tx. |
| A competitor smears a rival with reports | A report is only a **claim**, unless chain data proves something the reporter could not have produced from their own wallet: <br>• **I1** the author's contract code or proxy implementation changed; <br>• **I2** a transaction *sent by the author* moved or approved the reporter's assets outside a declared pull flow; <br>• **I3** the published files fail the static red-line rules. <br>Claims are shown but never decisive. A yellow warning appears only when three independent reporters, each with a valid session of their own, agree. |
| Squatting: registering a popular skill's files with a permissive manifest | The version id includes the registrant's Agent ID. The canonical version is the one registered by the `publisher` named inside the hashed files, and pre-flight computes the id itself. |
| Building trust, then swapping in malicious code | Any byte change is a new version that starts from zero. A contract change under a registered version (redeploy, proxy upgrade) is a verified **drift** incident. |
| Approval caps set to the integer maximum, hidden in a manifest | `SkillRegistry` rejects a cap of `type(uint256).max`. `check-call` blocks max-amount approvals and undeclared spenders before preview. |
| A skill tells the agent to skip the check | Pre-flight is advisory: a skill is instructions to an LLM. COUNTERSIGN's teeth are at **selection time**, in what other agents and marketplaces read from the badge API, and in the public record afterwards. The companion skill tells the agent to ignore and surface such instructions. |
| A COUNTERSIGN server lies about counts | The API is a cache. `countersign status <versionId> --verify-local` recomputes everything from chain data. |

## Blind spots (stated on the badge)

- **Native value moved inside a call:** public RPCs give no traces. `maxValueWei` bounds what a call can carry in.
- **Signature-based drains** (permit, Permit2, `sign-message`) submitted later by someone else.
- **Addresses a skill fetches at runtime:** the static check sees only what is in the files.
- **Built-in wallet actions** (swaps, sends, limit orders): the agent never sees their calldata, so they cannot be checked or cited.
- **Low balances:** Developer Mode refuses wallets above a balance cap, so "clean" describes low-balance wallets. Malware that waits for a bigger balance would not show.
- **Desktop malware, credential theft and bad trading advice** are out of scope. Scanners cover them; we do not claim to.

## Upstream trust: Agent ID

The uniqueness guarantee is only as strong as the Agent ID registry:
- **Contract:** SPACE ID's `HandleRegistry` at `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`.
- **One per address, enforced on-chain.** "One per person" relies on the Binance App's KYC and on the mint signer.
- **The owner and the mint signer are a single EOA** (a 3-of-6 Safe is pending acceptance). The owner can `adminRegister` handles without a signature.
- **Farm-like mint patterns have been observed.**

COUNTERSIGN therefore presents its number as **the cost to fake** (a distinct Agent ID plus a real on-chain session with the author's contract per countersign), not as a census of humans.

## Privacy

- Countersigns are public on-chain. The companion says so before every countersign or report: *it permanently links this wallet and its Agent ID to this skill version.*
- The COUNTERSIGN site and API publish **counts only**: no wallets, no handles, no per-person pages, no name directory, and no endpoint keyed by wallet or name.
- The contracts never store or emit handles; records carry the Agent ID tokenId.

## Owner permissions (red line 4)

| Contract | Owner / admin powers |
|---|---|
| `SkillRegistry` | **Owner:** `setAttester`, plus Ownable2Step `transferOwnership` / `acceptOwnership` / `renounceOwnership`. It cannot edit, delete or pause versions, manifests, endorsements or attestations. **Attester:** `attest` and `revokeAttestation`. |
| `Countersign` | None. There is no owner, no admin, no upgrade path and no pause. |

Neither contract holds funds, accepts native value or can touch any user's assets.
