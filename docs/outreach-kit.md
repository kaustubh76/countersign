# Outreach kit

## Ground rules (non-negotiable)

- **Genuine use only.** No incentives, rewards or giveaways for countersigning. Never "countersign mine and I'll countersign yours". The verifier puts reciprocal author pairs in a separate *peer* count anyway, and the hackathon disqualifies "illegitimate mass account registration for interactions".
- **Never register another team's skill from our wallet.** Teams register their own skills, from their own Agent ID wallets.
- **Red-Line results are private.** We send findings to the team only, and never publish anyone's failures.
- **Never advise anyone to change their wallet balance or settings.** Only say what the official docs say, e.g. that Developer Mode has a balance cap.
- **Keep a dated log** in `notes/outreach-log.md`: who was helped, with what. No wallet addresses.

## For hackathon teams (DM / in person)

> Hi, we built COUNTERSIGN for the Agent ID hackathon. It gives your skill two things judges care about:
>
> 1. **A free Red-Line pre-check**: confirmation bypass, uncapped approvals, undeclared recipients, credential requests, branding and promised-return wording, with file and line for each finding. Paste a commit-pinned GitHub folder, or drop a local folder (it never leaves your browser), at https://countersign-proof.vercel.app/check; results stay private to you.
> 2. **A proof-of-use badge**: "N Agent ID holders whose own sessions were verified, 0 incidents". It counts only real, in-manifest use of *your* contract, from users' own wallets, so it can't be botted.
>
> Setup is about 10 minutes (https://countersign-proof.vercel.app/authors has a countersign.json builder):
> - add a `countersign.json` (your contract + functions + caps);
> - mark your contract as the `anchor`;
> - run `countersign register` from your Agent ID wallet and confirm the preview.
>
> Every registration from your Agent ID wallet also counts as an Agent ID interaction.

## For users (Bangkok, Cipher community)

> If you have an Agent ID and use agent skills, COUNTERSIGN checks each skill before you install it and checks each wallet call against what the skill declared. After a clean session you can countersign it with one zero-value transaction. That publicly says "my own wallet used this version, and it behaved."
>
> It never signs anything for you: every transaction is a preview you confirm.
>
> Install: `npx skills add https://github.com/kaustubh76/countersign --skill countersign`
>
> Curious how it can't be botted? Try to fake one: https://countersign-proof.vercel.app/try

## Daily tracking

- `https://countersign-proof.vercel.app/api/v1/stats` → `uniqueAgents.registry` and `uniqueAgents.countersign`.
- The union is what counts for eligibility.
- Gates: **10 by Dec 1, 20 by Dec 4, 30 by Dec 6.**
