# CKV Project Context

## Project Vision

CKV (CodeKidVai) is an AI-powered Learning Analytics Platform for Programming Education. It supports programming education through learning management, assignment management, teacher dashboards, student dashboards, and AI-ready learning analytics.

The project must be suitable for thesis evaluation and practical production evolution. Decisions should prioritize correctness, explainability, maintainability, and data safety.

## Architecture Summary

CKV uses a Next.js App Router application with TypeScript strict mode, React, Tailwind CSS, Supabase, and PostgreSQL. The application is organized around student, teacher, admin, API, service, and database modules.

Core architecture principles:

- UI components render workflows and delegate business logic.
- Services coordinate domain operations.
- Repository-style access should isolate database queries as the codebase grows.
- DTOs define stable input and output contracts.
- Database migrations are the source of truth for schema changes.
- Analytics exports must be anonymized and research-safe.

## Technology

- Next.js App Router
- TypeScript strict mode
- React
- Tailwind CSS
- Supabase Auth and database APIs
- PostgreSQL
- GitHub workflow
- Codex-assisted development

## Current Milestone

The current repository contains a working Next.js prototype with auth, student flows, teacher/admin areas, API routes, Supabase clients, services, migrations, seed scripts, and analytics documentation. The immediate governance milestone is to standardize future engineering work before adding more application features.

## Long-Term Roadmap

1. Stabilize architecture, coding standards, and documentation.
2. Harden authentication, authorization, and RLS behavior.
3. Complete learning and assignment management workflows.
4. Improve teacher and student dashboard usability.
5. Expand data collection and anonymized analytics exports.
6. Add AI learning analytics models and explainable insights.
7. Improve automated testing, CI, and deployment readiness.
8. Prepare thesis evidence: module map, data dictionary, screenshots, evaluation datasets, and reproducible analysis notebooks.
