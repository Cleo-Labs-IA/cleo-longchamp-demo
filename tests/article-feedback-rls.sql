begin;
insert into auth.users(id,email) values
 ('ca110001-1111-4111-8111-111111111111','article-one@example.invalid'),
 ('ca110002-2222-4222-8222-222222222222','article-two@example.invalid'),
 ('ca110003-3333-4333-8333-333333333333','article-outsider@example.invalid');
insert into public.longchamp_members(user_id) values('ca110001-1111-4111-8111-111111111111'),('ca110002-2222-4222-8222-222222222222');
set local role anon;
do $$begin begin perform public.longchamp_get_articles();raise exception 'Anon gained access';exception when insufficient_privilege then null;end;end$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ca110001-1111-4111-8111-111111111111","session_id":"ca119001-1111-4111-8111-111111111111"}',true);
do $$begin begin perform public.longchamp_get_articles();raise exception 'Non-OTP session gained access';exception when insufficient_privilege then null;end;end$$;
reset role;
insert into public.longchamp_otp_sessions(session_id,user_id) values
 ('ca119001-1111-4111-8111-111111111111','ca110001-1111-4111-8111-111111111111'),
 ('ca119002-2222-4222-8222-222222222222','ca110002-2222-4222-8222-222222222222');
set local role authenticated;
select public.longchamp_set_favorite('fr-empco-transposition',true);
select public.longchamp_save_review('fr-empco-transposition','like',4,'Utile pour nos produits.',0);
select set_config('request.jwt.claims','{"sub":"ca110002-2222-4222-8222-222222222222","session_id":"ca119002-2222-4222-8222-222222222222"}',true);
do $$declare data jsonb;begin
 data:=public.longchamp_get_articles();
 if data->'favorites'<>'[]'::jsonb then raise exception 'Another member sees personal favorites';end if;
 if exists(select 1 from public.longchamp_article_favorites) then raise exception 'RLS leaks personal favorites';end if;
 if not exists(select 1 from jsonb_array_elements(data->'reviews') r where r->>'author_id'='ca110001-1111-4111-8111-111111111111' and r->>'reaction'='like') then raise exception 'Team review missing';end if;
 begin update public.longchamp_article_reviews set comment='Impersonation';raise exception 'Direct mutation allowed';exception when insufficient_privilege then null;end;
end$$;
select public.longchamp_save_review('fr-empco-transposition','dislike',2,'À préciser.',0);
select set_config('request.jwt.claims','{"sub":"ca110001-1111-4111-8111-111111111111","session_id":"ca119001-1111-4111-8111-111111111111"}',true);
do $$begin
 begin perform public.longchamp_save_review('fr-empco-transposition','dislike',2,'Stale edit',0);raise exception 'Stale write accepted';exception when sqlstate 'PT409' then null;end;
 begin perform public.longchamp_save_review('fr-empco-transposition','like',6,'Bad rating',1);raise exception 'Invalid rating accepted';exception when raise_exception then if sqlerrm<>'LONGCHAMP_INVALID' then raise;end if;end;
 if (select count(*) from public.longchamp_article_reviews where article_key='fr-empco-transposition')<>2 then raise exception 'Author overwrote another review';end if;
end$$;
select public.longchamp_save_review('fr-empco-transposition',null,null,'',1);
select public.longchamp_set_favorite('fr-empco-transposition',false);
do $$begin
 if exists(select 1 from public.longchamp_article_favorites) then raise exception 'Favorite not removed';end if;
 if not exists(select 1 from public.longchamp_article_reviews where user_id='ca110002-2222-4222-8222-222222222222' and comment='À préciser.') then raise exception 'Other author lost review';end if;
end$$;
select set_config('request.jwt.claims','{"sub":"ca110003-3333-4333-8333-333333333333","session_id":"ca119002-2222-4222-8222-222222222222"}',true);
do $$begin
 if exists(select 1 from public.longchamp_article_reviews) then raise exception 'Outsider reads reviews';end if;
 begin perform public.longchamp_set_favorite('fr-empco-transposition',true);raise exception 'Outsider writes';exception when insufficient_privilege then null;end;
end$$;
reset role;
rollback;
select 'PASS: OTP gate, private favorites, shared reviews, separate authors, conflict, rating validation, removal and outsider denial; fixtures rolled back' as verification;
