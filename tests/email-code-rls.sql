begin;
insert into auth.users(id,email) values ('c1044444-4444-4444-8444-444444444444','otp-oracle@example.invalid');
insert into public.longchamp_members(user_id) values ('c1044444-4444-4444-8444-444444444444');
set local role anon;
do $$begin
 begin perform * from public.longchamp_login_codes;raise exception 'Anonymous can read challenges';exception when insufficient_privilege then null;end;
 begin perform public.longchamp_begin_login('c1044444-4444-4444-8444-444444444444',repeat('a',64));raise exception 'Anonymous can issue code';exception when insufficient_privilege then null;end;
 begin perform public.longchamp_throttle_login(repeat('c',64));raise exception 'Anonymous can consume private rate budget';exception when insufficient_privilege then null;end;
end$$;
set local role authenticated;
do $$begin
 begin perform * from public.longchamp_login_codes;raise exception 'User can read challenges';exception when insufficient_privilege then null;end;
 begin perform public.longchamp_try_login(repeat('a',64));raise exception 'User can bypass attempt limits';exception when insufficient_privilege then null;end;
end$$;
set local role service_role;
select public.longchamp_throttle_login(repeat('c',64));
do $$begin
 begin perform public.longchamp_throttle_login(repeat('c',64));raise exception 'Uniform throttle missing';exception when sqlstate 'PT429' then null;end;
end$$;
select * from public.longchamp_begin_login('c1044444-4444-4444-8444-444444444444',repeat('a',64));
do $$declare n integer;begin
 if not exists(select 1 from public.longchamp_login_codes where expires_at=requested_at+interval '10 minutes') then raise exception 'Wrong expiry';end if;
 if exists(select 1 from public.longchamp_try_login(repeat('a',64))) then raise exception 'Undelivered code usable';end if;
 update public.longchamp_login_codes set delivered=true;
 for n in 1..5 loop if not exists(select 1 from public.longchamp_try_login(repeat('a',64))) then raise exception 'Attempt missing';end if;end loop;
 if exists(select 1 from public.longchamp_try_login(repeat('a',64))) then raise exception 'Excess attempt allowed';end if;
 update public.longchamp_login_codes set attempts=0,expires_at=now()-interval '1 second';
 if exists(select 1 from public.longchamp_try_login(repeat('a',64))) then raise exception 'Expired code usable';end if;
 update public.longchamp_login_codes set requested_at=now()-interval '61 seconds';
 perform public.longchamp_begin_login('c1044444-4444-4444-8444-444444444444',repeat('b',64));
 update public.longchamp_login_codes set delivered=true;
 if exists(select 1 from public.longchamp_try_login(repeat('a',64))) then raise exception 'Replaced challenge usable';end if;
 if not public.longchamp_complete_login(repeat('b',64)) then raise exception 'Cannot finish';end if;
 if public.longchamp_complete_login(repeat('b',64)) then raise exception 'Replay allowed';end if;
 if exists(select 1 from public.longchamp_try_login(repeat('b',64))) then raise exception 'Consumed code usable';end if;
end$$;
reset role;
rollback;
select 'PASS: private challenge storage, service-only RPC, ten-minute expiry, resend cooldown, attempts cap, replacement and consumption; fixtures rolled back' as verification;
