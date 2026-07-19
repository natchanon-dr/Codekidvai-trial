# CKV Security Rules

## Secrets

- Never expose secrets.
- Never commit `.env`, `.env.local`, service role keys, database URLs, or access tokens.
- Never print secrets in logs or terminal output.
- Never edit `.env` files unless the user explicitly asks.

## Authentication and Authorization

- Ask before changing authentication behavior.
- Ask before changing authorization behavior.
- Enforce access server-side.
- Treat UI hiding as convenience only.
- Keep admin paths protected.

## Data Protection

- Protect student data and research participant data.
- Do not expose email, `auth_user_id`, display name, or other direct identifiers in analytics exports.
- Use participant codes or anonymized identifiers for research datasets.
- Keep data exports limited to required research fields.

## Input Validation

- Validate all external input.
- Treat client input as untrusted.
- Use DTOs and schema validation patterns where appropriate.
- Return safe errors to clients.

## Dependency Safety

- Do not add dependencies unless necessary.
- Ask before changing package manager.
- Review package purpose and maintenance status before adoption.

## Operational Safety

- Do not delete files without explicit approval.
- Do not run destructive database commands without explicit approval.
- Do not modify build configuration without explicit approval.
- Do not bypass RLS using service-role access unless the workflow requires it and remains server-only.
