-- Additive, isolated Longchamp tables. No existing client table is changed.
begin;
create table if not exists public.longchamp_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 added_at timestamptz not null default now()
);
create table if not exists public.longchamp_watch_state (
 id text primary key check(id='longchamp'),
 follows jsonb not null default '[]'::jsonb check(jsonb_typeof(follows)='array'),
 revision bigint not null default 0 check(revision>=0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id) on delete set null
);
insert into public.longchamp_watch_state(id) values ('longchamp') on conflict do nothing;
alter table public.longchamp_members enable row level security;
alter table public.longchamp_watch_state enable row level security;
revoke all on public.longchamp_members,public.longchamp_watch_state from anon,authenticated;
grant select on public.longchamp_members,public.longchamp_watch_state to authenticated;
grant all on public.longchamp_members,public.longchamp_watch_state to service_role;
create or replace function public.longchamp_is_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.longchamp_members where user_id=(select auth.uid()));
$$;
revoke all on function public.longchamp_is_member() from public,anon;
grant execute on function public.longchamp_is_member() to authenticated;
drop policy if exists longchamp_own_membership on public.longchamp_members;
create policy longchamp_own_membership on public.longchamp_members for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists longchamp_shared_read on public.longchamp_watch_state;
create policy longchamp_shared_read on public.longchamp_watch_state for select to authenticated using ((select public.longchamp_is_member()));

create or replace function public.longchamp_save_watch(expected_revision bigint,next_follows jsonb)
returns table(revision bigint,follows jsonb)
language plpgsql security definer set search_path='' as $$
declare current_revision bigint; item jsonb; digits text; checksum integer; n integer;
begin
 if not public.longchamp_is_member() then raise exception 'LONGCHAMP_FORBIDDEN' using errcode='42501'; end if;
 if expected_revision is null or expected_revision<0 or next_follows is null or jsonb_typeof(next_follows)<>'array' then raise exception 'LONGCHAMP_INVALID'; end if;
 if jsonb_array_length(next_follows)>200 or octet_length(next_follows::text)>100000 then raise exception 'LONGCHAMP_INVALID'; end if;
 for item in select value from jsonb_array_elements(next_follows) loop
  if jsonb_typeof(item)<>'object' or not (item ?& array['id','kind','value','markets','products','paused','includeRelated']) then raise exception 'LONGCHAMP_INVALID'; end if;
  if jsonb_typeof(item->'id')<>'string' or (item->>'id')!~'^[a-zA-Z0-9_-]{1,100}$' or jsonb_typeof(item->'value')<>'string' or length(item->>'value') not between 1 and 180
    or jsonb_typeof(item->'kind')<>'string' or (item->>'kind') not in ('substance','family','text') or jsonb_typeof(item->'paused')<>'boolean' or jsonb_typeof(item->'includeRelated')<>'boolean'
    or jsonb_typeof(item->'markets')<>'array' or jsonb_typeof(item->'products')<>'array' then raise exception 'LONGCHAMP_INVALID'; end if;
  if jsonb_array_length(item->'markets')=0 or jsonb_array_length(item->'products')=0 then raise exception 'LONGCHAMP_INVALID'; end if;
  if exists(select 1 from jsonb_array_elements_text(item->'markets') m where m is null or m not in ('EU','FR','US-CA','CN','JP','KR','CA','SA','AE'))
    or exists(select 1 from jsonb_array_elements_text(item->'products') p where p is null or p not in ('pliage','roseau','textile','souliers','lunettes','bijoux','emballages')) then raise exception 'LONGCHAMP_INVALID'; end if;
  if item->>'kind'='family' and item->>'value'<>'PFAS' then raise exception 'LONGCHAMP_INVALID'; end if;
  if item->>'kind'='text' and (item->>'value')!~'^[[:alnum:]-]+$' then raise exception 'LONGCHAMP_INVALID'; end if;
  if item->>'kind'='substance' then
   if (item->>'value')!~'^[0-9]{2,7}-[0-9]{2}-[0-9]$' then raise exception 'LONGCHAMP_INVALID'; end if;
   digits:=replace(item->>'value','-','');checksum:=0;
   for n in 1..length(digits)-1 loop checksum:=checksum+n*substring(digits,length(digits)-n,1)::integer;end loop;
   if checksum%10<>right(digits,1)::integer then raise exception 'LONGCHAMP_INVALID';end if;
  end if;
 end loop;
 if (select count(distinct value->>'id') from jsonb_array_elements(next_follows))<>jsonb_array_length(next_follows)
   or (select count(distinct (value->>'kind',value->>'value')) from jsonb_array_elements(next_follows))<>jsonb_array_length(next_follows) then raise exception 'LONGCHAMP_INVALID'; end if;
 select s.revision into current_revision from public.longchamp_watch_state s where id='longchamp' for update;
 if current_revision is null then raise exception 'LONGCHAMP_NOT_INITIALIZED';end if;
 -- A user edit conflict is an HTTP conflict, not a retryable transaction failure.
 if current_revision<>expected_revision then raise exception 'LONGCHAMP_CONFLICT' using errcode='PT409';end if;
 return query update public.longchamp_watch_state s set follows=next_follows,revision=current_revision+1,updated_at=now(),updated_by=auth.uid() where id='longchamp' returning s.revision,s.follows;
end;
$$;
revoke all on function public.longchamp_save_watch(bigint,jsonb) from public,anon;
grant execute on function public.longchamp_save_watch(bigint,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
