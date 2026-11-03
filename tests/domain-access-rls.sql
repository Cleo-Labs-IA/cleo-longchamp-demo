begin;
insert into auth.users(id,email,is_sso_user) values
 ('c1047777-7777-4777-8777-777777777777','domain-oracle@cleolabs.co',false),
 ('c1048888-8888-4888-8888-888888888888','sso-oracle@longchamp.co',true);
set local role anon;
do $$begin begin perform public.longchamp_find_login_user('domain-oracle@cleolabs.co');raise exception 'Anonymous identity disclosure';exception when insufficient_privilege then null;end;end$$;
set local role authenticated;
do $$begin begin perform public.longchamp_find_login_user('domain-oracle@cleolabs.co');raise exception 'Authenticated identity disclosure';exception when insufficient_privilege then null;end;end$$;
set local role service_role;
do $$begin
 if not exists(select 1 from public.longchamp_find_login_user(' DOMAIN-ORACLE@CLEOLABS.CO ') where user_id='c1047777-7777-4777-8777-777777777777' and not is_member) then raise exception 'Existing identity not resolved';end if;
 if exists(select 1 from public.longchamp_find_login_user('missing-oracle@cleolabs.co')) then raise exception 'Unknown identity fabricated';end if;
 if exists(select 1 from public.longchamp_find_login_user('sso-oracle@longchamp.co')) then raise exception 'SSO identity confused with email identity';end if;
 insert into public.longchamp_members(user_id) values('c1047777-7777-4777-8777-777777777777');
 if not exists(select 1 from public.longchamp_find_login_user('domain-oracle@cleolabs.co') where is_member) then raise exception 'Membership not resolved';end if;
end$$;
reset role;
rollback;
select 'PASS: private lookup, normalized existing identity, no fabricated user, SSO isolation and membership; all fixtures rolled back' as verification;
