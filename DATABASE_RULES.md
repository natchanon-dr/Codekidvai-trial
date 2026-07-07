# CKV Database Rules

## Naming Convention

- Master tables: `mst_*`
- Transaction tables: `trn_*`

Do not rename existing tables automatically. New names must preserve the project convention and be approved when they affect schema.

## Absolute Safety Rules

- Never drop tables without explicit approval.
- Never rename tables without explicit approval.
- Never modify schema without asking the user first.
- Never edit `.env` files to change database configuration.
- Never expose secrets, connection strings, or service role keys.
- Always generate migrations separately.

## Migration Rules

- Place migrations in `database/migrations/`.
- Use ordered, descriptive migration filenames.
- Keep migrations deterministic and reviewable.
- Prefer additive changes.
- Include rollback notes in discussion when a change is risky.
- Do not mix unrelated schema changes in one migration.

## Data Integrity

- Use foreign keys where relationships are required.
- Use constraints to protect important invariants.
- Use indexes for important query paths.
- Keep analytics views anonymized and research-safe.
- Avoid storing personally identifiable information in learning analytics exports.

## Review Checklist

Before proposing a schema change, answer:

- What user or research requirement requires this?
- Which tables, views, functions, policies, or indexes change?
- Is the change backward compatible?
- What migration file will be added?
- How will existing data be protected?
