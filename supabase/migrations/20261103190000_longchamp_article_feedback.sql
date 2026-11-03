-- Personal bookmarks and team reviews; the existing native OTP gate applies throughout.
begin;
create table public.longchamp_article_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 article_key text not null check(article_key~'^[a-zA-Z0-9_-]{1,180}$'),
 created_at timestamptz not null default now(),
 primary key(user_id,article_key)
);
create table public.longchamp_article_reviews (
 user_id uuid not null references auth.users(id) on delete cascade,
 article_key text not null check(article_key~'^[a-zA-Z0-9_-]{1,180}$'),
 reaction text check(reaction in ('like','dislike')),
 rating integer check(rating between 1 and 5),
 comment text not null default '' check(length(comment)<=2000),
 revision bigint not null default 1 check(revision>0),
 updated_at timestamptz not null default now(),
 primary key(user_id,article_key)
);
alter table public.longchamp_article_favorites enable row level security;
alter table public.longchamp_article_reviews enable row level security;
revoke all on public.longchamp_article_favorites,public.longchamp_article_reviews from public,anon,authenticated;
grant select on public.longchamp_article_favorites,public.longchamp_article_reviews to authenticated;
grant all on public.longchamp_article_favorites,public.longchamp_article_reviews to service_role;
create policy longchamp_own_favorites on public.longchamp_article_favorites for select to authenticated
 using(user_id=(select auth.uid()) and (select public.longchamp_is_member()));
create policy longchamp_team_reviews on public.longchamp_article_reviews for select to authenticated
 using((select public.longchamp_is_member()));

create function public.longchamp_set_favorite(p_article_key text,p_favorite boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not public.longchamp_is_member() then raise exception 'LONGCHAMP_FORBIDDEN' using errcode='42501';end if;
 if p_article_key is null or p_article_key!~'^[a-zA-Z0-9_-]{1,180}$' or p_favorite is null then raise exception 'LONGCHAMP_INVALID';end if;
 if p_favorite then
  insert into public.longchamp_article_favorites(user_id,article_key) values(auth.uid(),p_article_key) on conflict do nothing;
 else delete from public.longchamp_article_favorites where user_id=auth.uid() and article_key=p_article_key;end if;
 return true;
end;$$;

create function public.longchamp_save_review(p_article_key text,p_reaction text,p_rating integer,p_comment text,p_expected_revision bigint)
returns bigint language plpgsql security definer set search_path='' as $$
declare current_revision bigint;
begin
 if not public.longchamp_is_member() then raise exception 'LONGCHAMP_FORBIDDEN' using errcode='42501';end if;
 if p_article_key is null or p_article_key!~'^[a-zA-Z0-9_-]{1,180}$' or (p_reaction is not null and p_reaction not in ('like','dislike')) or (p_rating is not null and p_rating not between 1 and 5) or p_comment is null or length(p_comment)>2000 or p_expected_revision is null or p_expected_revision<0 then raise exception 'LONGCHAMP_INVALID';end if;
 -- Serialize only this author's review of this article, including the initial insert.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||p_article_key,0));
 select revision into current_revision from public.longchamp_article_reviews where user_id=auth.uid() and article_key=p_article_key;
 if coalesce(current_revision,0)<>p_expected_revision then raise exception 'LONGCHAMP_REVIEW_CONFLICT' using errcode='PT409';end if;
 insert into public.longchamp_article_reviews(user_id,article_key,reaction,rating,comment,revision)
 values(auth.uid(),p_article_key,p_reaction,p_rating,trim(p_comment),coalesce(current_revision,0)+1)
 on conflict(user_id,article_key) do update set reaction=excluded.reaction,rating=excluded.rating,comment=excluded.comment,revision=excluded.revision,updated_at=now();
 return coalesce(current_revision,0)+1;
end;$$;

create function public.longchamp_get_articles()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not public.longchamp_is_member() then raise exception 'LONGCHAMP_FORBIDDEN' using errcode='42501';end if;
 return jsonb_build_object('viewer_id',auth.uid(),
  'favorites',coalesce((select jsonb_agg(article_key order by created_at desc) from public.longchamp_article_favorites where user_id=auth.uid()),'[]'::jsonb),
  'reviews',coalesce((select jsonb_agg(jsonb_build_object('article_key',r.article_key,'author_id',r.user_id,'author_label',u.email,'reaction',r.reaction,'rating',r.rating,'comment',r.comment,'revision',r.revision,'updated_at',r.updated_at) order by r.updated_at desc)
   from public.longchamp_article_reviews r join auth.users u on u.id=r.user_id),'[]'::jsonb));
end;$$;
revoke all on function public.longchamp_set_favorite(text,boolean),public.longchamp_save_review(text,text,integer,text,bigint),public.longchamp_get_articles() from public,anon;
grant execute on function public.longchamp_set_favorite(text,boolean),public.longchamp_save_review(text,text,integer,text,bigint),public.longchamp_get_articles() to authenticated;
notify pgrst,'reload schema';
commit;
