# CKV Supabase Rules

## Client Boundaries

- Browser clients may only use public anon configuration.
- Service-role clients must remain server-only.
- Admin clients must never be imported into Client Components.
- Secrets must never be committed, logged, or shown in screenshots.

## Row Level Security

- RLS should be enabled for user-owned or role-sensitive data.
- Policies must be tested from the perspective of each role.
- UI checks are not a substitute for RLS or server-side authorization.
- Teachers, students, and admins should receive only the data required for their role.

## Authentication

- Supabase Auth is the identity provider.
- Role and profile logic should be handled through trusted server-side paths.
- Ask before changing authentication or authorization behavior.
- Avoid exposing auth identifiers in analytics exports.

## Database Access

- Prefer typed data access helpers.
- Keep complex queries out of UI code.
- Use service and repository boundaries for shared workflows.
- Handle Supabase errors explicitly and safely.

## Research Data

Analytics exports must avoid direct personal identifiers:

- No email addresses.
- No `auth_user_id`.
- No display names.
- Prefer participant codes and anonymized identifiers.
