# Skill content hash (`countersign.skill.v1`)

A skill version is identified by the hash of **every file in its folder**. Change any byte, add a file or rename one, and it becomes a new version that has to earn trust from zero.

## Algorithm

1. **File set:** every regular file under the skill folder, recursively.
   - **Excluded, and not configurable:** any path segment named `.git` or `node_modules`, and files named `.DS_Store`. There is deliberately no ignore file, because an ignore list would let an author hide executable code from the hash.
   - **Symlinks inside the folder are rejected**, because their content depends on the machine. A symlinked *root* is followed, since skill installers often link skill folders.
   - Any other file type (socket, device) is rejected.
2. **Path:** relative to the skill folder, `/`-separated, Unicode NFC, with no leading `./`. Paths that escape the folder (`..`) are rejected. Two files that normalize to the same path are rejected.
3. **Order:** ascending by the UTF-8 bytes of the path.
4. **Hash:**

```
contentHash = keccak256( utf8("countersign.skill.v1")
                         ‖ for each file in order: keccak256(utf8(path)) ‖ keccak256(bytes) )
```

`‖` is byte concatenation.

## Test vector

| Path | Bytes |
|---|---|
| `SKILL.md` | `# demo` |
| `scripts/run.mjs` | `console.log(1)` |

```
contentHash = 0x0f1efb83ddd01f01bc3bcbac6a62a26c3357bfc30390fae5b72534085d71d82d
```

Reproduce it with Foundry's `cast` alone:

```sh
D=$(cast from-utf8 "countersign.skill.v1")
cast keccak $(cast concat-hex $D $(cast keccak "SKILL.md") $(cast keccak "# demo") \
                               $(cast keccak "scripts/run.mjs") $(cast keccak "console.log(1)"))
```

## Implementations

- `packages/core/src/skillHash.ts`: `hashSkillDir(dir)` and `hashSkillFiles(files)`. The companion skill, the verifier and the web app all use these, so there is exactly one implementation.
- `countersign hash <skill-dir> --json` prints the hash and the per-file hashes.
- Published content is fetched from a commit-pinned GitHub tree URL and hashed the same way (`packages/core/src/content.ts`). That is how anyone can confirm that a registered version is the code it points to.
