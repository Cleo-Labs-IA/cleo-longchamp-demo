begin;
-- Private lookup only. The application decides domain eligibility before enrolment.
create or replace function public.longchamp_find_login_user(p_email text)
returns table(user_id uuid,is_member boolean)
language sql stable security definer set search_path='' as $$
 select u.id,exists(select 1 from public.longchamp_members m where m.user_id=u.id)
 from auth.users u where lower(u.email)=lower(trim(p_email)) and not coalesce(u.is_sso_user,false)
 order by u.created_at,u.id limit 1;
$$;
revoke all on function public.longchamp_find_login_user(text) from public,anon,authenticated;
grant execute on function public.longchamp_find_login_user(text) to service_role;
notify pgrst,'reload schema';
commit;
