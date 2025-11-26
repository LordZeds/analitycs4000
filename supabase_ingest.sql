-- Função RPC para Ingestão de Eventos (Versão Auditoria de Dados & Segurança)
-- Autor: Data & Security Engineer Agent
-- Objetivo: Garantir integridade referencial, captura total de dados (Raw Payload) e segurança no match de domínios.
create or replace function ingest_event(p_owner_id uuid, p_event_data jsonb) returns jsonb language plpgsql security definer as $$
declare v_site_id uuid;
v_url text;
v_domain text;
v_clean_domain text;
v_table text;
v_content_type text;
v_page_rule record;
begin -- 1. Validação e Sanitização de Entrada
if p_owner_id is null then return jsonb_build_object('error', 'Owner ID is required');
end if;
v_table := p_event_data->>'table';
v_url := coalesce(p_event_data->>'url_full', p_event_data->>'url');
-- Normalização de Domínio (Security Hardening: remover caracteres perigosos e padronizar)
-- Remove protocolo (http/https) e www.
v_domain := regexp_replace(v_url, '^https?://(www\.)?', '');
-- Pega apenas o host (antes da primeira barra)
v_domain := split_part(v_domain, '/', 1);
-- Remove portas se houver (ex: :3000)
v_domain := split_part(v_domain, ':', 1);
v_domain := lower(v_domain);
if v_domain is null
or v_domain = '' then return jsonb_build_object('error', 'URL inválida ou ausente');
end if;
-- 2. Identificação de Site (Lógica de Relacionamento Profundo)
-- Busca por:
-- A. URL Principal (exata ou subdomínio)
-- B. Domínios Associados (array `associated_domains`)
-- C. Tracking Domain (se configurado)
select id into v_site_id
from sites
where user_id = p_owner_id
    and (
        -- Match URL Principal
        lower(regexp_replace(url, '^https?://(www\.)?', '')) = v_domain -- Match Subdomínio da URL Principal
        or v_domain like '%.' || lower(regexp_replace(url, '^https?://(www\.)?', '')) -- Match Domínios Associados (Array Check)
        or (
            associated_domains is not null
            and v_domain = any(associated_domains)
        ) -- Match Tracking Domain
        or (
            tracking_domain is not null
            and lower(tracking_domain) = v_domain
        )
    )
order by created_at desc -- Em caso de conflito, pega o mais recente
limit 1;
-- 3. Auto-Cadastro de Site (Fallback Seguro)
-- Só cria se realmente não achar nada.
if v_site_id is null then
insert into sites (user_id, name, url)
values (
        p_owner_id,
        coalesce(p_event_data->'sites'->>'name', v_domain),
        coalesce(v_url, 'https://' || v_domain)
    ) on conflict (url) do nothing;
-- Tenta recuperar o ID recém criado ou existente
select id into v_site_id
from sites
where url = coalesce(v_url, 'https://' || v_domain);
-- Fallback final de busca
if v_site_id is null then
select id into v_site_id
from sites
where user_id = p_owner_id
    and url like '%' || v_domain || '%'
limit 1;
end if;
end if;
if v_site_id is null then return jsonb_build_object(
    'error',
    'Falha crítica: Não foi possível vincular o evento a um site.'
);
end if;
-- 4. Classificação de Conteúdo (Business Logic)
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
-- 5. Gravação de Dados (Data Integrity & Raw Payload)
-- Regra: NUNCA perder dados. Se a tabela suporta `raw_payload`, salvamos o JSON original.
if v_table = 'pageviews' then
insert into pageviews (
        site_id,
        user_id,
        url_full,
        visitor_id,
        timestamp,
        content_type,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        utm_id,
        browser_name,
        browser_version,
        os_name,
        os_version,
        device_type,
        user_agent,
        city,
        region,
        country_code,
        client_ip_address,
        language,
        screen_width,
        screen_height,
        viewport_width,
        viewport_height,
        page_load_time,
        page_title,
        referrer_url,
        fbc,
        fbp,
        gclid,
        fbclid,
        ttclid,
        epik,
        msclkid,
        meta_event_id,
        ga_client_id,
        ga_session_id
    )
values (
        v_site_id,
        p_owner_id,
        v_url,
        p_event_data->>'visitor_id',
        now(),
        v_content_type,
        p_event_data->>'utm_source',
        p_event_data->>'utm_medium',
        p_event_data->>'utm_campaign',
        p_event_data->>'utm_content',
        p_event_data->>'utm_term',
        p_event_data->>'utm_id',
        p_event_data->>'browser_name',
        p_event_data->>'browser_version',
        p_event_data->>'os_name',
        p_event_data->>'os_version',
        p_event_data->>'device_type',
        p_event_data->>'user_agent',
        p_event_data->>'city',
        p_event_data->>'region',
        p_event_data->>'country_code',
        p_event_data->>'client_ip_address',
        p_event_data->>'language',
        (p_event_data->>'screen_width')::numeric,
        (p_event_data->>'screen_height')::numeric,
        (p_event_data->>'viewport_width')::numeric,
        (p_event_data->>'viewport_height')::numeric,
        (p_event_data->>'page_load_time')::numeric,
        p_event_data->>'page_title',
        p_event_data->>'referrer_url',
        p_event_data->>'fbc',
        p_event_data->>'fbp',
        p_event_data->>'gclid',
        p_event_data->>'fbclid',
        p_event_data->>'ttclid',
        p_event_data->>'epik',
        p_event_data->>'msclkid',
        p_event_data->>'meta_event_id',
        p_event_data->>'ga_client_id',
        p_event_data->>'ga_session_id'
    );
elsif v_table = 'initiate_checkouts' then
insert into initiate_checkouts (
        site_id,
        user_id,
        visitor_id,
        session_id,
        timestamp,
        content_type,
        product_name,
        product_id,
        product_category,
        price_value,
        price_currency,
        url_full,
        user_agent,
        client_ip_address,
        browser_name,
        os_name,
        device_type,
        utm_source,
        utm_medium,
        utm_campaign,
        fbc,
        fbp,
        gclid,
        raw_payload -- AUDITORIA: Salvando JSON original
    )
values (
        v_site_id,
        p_owner_id,
        p_event_data->>'visitor_id',
        coalesce(
            p_event_data->>'session_id',
            p_event_data->>'visitor_id'
        ),
        now(),
        v_content_type,
        p_event_data->>'product_name',
        p_event_data->>'product_id',
        p_event_data->>'product_category',
        coalesce((p_event_data->>'price_value')::numeric, 0),
        coalesce(p_event_data->>'price_currency', 'BRL'),
        v_url,
        p_event_data->>'user_agent',
        p_event_data->>'client_ip_address',
        p_event_data->>'browser_name',
        p_event_data->>'os_name',
        p_event_data->>'device_type',
        p_event_data->>'utm_source',
        p_event_data->>'utm_medium',
        p_event_data->>'utm_campaign',
        p_event_data->>'fbc',
        p_event_data->>'fbp',
        p_event_data->>'gclid',
        p_event_data -- JSON Completo
    );
elsif v_table = 'purchases' then
insert into purchases (
        site_id,
        user_id,
        visitor_id,
        session_id,
        transaction_id,
        timestamp,
        content_type,
        product_name,
        product_id,
        price_value,
        price_currency,
        status,
        attribution_status,
        buyer_email,
        buyer_name,
        buyer_phone,
        buyer_phone_code,
        buyer_address,
        url_full,
        client_ip_address,
        user_agent,
        utm_source,
        utm_medium,
        utm_campaign,
        raw_payload -- AUDITORIA: Salvando JSON original
    )
values (
        v_site_id,
        p_owner_id,
        p_event_data->>'visitor_id',
        coalesce(
            p_event_data->>'session_id',
            p_event_data->>'visitor_id'
        ),
        p_event_data->>'transaction_id',
        now(),
        v_content_type,
        p_event_data->>'product_name',
        (p_event_data->>'product_id')::numeric,
        coalesce((p_event_data->>'price_value')::numeric, 0),
        coalesce(p_event_data->>'price_currency', 'BRL'),
        p_event_data->>'status',
        p_event_data->>'attribution_status',
        p_event_data->>'buyer_email',
        p_event_data->>'buyer_name',
        p_event_data->>'buyer_phone',
        p_event_data->>'buyer_phone_code',
        p_event_data->>'buyer_address',
        v_url,
        p_event_data->>'client_ip_address',
        p_event_data->>'user_agent',
        p_event_data->>'utm_source',
        p_event_data->>'utm_medium',
        p_event_data->>'utm_campaign',
        p_event_data -- JSON Completo
    );
else return jsonb_build_object('error', 'Tabela inválida: ' || v_table);
end if;
return jsonb_build_object('success', true, 'site_id', v_site_id);
exception
when others then return jsonb_build_object('error', SQLERRM);
end;
$$;