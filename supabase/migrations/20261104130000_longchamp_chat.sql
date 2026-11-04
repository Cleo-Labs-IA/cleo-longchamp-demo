begin;
create table public.longchamp_chat_threads (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 active_turn uuid,
 busy_until timestamptz
);
create index longchamp_chat_owner on public.longchamp_chat_threads(user_id);
alter table public.longchamp_chat_threads enable row level security;
revoke all on public.longchamp_chat_threads from public,anon,authenticated;
grant select on public.longchamp_chat_threads to authenticated;
grant all on public.longchamp_chat_threads to service_role;
create policy longchamp_private_chat on public.longchamp_chat_threads for select to authenticated using(user_id=(select auth.uid()) and (select public.longchamp_is_member()));
create function public.longchamp_claim_chat_turn(p_thread_id uuid,p_turn_id uuid)
returns table(id uuid,user_id uuid) language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not public.longchamp_is_member() then raise exception 'LONGCHAMP_FORBIDDEN' using errcode='42501';end if;
 if p_turn_id is null then raise exception 'LONGCHAMP_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('longchamp-chat:'||auth.uid()::text,0));
 if exists(select 1 from public.longchamp_chat_threads t where t.user_id=auth.uid() and t.busy_until>now()) then raise exception 'LONGCHAMP_CHAT_BUSY' using errcode='PT429';end if;
 if p_thread_id is null then insert into public.longchamp_chat_threads(user_id) values(auth.uid()) returning longchamp_chat_threads.id into target;
 else select t.id into target from public.longchamp_chat_threads t where t.id=p_thread_id and t.user_id=auth.uid();
  if target is null then raise exception 'LONGCHAMP_FORBIDDEN' using errcode='42501';end if;
 end if;
 update public.longchamp_chat_threads t set active_turn=p_turn_id,busy_until=now()+interval '6 minutes' where t.id=target;
 return query select t.id,t.user_id from public.longchamp_chat_threads t where t.id=target;
end;$$;
create function public.longchamp_release_chat_turn(p_thread_id uuid,p_turn_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.longchamp_is_member() then raise exception 'LONGCHAMP_FORBIDDEN' using errcode='42501';end if;
 update public.longchamp_chat_threads set active_turn=null,busy_until=null where id=p_thread_id and user_id=auth.uid() and active_turn=p_turn_id;
 return found;
end;$$;
revoke all on function public.longchamp_claim_chat_turn(uuid,uuid),public.longchamp_release_chat_turn(uuid,uuid) from public,anon;
grant execute on function public.longchamp_claim_chat_turn(uuid,uuid),public.longchamp_release_chat_turn(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
