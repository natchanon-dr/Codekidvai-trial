# Database Module

Run migrations in order:

1. `001_create_core_schema.sql`
2. `002_create_experiment_schema.sql`
3. `003_create_security_rpc_rls.sql`
4. `004_create_dataset_views.sql`
5. `005_create_admin_views.sql`
6. `006_seed_sql101.sql`

After a user registers, set admin role manually:

```sql
update public.mst_profiles
set role = 'admin'
where participant_code = 'YOUR_CODE';
```
