-- Only future additions generate notifications. Existing follows are never backfilled.
begin;
create table public.longchamp_watch_notifications (
 id uuid primary key default gen_random_uuid(),
 revision bigint not null unique,
 items jsonb not null check(jsonb_typeof(items)='array' and jsonb_array_length(items)>0),
 created_at timestamptz not null default now(),
 attempts integer not null default 0,
 first_attempt_at timestamptz,
 available_at timestamptz not null default now(),
 claim_token uuid,
 lease_until timestamptz,
 sent_at timestamptz,
 last_error text
);
alter table public.longchamp_watch_notifications enable row level security;
revoke all on public.longchamp_watch_notifications from public,anon,authenticated;
grant select on public.longchamp_watch_notifications to service_role;

create function public.longchamp_queue_watch_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare added jsonb;
begin
 select jsonb_agg(n.item order by n.position) into added
 from jsonb_array_elements(new.follows) with ordinality n(item,position)
 where not exists (
  select 1 from jsonb_array_elements(old.follows) o(item)
  where lower(btrim(o.item->>'kind'))=lower(btrim(n.item->>'kind'))
    and lower(btrim(o.item->>'value'))=lower(btrim(n.item->>'value'))
 );
 if added is not null then
  insert into public.longchamp_watch_notifications(revision,items) values(new.revision,added);
 end if;
 return new;
end;
$$;
revoke all on function public.longchamp_queue_watch_notification() from public,anon,authenticated,service_role;
create trigger longchamp_watch_notification_added after update on public.longchamp_watch_state
for each row execute function public.longchamp_queue_watch_notification();

create function public.longchamp_claim_watch_notifications(p_limit integer default 3)
returns table(id uuid,claim_token uuid,items jsonb,revision bigint,created_at timestamptz)
language sql security definer set search_path='' as $$
 with candidates as (
  select q.id from public.longchamp_watch_notifications q
  where q.sent_at is null and q.available_at<=now() and (q.lease_until is null or q.lease_until<=now())
    -- Resend retains idempotency keys for 24 hours. Stop earlier for manual review.
    and (q.first_attempt_at is null or q.first_attempt_at>now()-interval '23 hours')
  order by q.created_at,q.id for update skip locked limit greatest(0,least(coalesce(p_limit,3),3))
 ), claimed as (
  update public.longchamp_watch_notifications q
  set claim_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=q.attempts+1,
      first_attempt_at=coalesce(q.first_attempt_at,now())
  from candidates c where q.id=c.id returning q.*
 ) select c.id,c.claim_token,c.items,c.revision,c.created_at from claimed c;
$$;

create function public.longchamp_finish_watch_notification(p_id uuid,p_claim_token uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 update public.longchamp_watch_notifications q
 set sent_at=case when p_success then now() else null end,
     available_at=case when p_success then q.available_at else now()+make_interval(secs=>least(3600,30*power(2,least(q.attempts,7)))::integer) end,
     last_error=case when p_success then null else left(coalesce(p_error,'Email failed'),500) end,
     claim_token=null,lease_until=null
 where q.id=p_id and q.claim_token=p_claim_token and q.sent_at is null and q.lease_until>now();
 get diagnostics changed=row_count;
 return changed=1;
end;
$$;
revoke all on function public.longchamp_claim_watch_notifications(integer) from public,anon,authenticated;
revoke all on function public.longchamp_finish_watch_notification(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.longchamp_claim_watch_notifications(integer) to service_role;
grant execute on function public.longchamp_finish_watch_notification(uuid,uuid,boolean,text) to service_role;
notify pgrst,'reload schema';
commit;
