-- Independent database authorization oracle. All test identities/data are rolled back.
begin;
insert into auth.users(id) values ('c1041111-1111-4111-8111-111111111111'),('c1042222-2222-4222-8222-222222222222'),('c1043333-3333-4333-8333-333333333333');
insert into public.longchamp_members(user_id) values ('c1041111-1111-4111-8111-111111111111'),('c1042222-2222-4222-8222-222222222222');
insert into public.longchamp_otp_sessions(session_id,user_id) values ('c104aaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','c1041111-1111-4111-8111-111111111111'),('c104bbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','c1042222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','c1043333-3333-4333-8333-333333333333',true);
do $$begin
 if exists(select 1 from public.longchamp_watch_state) then raise exception 'Outsider can read';end if;
 begin perform public.longchamp_save_watch(0,'[]');raise exception 'Outsider can write';exception when insufficient_privilege then null;end;
 begin insert into public.longchamp_members(user_id) values ('c1043333-3333-4333-8333-333333333333');raise exception 'Outsider can self-admit';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','c1041111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"sub":"c1041111-1111-4111-8111-111111111111","session_id":"c104cccc-cccc-4ccc-8ccc-cccccccccccc"}',true);
do $$begin if exists(select 1 from public.longchamp_watch_state) then raise exception 'Native unapproved session can read';end if;begin perform public.longchamp_save_watch(0,'[]');raise exception 'Native unapproved session can write';exception when insufficient_privilege then null;end;end$$;
select set_config('request.jwt.claims','{"sub":"c1041111-1111-4111-8111-111111111111","session_id":"c104aaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
do $$declare rev bigint;begin
 select revision into rev from public.longchamp_watch_state;
 if rev is null then raise exception 'Member cannot read';end if;
 perform public.longchamp_save_watch(rev,'[{"id":"oracle","kind":"substance","value":"50-00-0","markets":["EU"],"products":["pliage"],"paused":false,"includeRelated":false}]');
 begin perform public.longchamp_save_watch(rev,'[]');raise exception 'Lost update allowed';exception when sqlstate 'PT409' then null;end;
 begin update public.longchamp_watch_state set follows='[]';raise exception 'Direct update bypass allowed';exception when insufficient_privilege then null;end;
 begin perform public.longchamp_save_watch(rev+1,'[{"id":"bad","kind":"substance","value":"307-24-5","markets":["EU"],"products":["pliage"],"paused":false,"includeRelated":false}]');raise exception 'Bad CAS allowed';exception when raise_exception then if sqlerrm<>'LONGCHAMP_INVALID' then raise;end if;end;
 begin perform public.longchamp_save_watch(rev+1,'[{"id":"bad","kind":null,"value":"50-00-0","markets":["EU"],"products":["pliage"],"paused":false,"includeRelated":false}]');raise exception 'Null kind allowed';exception when raise_exception then if sqlerrm<>'LONGCHAMP_INVALID' then raise;end if;end;
 begin perform public.longchamp_save_watch(rev+1,'[{"id":"bad","kind":"substance","value":"50-00-0","markets":[null],"products":["pliage"],"paused":false,"includeRelated":false}]');raise exception 'Null market allowed';exception when raise_exception then if sqlerrm<>'LONGCHAMP_INVALID' then raise;end if;end;
end$$;
select set_config('request.jwt.claim.sub','c1042222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"sub":"c1042222-2222-4222-8222-222222222222","session_id":"c104bbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
do $$begin
 if not exists(select 1 from public.longchamp_watch_state where follows->0->>'id'='oracle') then raise exception 'Second member cannot see shared edit';end if;
end$$;
set local role anon;
do $$begin
 begin perform * from public.longchamp_watch_state;raise exception 'Anonymous can read';exception when insufficient_privilege then null;end;
 begin perform public.longchamp_save_watch(0,'[]');raise exception 'Anonymous can write';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
select 'PASS: outsider, self-admission, shared members, CAS validation, null input, conflict, direct-write, anonymous; all fixtures rolled back' as verification;
