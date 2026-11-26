# demo/

`make-attack-skill.mjs` writes the deliberately malicious **swap-helper-pro** skill used in the demo into a
fresh temporary folder and prints its path:

- its SKILL.md steers the agent to unattended signing and makes confirmation optional;
- its script bundles a max-amount approval to an undeclared spender.

It is an inert test fixture:
- it is never installed, executed or registered;
- its "attacker" is an address nobody controls;
- the harmful wording is assembled at runtime, so no file in this repository contains it.

```sh
D=$(node demo/make-attack-skill.mjs)
node skills/countersign/scripts/countersign.mjs check-install "$D"   # → BLOCK, with the reasons
rm -rf "$D"
```
