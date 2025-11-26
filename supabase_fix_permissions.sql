-- Habilitar RLS nas tabelas (Segurança Básica)
alter table sites enable row level security;
alter table pageviews enable row level security;
alter table initiate_checkouts enable row level security;
alter table purchases enable row level security;
-- Políticas de INSERT (Permitir que autenticados gravem)
-- Nota: A ingestão via RPC usa SECURITY DEFINER, então isso é para uso direto se necessário
create policy "Enable insert for authenticated users only" on sites for
insert to authenticated with check (true);
create policy "Enable insert for authenticated users only" on pageviews for
insert to authenticated with check (true);
create policy "Enable insert for authenticated users only" on initiate_checkouts for
insert to authenticated with check (true);
create policy "Enable insert for authenticated users only" on purchases for
insert to authenticated with check (true);
-- Políticas de UPDATE (Necessário para sites)
create policy "Enable update for users based on user_id" on sites for
update using (auth.uid() = user_id);
-- Permissões para tabelas principais
grant all on sites to authenticated,
    service_role;
grant all on pageviews to authenticated,
    service_role;
grant all on initiate_checkouts to authenticated,
    service_role;
grant all on purchases to authenticated,
    service_role;
-- Permissões para tabelas de Log e Integração (Descobertas na Auditoria)
-- Importante para evitar erros de "permission denied" se o dashboard tentar ler logs
grant all on ga4_events to authenticated,
    service_role;
grant all on meta_capi_events to authenticated,
    service_role;
grant all on hotmart_webhook_logs to authenticated,
    service_role;
grant all on external_webhook_logs to authenticated,
    service_role;
grant all on cleanup_logs to authenticated,
    service_role;
grant all on rate_limit_tracker to authenticated,
    service_role;
-- Permissões de Sequência (para garantir inserts)
grant usage,
    select on all sequences in schema public to authenticated,
    service_role;
-- Garantir que a função RPC rode como definer (bypassing RLS para ingestão)
alter function ingest_event(uuid, jsonb) owner to postgres;
grant execute on function ingest_event(uuid, jsonb) to authenticated,
    service_role,
    anon;