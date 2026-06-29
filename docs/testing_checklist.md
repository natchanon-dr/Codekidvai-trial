# Testing Checklist

## Environment
- [ ] `.env.local` configured
- [ ] `npm install` completed
- [ ] `npm run dev` works
- [ ] Browser console has no critical error

## Database
- [ ] Migration 001 runs
- [ ] Migration 002 runs
- [ ] Migration 003 runs
- [ ] Migration 004 runs
- [ ] Migration 005 runs
- [ ] Migration 006 seed runs

## Auth
- [ ] Register student
- [ ] Login student
- [ ] Profile created
- [ ] Consent accepted
- [ ] Admin role update works

## Student flow
- [ ] Student sees assigned tasks only
- [ ] Text task opens
- [ ] Run creates attempt
- [ ] Submit creates submission
- [ ] Block task opens
- [ ] Block add/move/delete logs events
- [ ] Session completed after submit
- [ ] Session abandoned when leaving

## Admin flow
- [ ] Dashboard loads
- [ ] Create batch
- [ ] Assign task
- [ ] Export CSV
- [ ] Data quality page works

## Privacy
- [ ] Export has no email
- [ ] Export has no auth_user_id
- [ ] Export has no display_name
- [ ] Student cannot read expected_answer
- [ ] Student cannot read correct_order
