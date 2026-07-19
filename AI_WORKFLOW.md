# CKV AI Workflow

## Codex Session Rules

Every Codex session should begin by understanding the requirement, inspecting relevant files, and estimating complexity. Implementation should only begin after scope is clear.

If a change is expected to touch more than five files, Codex must stop and propose a plan for approval.

## Before Implementation

1. Restate the requirement when helpful.
2. Identify affected modules.
3. Estimate complexity and risk.
4. Check for database, authentication, package manager, deletion, or build configuration impact.
5. Ask for approval when a safety rule applies.

## During Implementation

- Keep edits narrowly scoped.
- Follow existing project patterns.
- Prefer Server Components and server-side logic where appropriate.
- Keep UI, services, repositories, and DTOs separated.
- Avoid secrets and `.env` edits.
- Avoid unnecessary dependencies.

## After Implementation

- Run available lint, type, test, or build checks.
- Run `git status`.
- Summarize modified files.
- Report check results.
- Recommend the next step.

## Credit Emergency Policy

If the user says "Quota below 10%" or "Use remaining credits carefully":

1. Stop large implementations.
2. Save work.
3. Run `git status`.
4. Run `git add .`.
5. Commit current work.
6. Push current branch.
7. Summarize current progress.
8. Wait for confirmation.

## AI Engineering Standards

- AI analytics should be explainable and reproducible.
- Keep model inputs and outputs documented.
- Preserve anonymization in datasets.
- Separate analytics experimentation from production workflows.
- Do not present model outputs as authoritative without confidence, rationale, or review path.
