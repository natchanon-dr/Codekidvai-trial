insert into public.tb_academy (academy_code, academy_name, academy_description, is_active)
values ('KMITL', 'KMITL', 'King Mongkut''s Institute of Technology Ladkrabang', true)
on conflict (academy_code) do nothing;
