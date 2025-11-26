-- Script para Corrigir Permissões RLS (Row Level Security)
-- Necessário para que o Realtime funcione no Dashboard
-- 1. Habilitar RLS nas tabelas (se não estiver)
alter table pageviews enable row level security;
alter table initiate_checkouts enable row level security;
alter table purchases enable row level security;
alter table sites enable row level security;
alter table site_pages enable row level security;
-- 2. Criar Políticas de Leitura (SELECT) para o Dono
-- Permite que você veja apenas os seus próprios dados no Dashboard
-- Pageviews
drop policy if exists "Owner can view own pageviews" on pageviews;
create policy "Owner can view own pageviews" on pageviews for
select to authenticated using (auth.uid() = user_id);
-- Initiate Checkouts
drop policy if exists "Owner can view own checkouts" on initiate_checkouts;
create policy "Owner can view own checkouts" on initiate_checkouts for
select to authenticated using (auth.uid() = user_id);
-- Purchases
drop policy if exists "Owner can view own purchases" on purchases;
create policy "Owner can view own purchases" on purchases for
select to authenticated using (auth.uid() = user_id);
-- Sites
drop policy if exists "Owner can view own sites" on sites;
create policy "Owner can view own sites" on sites for
select to authenticated using (auth.uid() = user_id);
-- Site Pages
drop policy if exists "Owner can view own site pages" on site_pages;
create policy "Owner can view own site pages" on site_pages for
select to authenticated using (
        auth.uid() = (
            select user_id
            from sites
            where id = site_pages.site_id
        )
    );
-- 3. Garantir que o Realtime está ativo (Reforço)
begin;
alter publication supabase_realtime
add table pageviews;
alter publication supabase_realtime
add table initiate_checkouts;
alter publication supabase_realtime
add table purchases;
commit;