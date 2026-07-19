# CKV Testing Guide

## Testing Philosophy

Testing should protect the student workflow, teacher workflow, admin analytics flow, database safety, and thesis evidence quality. Add test coverage according to risk and blast radius.

## Required Checks

Run available checks after implementation:

```bash
npm run lint
```

When changes affect build behavior or server boundaries, also run:

```bash
npm run build
```

## Manual Smoke Tests

Use the checklist in `docs/testing_checklist.md` for end-to-end validation. Critical flows include:

- Register and login.
- Consent flow.
- Student dashboard.
- Student task run and submit.
- Teacher dashboard.
- Assignment and class management.
- Admin dashboard.
- Dataset export and data quality pages.

## Database Tests

When a migration is approved and added:

- Apply migrations in order.
- Confirm RLS behavior for each role.
- Confirm seed scripts still match schema.
- Confirm analytics views do not expose personal identifiers.

## API Tests

API route validation should cover:

- Unauthenticated requests.
- Unauthorized role access.
- Invalid input.
- Successful requests.
- Safe error responses.

## Regression Notes

When a bug is fixed, add a focused test or checklist item that would have caught it. Keep tests practical and tied to real CKV workflows.
