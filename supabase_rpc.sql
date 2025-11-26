-- Função RPC para buscar dados do Dashboard de forma otimizada
create or replace function get_dashboard_data(p_site_id uuid, p_period text) returns json language plpgsql security definer as $$
declare v_start_date timestamptz;
v_kpis json;
v_funnel json;
v_evolution json;
v_top_pages json;
v_recent_sales json;
begin -- 1. Definir Data de Início
if p_period = 'today' then v_start_date := date_trunc('day', now());
elsif p_period = '7d' then v_start_date := now() - interval '7 days';
elsif p_period = '30d' then v_start_date := now() - interval '30 days';
else v_start_date := now() - interval '7 days';
-- Default
end if;
-- 2. Calcular KPIs
select json_build_object(
        'uniqueVisitors',
        count(distinct visitor_id),
        'uniqueCheckouts',
        (
            select count(distinct visitor_id)
            from initiate_checkouts
            where site_id = p_site_id
                and timestamp >= v_start_date
        ),
        'totalSales',
        (
            select count(*)
            from purchases
            where site_id = p_site_id
                and timestamp >= v_start_date
        ),
        'revenue',
        coalesce(
            (
                select sum(price_value)
                from purchases
                where site_id = p_site_id
                    and timestamp >= v_start_date
            ),
            0
        )
    ) into v_kpis
from pageviews
where site_id = p_site_id
    and timestamp >= v_start_date;
-- 3. Funnel (Simplificado)
v_funnel := json_build_array(
    json_build_object(
        'name',
        'Visitantes',
        'value',
        (v_kpis->>'uniqueVisitors')::int
    ),
    json_build_object(
        'name',
        'Checkouts',
        'value',
        (v_kpis->>'uniqueCheckouts')::int
    ),
    json_build_object(
        'name',
        'Vendas',
        'value',
        (v_kpis->>'totalSales')::int
    )
);
-- 4. Evolução Diária (Agrupado por dia)
with daily_data as (
    select to_char(date_trunc('day', series), 'DD/MM') as date_label,
        date_trunc('day', series) as date_sort,
        count(distinct p.visitor_id) as visitors,
        count(distinct pur.id) as sales
    from generate_series(v_start_date, now(), '1 day'::interval) as series
        left join pageviews p on date_trunc('day', p.timestamp) = date_trunc('day', series)
        and p.site_id = p_site_id
        left join purchases pur on date_trunc('day', pur.timestamp) = date_trunc('day', series)
        and pur.site_id = p_site_id
    group by 1,
        2
    order by 2
)
select json_agg(
        json_build_object(
            'date',
            date_label,
            'visitors',
            visitors,
            'sales',
            sales
        )
    ) into v_evolution
from daily_data;
-- 5. Top Páginas
select json_agg(t) into v_top_pages
from (
        select url_path as path,
            content_type,
            count(distinct visitor_id) as visitors
        from pageviews
        where site_id = p_site_id
            and timestamp >= v_start_date
        group by 1,
            2
        order by 3 desc
        limit 5
    ) t;
-- 6. Últimas Vendas
select json_agg(t) into v_recent_sales
from (
        select buyer_name,
            product_name,
            price_value,
            timestamp
        from purchases
        where site_id = p_site_id
        order by timestamp desc
        limit 5
    ) t;
-- Retorno Final
return json_build_object(
    'kpis',
    v_kpis,
    'funnel',
    coalesce(v_funnel, '[]'::json),
    'evolution',
    coalesce(v_evolution, '[]'::json),
    'top_pages',
    coalesce(v_top_pages, '[]'::json),
    'recent_sales',
    coalesce(v_recent_sales, '[]'::json)
);
end;
$$;