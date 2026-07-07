# CKV Git Workflow

## Branching

Never push directly to `main`.

Use these branch prefixes:

- `feature/*`
- `bugfix/*`
- `hotfix/*`
- `refactor/*`

## Completion Workflow

For every completed task:

1. Run `git status`.
2. Summarize changes.
3. Commit changes.
4. Push the current branch.

## Commit Format

Use one of:

- `feat:`
- `fix:`
- `refactor:`
- `docs:`
- `style:`
- `test:`
- `chore:`

Commit messages should be concise and describe the purpose of the change.

## Safety

- Do not revert user changes unless explicitly requested.
- Do not delete files without explicit approval.
- Do not rewrite history unless explicitly requested.
- Keep commits focused.
- Mention checks run in the final report.

## Current Governance Commit

The initial governance setup commit message is:

```text
chore: initialize CKV project governance
```
