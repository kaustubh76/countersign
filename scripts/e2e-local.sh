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
DAVE=0x90F79bf6EB2c4f870365E785982E1f101E93b906;  DAVE_PK=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
ERIN=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65;  ERIN_PK=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const o=JSON.parse(s);console.log($1)})"; }

anvil --port "$PORT" --silent & APID=$!
WORK="$(mktemp -d)"; export COUNTERSIGN_HOME="$WORK/home"
if [ -n "${E2E_KEEP_ALIVE:-}" ]; then trap 'rm -rf "$WORK"; echo "anvil left running (pid $APID) on $RPC"' EXIT
else trap 'kill $APID 2>/dev/null || true; rm -rf "$WORK"' EXIT; fi
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

CS=$(json 'o.countersign' < "$DEP")
LOCAL="--verify-local --no-content"

echo "7. check-install (user, before first use)"
OUT=$($CLI check-install "$WORK/demo-skill" $COMMON $LOCAL)
V=$(echo "$OUT" | json 'o.verdict'); [ "$V" != "block" ] && pass "registered skill is not blocked ($V: $(echo "$OUT" | json 'o.say'))" || { echo "$OUT"; fail "check-install"; }

echo "8. check-call (before every wallet call)"
PING=$(cast calldata 'ping()')
[ "$($CLI check-call --skill "$WORK/demo-skill" --to "$APP" --data "$PING" --from "$CAROL" --json | json 'o.verdict')" = "allow" ] && pass "declared call allowed" || fail "declared call"
[ "$($CLI check-call --skill "$WORK/demo-skill" --to "$REG" --data "$PING" --json | json 'o.verdict')" = "block" ] && pass "undeclared target blocked" || fail "undeclared target"
MAXAPPROVE=$(cast calldata 'approve(address,uint256)' 0x000000000000000000000000000000000000dEaD $(cast max-uint))
[ "$($CLI check-call --skill "$WORK/demo-skill" --to "$APP" --data "$MAXAPPROVE" --json | json 'o.verdict')" = "block" ] && pass "max approval blocked" || fail "max approval"

echo "9. clean session -> countersign -> verified"
$CLI session start --skill "$WORK/demo-skill" --wallet "$CAROL" $COMMON >/dev/null
TX=$(cast send --rpc-url "$RPC" --private-key "$CAROL_PK" "$APP" 'ping()' --json | json 'o.transactionHash')
$CLI session record "$TX" --json >/dev/null
OUT=$($CLI session end $COMMON)
CDATA=$(echo "$OUT" | json 'o.data && o.data.calldata || ""')
[ -n "$CDATA" ] && echo "$OUT" | json 'o.next[0].what' | grep -q "permanently links" && pass "session clean; countersign offered with the public-linkage notice" || { echo "$OUT"; fail "session end (clean)"; }
cast send --rpc-url "$RPC" --private-key "$CAROL_PK" "$CS" "$CDATA" >/dev/null || fail "countersign tx"
$CLI session clear >/dev/null
STATUS=$($CLI status "$VERSION" $COMMON $LOCAL)
[ "$(echo "$STATUS" | json 'o.data.report.countersigns.counted')" = "1" ] && pass "verifier counts it: $(echo "$STATUS" | json 'o.say')" || { echo "$STATUS"; fail "verified count"; }

echo "10. a tx COUNTERSIGN never saw makes the session unclean"
$CLI session start --skill "$WORK/demo-skill" --wallet "$DAVE" $COMMON >/dev/null
T1=$(cast send --rpc-url "$RPC" --private-key "$DAVE_PK" "$APP" 'ping()' --json | json 'o.transactionHash')
$CLI session record "$T1" --json >/dev/null
cast send --rpc-url "$RPC" --private-key "$DAVE_PK" "$ERIN" --value 1 >/dev/null   # hidden transfer, never recorded
OUT=$($CLI session end $COMMON)
[ "$(echo "$OUT" | json 'o.verdict')" = "block" ] && echo "$OUT" | json 'o.reasons[0].text' | grep -q "never saw" && pass "unexplained tx -> no countersign offered" || { echo "$OUT"; fail "unexplained tx"; }
$CLI session clear >/dev/null

echo "11. the author cannot countersign their own skill"
if $CLI countersign "$VERSION" "$TX" --from "$BOB" $COMMON >/dev/null; then fail "self-countersign should revert"; else pass "self-countersign rejected (simulated revert)"; fi

echo "12. a smear report from a competitor's own wallet stays a claim"
SMEAR=$(cast send --rpc-url "$RPC" --private-key "$ERIN_PK" "$APP" 'ping()' --json | json 'o.transactionHash')
RDATA=$(cast calldata 'report(bytes32,bytes32[])' "$VERSION" "[$SMEAR]")
cast send --rpc-url "$RPC" --private-key "$ERIN_PK" "$CS" "$RDATA" >/dev/null || fail "report tx"
STATUS=$($CLI status "$VERSION" $COMMON $LOCAL)
[ "$(echo "$STATUS" | json 'o.data.report.incidents.length')" = "0" ] && [ "$(echo "$STATUS" | json 'o.data.report.claims.total')" = "1" ] && pass "no incident; 1 unverified claim; still counted 1" || { echo "$STATUS"; fail "smear"; }

echo "13. opt-in GuardedExecutor: in-manifest calls go through, anything else reverts on-chain"
EXEC=$(json 'o.guardedExecutor' < "$DEP")
GAPP=$(cd "$ROOT/contracts" && forge create test/mocks/Targets.sol:GuardedTarget --rpc-url "$RPC" --private-key "$BOB_PK" --broadcast --constructor-args "$BOB" "$EXEC" 2>/dev/null | awk '/Deployed to:/{print $3}')
[ -n "$GAPP" ] || fail "forge create GuardedTarget"
mkdir -p "$WORK/guarded-skill"
cat > "$WORK/guarded-skill/SKILL.md" <<MD
---
name: demo-guarded
description: Pings a contract that only trusts calls routed through the GuardedExecutor.
license: MIT
---
Calls ping() on $GAPP through the GuardedExecutor. Show the user every preview and wait for an explicit yes before executing.
MD
cat > "$WORK/guarded-skill/countersign.json" <<JSON
{ "schema": "countersign.manifest/v1", "chainId": 31337, "publisher": "$BOB", "name": "demo-guarded",
  "targets": [ { "address": "$GAPP", "label": "Guarded app", "anchor": true, "functions": ["ping()"] } ] }
JSON
OUT=$($CLI register "$WORK/guarded-skill" --uri "https://github.com/example/demo/tree/0123abcd/guarded-skill" $COMMON) || { echo "$OUT"; fail "register guarded"; }
GVERSION=$(echo "$OUT" | json 'o.data.versionId')
cast send --rpc-url "$RPC" --private-key "$BOB_PK" "$REG" "$(echo "$OUT" | json 'o.data.calldata')" >/dev/null || fail "register guarded tx"
if cast send --rpc-url "$RPC" --private-key "$DAVE_PK" "$EXEC" 'execute(bytes32,address,bytes)' "$GVERSION" "$GAPP" "$(cast calldata 'sweep()')" >/dev/null 2>&1; then
  fail "a guarded call outside the manifest should revert"
else
  pass "a call outside the manifest through the executor reverts on-chain"
fi
$CLI session start --skill "$WORK/guarded-skill" --wallet "$DAVE" $COMMON >/dev/null
GTX=$(cast send --rpc-url "$RPC" --private-key "$DAVE_PK" "$EXEC" 'execute(bytes32,address,bytes)' "$GVERSION" "$GAPP" "$(cast calldata 'ping()')" --json | json 'o.transactionHash')
[ "$(cast call --rpc-url "$RPC" "$GAPP" 'lastSender()(address)')" = "$DAVE" ] && pass "the contract saw the user as the caller (ERC-2771), not the executor" || fail "forwarded sender"
$CLI session record "$GTX" --json >/dev/null
OUT=$($CLI session end $COMMON)
GDATA=$(echo "$OUT" | json 'o.data && o.data.calldata || ""')
[ -n "$GDATA" ] || { echo "$OUT"; fail "guarded session should be clean"; }
cast send --rpc-url "$RPC" --private-key "$DAVE_PK" "$CS" "$GDATA" >/dev/null || fail "guarded countersign tx"
$CLI session clear >/dev/null
STATUS=$($CLI status "$GVERSION" $COMMON $LOCAL)
[ "$(echo "$STATUS" | json 'o.data.report.countersigns.counted')" = "1" ] && [ "$(echo "$STATUS" | json 'o.data.report.anchors.guarded')" = "1" ] \
  && pass "the guarded session counts, and the version shows 1 guarded anchor" || { echo "$STATUS"; fail "guarded count"; }

echo "e2e: all checks passed"
