# deployments

`script/Deploy.s.sol` and `script/DeployLocal.s.sol` write `<chainId>.json` here on every run. The TypeScript packages read these files.

**These files are gitignored.** Every local anvil run and every fork simulation rewrites them. Committing one would publish throwaway addresses as if they were a real deployment.

The authoritative record of the mainnet deployment is the address table in the project README, backed by verified source on BscScan.

| Chain | Id | File |
|---|---|---|
| BNB Smart Chain mainnet | 56 | `56.json`: the deployment the hackathon rules require |
| Local anvil | 31337 | `31337.json`: written by `DeployLocal.s.sol`, never real |
