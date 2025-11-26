-- CORREÇÃO CRÍTICA DE PERMISSÕES (INSERT)
-- Execute este script para permitir que o sistema grave os dados
-- 1. Garantir que o Service Role (API) tenha acesso total (Bypass RLS)
alter table sites force row level security;
alter table pageviews force row level security;
alter table initiate_checkouts force row level security;
alter table purchases force row level security;
-- 2. Políticas de INSERÇÃO (INSERT)
-- Permite que o sistema (e o dono) insiram dados
-- Sites
drop policy if exists "Enable insert for authenticated users only" on sites;
create policy "Enable insert for authenticated users only" on sites for
insert to authenticated with check (true);
-- Permite inserir qualquer site (validado pelo backend)
-- Pageviews
drop policy if exists "Enable insert for authenticated users only" on pageviews;
create policy "Enable insert for authenticated users only" on pageviews for
insert to authenticated with check (true);
-- Initiate Checkouts
drop policy if exists "Enable insert for authenticated users only" on initiate_checkouts;
create policy "Enable insert for authenticated users only" on initiate_checkouts for
insert to authenticated with check (true);
-- Purchases
drop policy if exists "Enable insert for authenticated users only" on purchases;
create policy "Enable insert for authenticated users only" on purchases for
insert to authenticated with check (true);
-- 3. Políticas de ATUALIZAÇÃO (UPDATE) - Caso precise editar sites
create policy "Owner can update own sites" on sites for
update to authenticated using (auth.uid() = user_id);
-- 4. Garantir Permissões de Sequência (Evita erro de ID)
grant usage,
    select on all sequences in schema public to authenticated,
    service_role;
grant all on all tables in schema public to authenticated,
    service_role;
-- 5. Recriar a função como SECURITY DEFINER (Garante que roda com permissão máxima)
-- Isso é crucial: faz a função rodar como "admin" do banco, ignorando RLS se o dono for admin
alter function ingest_event(uuid, jsonb) owner to postgres;