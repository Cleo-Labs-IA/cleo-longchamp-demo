begin;
create table if not exists public.longchamp_login_codes (
 user_id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 challenge_hash text not null unique check(challenge_hash~'^[a-f0-9]{64}$'),
 requested_at timestamptz not null,
 expires_at timestamptz not null,
 attempts integer not null default 0 check(attempts between 0 and 5),
 delivered boolean not null default false,
 consumed boolean not null default false
);
alter table public.longchamp_login_codes enable row level security;
revoke all on public.longchamp_login_codes from public,anon,authenticated;
grant all on public.longchamp_login_codes to service_role;
create table if not exists public.longchamp_otp_sessions (
 session_id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 approved_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days'
);
alter table public.longchamp_otp_sessions enable row level security;
revoke all on public.longchamp_otp_sessions from public,anon,authenticated;
grant all on public.longchamp_otp_sessions to service_role;
-- Enforce the same OTP gate for direct REST/RPC calls, not only application routes.
create or replace function public.longchamp_is_member() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.longchamp_members m join public.longchamp_otp_sessions s on s.user_id=m.user_id
 where m.user_id=(select auth.uid()) and s.session_id::text=(select auth.jwt()->>'session_id') and s.expires_at>now());
$$;
revoke all on function public.longchamp_is_member() from public,anon;
grant execute on function public.longchamp_is_member() to authenticated;
create table if not exists public.longchamp_login_throttles (
 email_hash text primary key check(email_hash~'^[a-f0-9]{64}$'),requested_at timestamptz not null
);
create index if not exists longchamp_login_throttle_date on public.longchamp_login_throttles(requested_at);
alter table public.longchamp_login_throttles enable row level security;
revoke all on public.longchamp_login_throttles from public,anon,authenticated;
grant all on public.longchamp_login_throttles to service_role;
create or replace function public.longchamp_throttle_login(p_email_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed text;
begin
 delete from public.longchamp_login_throttles where requested_at<now()-interval '1 day';
 insert into public.longchamp_login_throttles as t(email_hash,requested_at) values(p_email_hash,now())
 on conflict(email_hash) do update set requested_at=excluded.requested_at where t.requested_at<=now()-interval '60 seconds'
 returning t.email_hash into changed;
 if changed is null then raise exception 'LONGCHAMP_CODE_RATE_LIMIT' using errcode='PT429';end if;
 return true;
end;
$$;

create or replace function public.longchamp_begin_login(p_user_id uuid,p_challenge_hash text)
returns table(email text) language plpgsql security definer set search_path='' as $$
declare member_email text;changed uuid;
begin
 select u.email into member_email from auth.users u join public.longchamp_members m on m.user_id=u.id where u.id=p_user_id;
 if member_email is null then raise exception 'LONGCHAMP_FORBIDDEN' using errcode='42501';end if;
 insert into public.longchamp_login_codes as c(user_id,email,challenge_hash,requested_at,expires_at)
 values(p_user_id,member_email,p_challenge_hash,now(),now()+interval '10 minutes')
 on conflict(user_id) do update set email=excluded.email,challenge_hash=excluded.challenge_hash,requested_at=excluded.requested_at,expires_at=excluded.expires_at,attempts=0,delivered=false,consumed=false
 returning c.user_id into changed;
 return query select member_email;
end;
$$;
create or replace function public.longchamp_try_login(p_challenge_hash text)
returns table(user_id uuid,email text) language sql security definer set search_path='' as $$
 update public.longchamp_login_codes c set attempts=c.attempts+1
 where c.challenge_hash=p_challenge_hash and c.delivered and not c.consumed and c.expires_at>now() and c.attempts<5
 and exists(select 1 from public.longchamp_members m where m.user_id=c.user_id)
 returning c.user_id,c.email;
$$;
create or replace function public.longchamp_complete_login(p_challenge_hash text)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed uuid;
begin
 update public.longchamp_login_codes c set consumed=true
 where c.challenge_hash=p_challenge_hash and c.delivered and not c.consumed and c.expires_at>now()
 and exists(select 1 from public.longchamp_members m where m.user_id=c.user_id)
 returning c.user_id into changed;
 return changed is not null;
end;
$$;
revoke all on function public.longchamp_throttle_login(text),public.longchamp_begin_login(uuid,text),public.longchamp_try_login(text),public.longchamp_complete_login(text) from public,anon,authenticated;
grant execute on function public.longchamp_throttle_login(text),public.longchamp_begin_login(uuid,text),public.longchamp_try_login(text),public.longchamp_complete_login(text) to service_role;
notify pgrst,'reload schema';
commit;
