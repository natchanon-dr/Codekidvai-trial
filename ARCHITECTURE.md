# CKV Architecture

## Frontend

The frontend uses Next.js App Router with React and Tailwind CSS. Pages under `app/` should favor Server Components for data loading and page composition. Client Components should be used only for browser interactivity, form state, local UI state, or component APIs that require the browser.

UI code should stay focused on rendering and interaction. Business rules, scoring logic, persistence, authorization decisions, and analytics preparation belong in services, repositories, or server-only utilities.

## Backend

Backend behavior is implemented through:

- Server Components for server-side rendering and data preparation.
- Server Actions when a form or mutation can remain close to the page workflow.
- API routes under `app/api/` when a stable HTTP boundary is required.
- Service modules under `services/` for domain workflows.
- Utility modules under `lib/` for shared server helpers, validation, Supabase clients, and auth helpers.

API routes should validate input, authenticate the caller, call a service, and return a typed response. They should not accumulate domain logic.

## Supabase

Supabase provides authentication, PostgreSQL storage, RLS enforcement, and data access. Browser-safe Supabase clients must only use public anon credentials. Admin or service-role clients must remain server-only.

Schema changes must be expressed as ordered SQL migrations under `database/migrations/`. Migration files should be additive whenever possible and must not drop or rename existing tables without explicit approval.

## Authentication

Authentication is Supabase-based. Authorization should be role-aware and enforced at multiple layers:

- RLS policies in PostgreSQL.
- Server-side guards for page and API access.
- Service-level checks for domain permissions.
- UI-level affordances only as a convenience, never as the sole access control.

Authentication or authorization changes require explicit user approval before implementation.

## Folder Structure

```text
app/                  Next.js routes, layouts, pages, and API handlers
components/           Reusable React components
lib/                  Shared utilities, auth helpers, validation, clients
services/             Domain and application services
types/                Shared TypeScript types and DTO-adjacent models
database/             Database README and ordered SQL migrations
docs/                 Thesis, module, testing, deployment, and data docs
notebooks/            Learning analytics and research notebooks
scripts/              Operational and seed scripts
public/               Static assets
```

## API Strategy

- Prefer typed request and response DTOs.
- Validate inputs at API and Server Action boundaries.
- Return consistent error shapes.
- Keep status codes meaningful.
- Avoid leaking database details or secrets in responses.
- Keep analytics export APIs anonymized by design.

## Data Access Strategy

As the codebase grows, introduce repository modules for table-focused access and keep services responsible for workflows. Services may compose multiple repositories, enforce business rules, and map database rows to DTOs.
