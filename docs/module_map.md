# Module Map

## 1. Auth & Profile Module
- Register
- Login
- Profile creation
- Role management
- Consent flow

Files:
- `web-nextjs/app/register/page.tsx`
- `web-nextjs/app/login/page.tsx`
- `web-nextjs/app/consent/page.tsx`
- `web-nextjs/services/profile-service.ts`
- `web-nextjs/services/consent-service.ts`

## 2. Student Learning Module
- Student dashboard
- Assigned tasks
- Text SQL task
- Block SQL task
- Run and submit answer
- Session abandoned handling

Files:
- `web-nextjs/app/student/dashboard/page.tsx`
- `web-nextjs/app/student/task/[taskId]/page.tsx`
- `web-nextjs/components/BlockSqlBuilder.tsx`
- `web-nextjs/services/student-assignment-service.ts`
- `web-nextjs/services/student-answer-api-service.ts`
- `web-nextjs/services/student-block-service.ts`

## 3. Admin Module
- Admin dashboard
- Experiment batch
- Dataset export
- Data quality

Files:
- `web-nextjs/app/admin/dashboard/page.tsx`
- `web-nextjs/app/admin/experiments/page.tsx`
- `web-nextjs/app/admin/dataset/page.tsx`
- `web-nextjs/app/admin/data-quality/page.tsx`
- `web-nextjs/services/admin-*.ts`

## 4. API Module
- Server-side scoring
- Submit answer
- Leave session
- Dashboard data
- Dataset export
- Data quality

Files:
- `web-nextjs/app/api/student/*/route.ts`
- `web-nextjs/app/api/admin/*/route.ts`
- `web-nextjs/lib/api-auth.ts`
- `web-nextjs/lib/server-dataset-utils.ts`

## 5. Database Module
- Master tables
- Transaction tables
- Experiment tables
- RLS policies
- RPC functions
- Dataset views
- Admin views
- Seed data

Files:
- `database/migrations/*.sql`

## 6. Analysis Module
- Load dataset
- Data quality check
- Feature engineering
- Baseline ML
- Sequence prep

Files:
- `notebooks/*.ipynb`
