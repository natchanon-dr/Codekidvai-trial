# CKV Coding Standards

## TypeScript

- Use TypeScript strict mode.
- Avoid `any`.
- Prefer explicit domain types and DTOs.
- Use `unknown` plus narrowing for untrusted input.
- Model nullable values honestly.
- Avoid broad type assertions.

## React and Next.js

- Use functional components.
- Prefer Server Components whenever possible.
- Use Client Components only for browser-only behavior.
- Keep UI components focused on presentation and interaction.
- Do not put business logic inside UI components.
- Use Server Actions for mutations when they provide a simpler and safe boundary.

## Architecture

- Use reusable components for repeated UI patterns.
- Use services for domain workflows.
- Use repository-style modules for database access when queries become shared or complex.
- Use DTOs for API and service boundaries.
- Keep modules cohesive and names clear.

## Code Quality

- Keep functions small.
- Remove duplication when it creates maintenance risk.
- Avoid unnecessary dependencies.
- Avoid hardcoded user-facing strings in deeply nested logic.
- Handle errors deliberately.
- Prefer readable code over clever code.

## Error Handling

- Validate inputs before use.
- Return safe user-facing messages.
- Log actionable technical details only in trusted server contexts.
- Use typed result shapes where they make caller behavior clearer.

## Naming

- Use descriptive names for domain concepts.
- Use consistent suffixes such as `Service`, `Repository`, `Dto`, `Input`, and `Result` when appropriate.
- Keep database naming aligned with `mst_*` and `trn_*` conventions.
