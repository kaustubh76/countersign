# Submission copy (Binance Agent ID Hackathon form)

Form: Binance App login required. The fields come from the official announcement: project name, website, contract addresses, Agent ID usage description, reward receiving address, and other materials.

**Project name:** COUNTERSIGN

**Website:** https://countersign-proof.vercel.app

**Contract addresses (BNB Smart Chain, verified on BscScan):**
- SkillRegistry: *(set at deploy)*
- Countersign: *(set at deploy)*
- GuardedExecutor: *(set at deploy)*

**Agent ID usage description (≈150 words):**

> COUNTERSIGN turns Agent ID into a proof-of-use trust signal for AI-agent skills.
>
> Every action resolves the caller's Agent ID on-chain: `handleOf(msg.sender)`, then `tokenId = keccak256(handle)`, then `ownerOf(tokenId) == msg.sender`. Registering a skill version, countersigning it and reporting it all work this way, and no handle is ever passed in.
>
> Each Agent ID may countersign a version once. A countersign must cite that same wallet's own successful transactions to the version's declared contracts, including the author's own contract, within 48 hours. Each transaction can be cited only once per Agent ID. An open verifier re-checks every cited transaction from chain data.
>
> The author's Agent ID is part of the version id, so squatting someone's skill gains nothing. The headline number is "distinct Agent ID holders whose own sessions were verified": the decision point that fake download counts have been exploiting.
>
> Remove Agent ID and the product does not exist.

**Reward receiving address:** *(the user fills this in personally)*

**Other materials:**
- Source: https://github.com/kaustubh76/countersign
- Try it without a wallet: https://countersign-proof.vercel.app/try (the real verifier, in the browser, against a simulated chain)
- Demo video: *(link)*
- Docs: README, `docs/threat-model.md`, `docs/manifest-spec.md`
- Live numbers: https://countersign-proof.vercel.app/api/v1/stats
