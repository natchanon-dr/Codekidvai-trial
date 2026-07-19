# CKV Codex Operating Rules

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes. APIs, conventions, and file structure may differ from model memory. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js implementation code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project Identity

CKV (CodeKidVai) is an AI-powered Learning Analytics Platform for Programming Education. It is a thesis-quality system, not a disposable prototype. Every Codex session must protect readability, architecture, data safety, and research integrity.

## Primary Responsibilities

- Preserve clean architecture and production-ready standards.
- Prefer readable, strongly typed, maintainable code over clever shortcuts.
- Keep functions small and files organized.
- Avoid over-engineering when a direct, well-typed solution is enough.
- Do not implement features before understanding the requirement and current code.

## Required Workflow

1. Understand the requirement and inspect relevant files.
2. Estimate complexity before implementation.
3. If the change is expected to touch more than five files, stop and propose a plan for approval.
4. Implement only after the scope is clear.
5. Run available lint, type, test, or build checks when relevant.
6. Report results, modified files, and recommended next step.

## Architecture Standards

- Use Next.js App Router conventions.
- Prefer React Server Components when possible.
- Use Server Actions when they fit the workflow.
- Keep business logic out of UI components.
- Use services, repositories, DTOs, and typed boundaries for data access and domain workflows.
- Keep API routes thin: validate input, call services, return typed responses.

## TypeScript Standards

- TypeScript strict mode is required.
- Avoid `any`; use explicit types, generics, discriminated unions, or `unknown` with narrowing.
- Keep DTOs separate from database row shapes when API contracts differ.
- Handle nullable values intentionally.
- Prefer named domain types for important concepts.

## Database Safety

- Master tables use `mst_*`.
- Transaction tables use `trn_*`.
- Never rename tables automatically.
- Never drop tables.
- Never modify database schema without asking the user first.
- Always generate migrations separately.
- Never edit production data casually.
- Never expose secrets or edit `.env` files.

## Supabase Safety

- Respect Row Level Security.
- Keep service-role access server-only.
- Never import admin clients into client components.
- Do not expose `auth_user_id`, emails, display names, or secrets in analytics exports.
- Use migrations for schema changes and document migration order.

## Security Rules

- Never expose secrets in code, logs, commits, screenshots, or docs.
- Never edit `.env`, `.env.local`, or deployed secret configuration unless explicitly instructed.
- Ask before authentication or authorization changes.
- Validate all external input.
- Return safe error messages to users and detailed diagnostics only to trusted logs.

## Git Workflow

- Never push directly to `main`.
- Use branch prefixes: `feature/*`, `bugfix/*`, `hotfix/*`, `refactor/*`.
- For every completed task: run `git status`, summarize changes, commit, and push.
- Commit messages must use: `feat:`, `fix:`, `refactor:`, `docs:`, `style:`, `test:`, or `chore:`.
- Do not revert user changes unless the user explicitly asks.

## Credit Emergency Policy

If the user says "Quota below 10%" or "Use remaining credits carefully":

1. Stop large implementations.
2. Save work.
3. Run `git status`.
4. Run `git add .`.
5. Commit current work.
6. Push current branch.
7. Summarize current progress.
8. Wait for user confirmation before continuing large paid-credit work.

## Approval Required Before

- Database schema changes.
- Authentication or authorization changes.
- Deleting files.
- Changing package manager.
- Modifying build configuration.
- Adding unnecessary dependencies.

## Final Report Format

When completing implementation work, report:

- Files changed.
- Checks run and results.
- Summary of behavior.
- Risks or follow-up recommendations.
