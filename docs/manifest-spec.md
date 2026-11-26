# Permission manifest: `countersign.json` (`countersign.manifest/v1`)

Android-style permissions, for wallets. The manifest is a file **inside** the skill folder, so the content hash covers it. It declares:
- which contracts and functions the skill calls;
- how much native value per call;
- which approvals and token transfers those calls may cause, and up to what cap;
- who the author is.

```json
{
  "schema": "countersign.manifest/v1",
  "chainId": 56,
  "publisher": "0x…the author's Agent ID wallet…",
  "name": "my-skill",
  "targets": [
    {
      "address": "0x…your dApp contract…",
      "label": "My dApp",
      "anchor": true,
      "functions": ["deposit(uint256)", "withdraw(uint256)"],
      "maxValueWei": "0"
    },
    {
      "address": "0x55d398326f99059fF775485246999027B3197955",
      "label": "USDT",
      "functions": ["approve(address,uint256)"]
    }
  ],
  "flows": [
    { "kind": "approve", "token": "0x55d398326f99059fF775485246999027B3197955", "counterparty": "0x…your dApp contract…", "cap": "100000000000000000000" }
  ],
  "builtins": ["market-order"]
}
```

## Fields

**Top level**

| Field | Meaning |
|---|---|
| `schema` | Must be `countersign.manifest/v1`. |
| `chainId` | `56` for BNB Smart Chain. |
| `publisher` | The author's **Agent ID wallet**. Only a version registered by this address is canonical. |

**`targets[]`** (1–16)

| Field | Meaning |
|---|---|
| `address` | The contract. |
| `functions` | Signatures or 4-byte selectors (≤ 64 in total). Use `0x00000000` for plain native transfers. |
| `maxValueWei` | Maximum native value per call (decimal string, default `"0"`). |
| `anchor` | `true` for **your own** contract. A countersign must cite at least one tx to an *endorsed* anchor. The anchor is endorsed automatically if the registrant is the contract's `owner()`; otherwise its owner calls `endorseAnchor`. Routers and shared tokens can never be anchors, so ordinary history can't masquerade as usage. |
| `pull` | `true` if the contract may pull the user's tokens under a declared approve flow (an escrow, for example). |
| `impl` | For proxies: the EIP-1967 implementation the proxy must keep running. A change is a verified incident. |

**`flows[]`** (≤ 32)

| Field | Meaning |
|---|---|
| `kind` | `approve` or `transfer`. |
| `token` | The token address, or `"native"` for BNB (transfers only). |
| `counterparty` | The spender for an approval, the recipient for a transfer. |
| `cap` | Decimal string in the token's base units. **Unlimited caps are rejected**, by the parser and by the contract. |

**Other**

| Field | Meaning |
|---|---|
| `builtins` | Informational: Agentic Wallet built-in actions the skill uses (`market-order`, `limit-order`, `send`, `prediction`, `defi`, `x402`). They expose no calldata to the agent, so they cannot be checked or cited. |

## On-chain form and ids

`SkillRegistry.register` takes three arrays built from the JSON, in file order:

```solidity
struct TargetIn   { address target; address impl; uint96 maxValue; uint8 flags; } // flags: ANCHOR=1, PULL=2
struct Permission { uint8 targetIndex; bytes4 selector; }
struct Flow       { address token; address counterparty; uint8 kind; uint256 cap; } // kind: approve=0, transfer=1

manifestHash = keccak256(abi.encode(targets, permissions, flows))
versionId    = keccak256(abi.encode(contentHash, manifestHash, registrantAgentId))
```

`registrantAgentId = uint256(keccak256(bytes(handle)))` is the registrant's Agent ID. The contract derives it on-chain from `handleOf(msg.sender)`, so nobody can register under someone else's Agent ID.

Because the registrant is part of the id, a squatter who registers your files gets a **different** version, and every pre-flight computes the id with *your* Agent ID. `SkillRegistry.computeVersionId(...)` returns both hashes, so clients can cross-check their encoding.

## Validate before registering

```sh
node skills/countersign/scripts/countersign.mjs manifest <skill-dir> --json
```

Problems are reported with their exact location (`targets[2].functions: duplicate selector …`) before anything reaches the chain.
