# CKV Developer README

## Purpose

CKV (CodeKidVai) is an AI-powered Learning Analytics Platform for Programming Education. This repository should be maintained as thesis-quality software with clean architecture, clear documentation, and safe handling of student and research data.

## Quick Start

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

## Common Commands

```bash
npm run lint
npm run build
```

## Key Documentation

- `AGENTS.md`: Codex operating rules.
- `PROJECT_CONTEXT.md`: vision, milestone, and roadmap.
- `ARCHITECTURE.md`: system architecture and folder strategy.
- `CODING_STANDARDS.md`: TypeScript, React, and code quality rules.
- `DATABASE_RULES.md`: database naming, migration, and safety rules.
- `SUPABASE_RULES.md`: Supabase access, RLS, and auth rules.
- `GIT_WORKFLOW.md`: branch, commit, and push workflow.
- `AI_WORKFLOW.md`: Codex and AI engineering workflow.
- `TESTING_GUIDE.md`: automated and manual validation guidance.
- `SECURITY_RULES.md`: secrets, auth, data, and operational safety.

## Development Principles

- Prefer readability over cleverness.
- Keep business logic out of UI components.
- Use strong typing and DTOs.
- Use services and repository-style boundaries.
- Keep migrations separate and reviewable.
- Protect student and research data.

## Before Coding

1. Understand the requirement.
2. Inspect affected files.
3. Estimate complexity.
4. Stop and propose a plan if more than five files will change.
5. Ask before schema, auth, deletion, package manager, or build configuration changes.

## Before Finishing

1. Run available checks.
2. Run `git status`.
3. Summarize changes.
4. Commit and push when the task is complete.
