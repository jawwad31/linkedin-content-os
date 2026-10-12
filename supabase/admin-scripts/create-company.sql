-- CREATE AN ACCOUNT (one company) (run by hand in the Supabase SQL Editor; this is not a migration).
--
-- Replace the two values below, then run the whole statement. It adds one empty
-- company and makes the person with that email its first Account Admin. They can then
-- sign in, fill in Business Settings and add their team under Settings, Team access.
--
--   __COMPANY_NAME__  the company name, for example  Acme Co
--   __ADMIN_EMAIL__   the email of the first Account Admin. That person must already have a
--                     login: create it first in Supabase, Authentication, Users, Add user.
--
-- If the result is empty, nothing was created: check the email has a login and the name
-- is 2 to 200 characters. (The database still keeps an internal agency record that every
-- company hangs from; this script uses it for you. You never need to see or type it.)

with the_agency as (
  select id from public.agencies where deleted_at is null order by created_at limit 1
), the_admin as (
  select id from auth.users where lower(email) = lower(btrim('__ADMIN_EMAIL__')) limit 1
), new_company as (
  insert into public.clients (agency_id, name)
  select the_agency.id, btrim('__COMPANY_NAME__')
  from the_agency, the_admin
  where length(btrim('__COMPANY_NAME__')) between 2 and 200
  returning id, name, created_at
), new_access as (
  insert into public.client_access (
    client_id, user_id, role, invitation_status, permissions, invited_email, accepted_at
  )
  select new_company.id, the_admin.id, 'client_admin', 'accepted', '{}'::text[],
         lower(btrim('__ADMIN_EMAIL__')), now()
  from new_company, the_admin
  returning client_id
)
select new_company.id, new_company.name, new_company.created_at,
       lower(btrim('__ADMIN_EMAIL__')) as first_admin
from new_company
join new_access on new_access.client_id = new_company.id;
