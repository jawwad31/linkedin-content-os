-- CREATE A COMPANY (run by hand in the Supabase SQL Editor; this is not a migration).
--
-- Replace the two values in the quotes, then run the whole statement. It adds one
-- empty company under your agency and shows its id. Nothing else is created: you
-- add the company's first admin from the app (see docs/company-accounts.md).
--
--   __AGENCY_ID__    the id of your agency. Find it with:  select id, name from public.agencies;
--   __COMPANY_NAME__ the company name, for example  Acme Co

insert into public.clients (agency_id, name)
select a.id, btrim('__COMPANY_NAME__')
from public.agencies a
where a.id = '__AGENCY_ID__'::uuid
  and length(btrim('__COMPANY_NAME__')) between 2 and 200
returning id, name, agency_id, created_at;
