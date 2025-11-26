-- Função RPC para Ingestão de Eventos (Lógica no Backend)
create or replace function ingest_event(p_owner_id uuid, p_event_data jsonb) returns jsonb language plpgsql security definer as $$
declare v_site_id uuid;
v_url text;
v_domain text;
v_table text;
v_content_type text;
v_page_rule record;
begin -- 1. Extrair dados básicos
v_table := p_event_data->>'table';
v_url := coalesce(p_event_data->>'url_full', p_event_data->>'url');
-- Normalizar Domínio (remover protocol e www)
v_domain := regexp_replace(v_url, '^https?://(www\.)?', '');
v_domain := split_part(v_domain, '/', 1);
v_domain := lower(v_domain);
if v_domain is null
or v_domain = '' then return jsonb_build_object('error', 'URL inválida ou ausente');
end if;
-- 2. Identificar Site (Match por Domínio ou Subdomínio)
select id into v_site_id
from sites
where user_id = p_owner_id
    and (
        lower(regexp_replace(url, '^https?://(www\.)?', '')) = v_domain
        or v_domain like '%.' || lower(regexp_replace(url, '^https?://(www\.)?', ''))
    )
limit 1;
-- 3. Auto-Cadastro de Site (se não existir)
if v_site_id is null then
insert into sites (user_id, name, url)
values (
        p_owner_id,
        coalesce(p_event_data->'sites'->>'name', v_domain),
        coalesce(v_url, 'https://' || v_domain)
    ) on conflict (url) do nothing;
-- Busca novamente caso o insert tenha sido ignorado (conflito) ou acabado de inserir
select id into v_site_id
from sites
where url = coalesce(v_url, 'https://' || v_domain);
-- Se ainda assim for null (ex: url diferente mas conflito de unique?), tenta buscar pelo dominio
if v_site_id is null then
select id into v_site_id
from sites
where user_id = p_owner_id
    and url like '%' || v_domain || '%'
limit 1;
end if;
end if;
if v_site_id is null then return jsonb_build_object('error', 'Falha ao identificar ou criar site');
end if;
-- 4. Classificação de Conteúdo (Page Rules)
v_content_type := coalesce(p_event_data->>'content_type', 'article');
if v_table = 'pageviews' then
select page_type into v_page_rule
from site_pages
where site_id = v_site_id
    and path = (
        select path
        from regexp_matches(v_url, 'https?://[^/]+(/.*)?') as path
    )
limit 1;
if found then v_content_type := v_page_rule.page_type;
end if;
elsif v_table in ('initiate_checkouts', 'purchases') then v_content_type := 'sales_page';
end if;
-- 5. Inserir na Tabela Correta
if v_table = 'pageviews' then
insert into pageviews (
        site_id,
        user_id,
        url_full,
        visitor_id,
        utm_source,
        city,
        device_type,
        timestamp,
        content_type
    )
values (
        v_site_id,
        p_owner_id,
        v_url,
        p_event_data->>'visitor_id',
        p_event_data->>'utm_source',
        p_event_data->>'city',
        p_event_data->>'device_type',
        now(),
        v_content_type
    );
elsif v_table = 'initiate_checkouts' then
insert into initiate_checkouts (
        site_id,
        user_id,
        visitor_id,
        product_name,
        price_value,
        timestamp,
        content_type
    )
values (
        v_site_id,
        p_owner_id,
        p_event_data->>'visitor_id',
        p_event_data->>'product_name',
        coalesce((p_event_data->>'price_value')::numeric, 0),
        now(),
        v_content_type
    );
elsif v_table = 'purchases' then
insert into purchases (
        site_id,
        user_id,
        visitor_id,
        transaction_id,
        product_name,
        price_value,
        status,
        buyer_email,
        buyer_name,
        timestamp,
        content_type
    )
values (
        v_site_id,
        p_owner_id,
        p_event_data->>'visitor_id',
        p_event_data->>'transaction_id',
        p_event_data->>'product_name',
        coalesce((p_event_data->>'price_value')::numeric, 0),
        p_event_data->>'status',
        p_event_data->>'buyer_email',
        p_event_data->>'buyer_name',
        now(),
        v_content_type
    );
else return jsonb_build_object('error', 'Tabela inválida: ' || v_table);
end if;
return jsonb_build_object('success', true, 'site_id', v_site_id);
exception
when others then return jsonb_build_object('error', SQLERRM);
end;
$$;