#!/usr/bin/env bash
# Local end-to-end run of the COUNTERSIGN flow on a bare anvil, driving the real bundled CLI.
# `cast send` with anvil's published dev keys stands in for `baw contract-call execute` (which needs the
# Binance App). Every key here is worthless, so never reuse them.
set -euo pipefail
export PATH="$HOME/.foundry/bin:$HOME/Library/pnpm:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${E2E_PORT:-8547}"; RPC="http://127.0.0.1:$PORT"
CLI="node $ROOT/skills/countersign/scripts/countersign.mjs"
# anvil accounts: 0 alice (deployer/registry owner), 1 bob (author), 2 carol (user), 3 dave (user)
BOB=0x70997970C51812dc3A010C7d01b50e0d17dc79C8;   BOB_PK=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
CAROL=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC; CAROL_PK=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log($1)})"; }

anvil --port "$PORT" --silent & APID=$!
WORK="$(mktemp -d)"; trap 'kill $APID 2>/dev/null || true; rm -rf "$WORK"' EXIT
n=0; until cast block-number --rpc-url "$RPC" >/dev/null 2>&1; do n=$((n+1)); [ $n -gt 400000 ] && fail "anvil did not start"; done

echo "1. deploy local stack"
(cd "$ROOT/contracts" && forge script script/DeployLocal.s.sol --rpc-url "$RPC" --broadcast >/dev/null 2>&1) || fail "DeployLocal"
DEP="$ROOT/contracts/deployments/31337.json"
REG=$(json 'o.skillRegistry' < "$DEP")
COMMON="--deployment $DEP --chain 31337 --rpc $RPC --json"
pass "registry $REG"

echo "2. author deploys their dApp contract (anchor) and writes a skill"
APP=$(cd "$ROOT/contracts" && forge create test/mocks/Targets.sol:OwnedTarget --rpc-url "$RPC" --private-key "$BOB_PK" --broadcast --constructor-args "$BOB" 2>/dev/null | awk '/Deployed to:/{print $3}')
[ -n "$APP" ] || fail "forge create OwnedTarget"
mkdir -p "$WORK/demo-skill/scripts"
cat > "$WORK/demo-skill/SKILL.md" <<MD
---
name: demo-pinger
description: Pings the demo app contract.
license: MIT
---
Calls ping() on the demo app at $APP. Show the user every preview and wait for an explicit yes before executing.
MD
cat > "$WORK/demo-skill/countersign.json" <<JSON
{ "schema": "countersign.manifest/v1", "chainId": 31337, "publisher": "$BOB", "name": "demo-pinger",
  "targets": [ { "address": "$APP", "label": "Demo app", "anchor": true, "functions": ["ping()"] } ] }
JSON
pass "app $APP"

echo "3. countersign register (validate + simulate + print preview command)"
OUT=$($CLI register "$WORK/demo-skill" --uri "https://github.com/example/demo/tree/0123abcd/demo-skill" $COMMON) || { echo "$OUT"; fail "register should be ready"; }
VERSION=$(echo "$OUT" | json 'o.data.versionId'); CALLDATA=$(echo "$OUT" | json 'o.data.calldata')
echo "$OUT" | json 'o.next[0].run' | grep -q "baw contract-call preview --binanceChainId 31337 --from $BOB --to $REG" && pass "prints the baw preview command (no execute)" || fail "preview command"
echo "$OUT" | json 'o.reasons.map(r=>r.level+" "+r.text).join("\n")' | sed 's/^/      /'

echo "4. user-confirmed execute (cast stands in for baw)"
cast send --rpc-url "$RPC" --private-key "$BOB_PK" "$REG" "$CALLDATA" >/dev/null || fail "register tx"
[ "$(cast call --rpc-url "$RPC" "$REG" 'exists(bytes32)(bool)' "$VERSION")" = "true" ] && pass "version $VERSION registered" || fail "not registered"
ENDORSER=$(cast call --rpc-url "$RPC" "$REG" 'getManifest(bytes32)((address,uint96,address,uint8,address,bytes32)[],(uint8,bytes4)[],(address,address,uint8,uint256)[])' "$VERSION" | head -c 400 | grep -o "$BOB" | head -1 || true)
[ -n "$ENDORSER" ] && pass "anchor auto-endorsed by its owner (the author)" || fail "anchor not endorsed"

echo "5. idempotence"
$CLI register "$WORK/demo-skill" --uri "https://github.com/example/demo/tree/0123abcd/demo-skill" $COMMON | json 'o.say' | grep -q "already registered" && pass "re-running register says already registered" || fail "idempotence"

echo "6. registering from a wallet that is not the publisher is blocked"
if $CLI register "$WORK/demo-skill" --uri "https://github.com/example/demo/tree/0123abcd/demo-skill" --from "$CAROL" $COMMON >/dev/null; then fail "should block non-publisher"; else pass "non-publisher blocked (would not be canonical)"; fi

echo "e2e: all checks passed"
