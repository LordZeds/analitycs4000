import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Tabelas permitidas
const ALLOWED_TABLES = ['pageviews', 'initiate_checkouts', 'purchases']

export async function POST(req: NextRequest) {
    try {
        // 1. Autenticação
        const secretKey = process.env.INGEST_SECRET_KEY

        if (!secretKey) {
            console.error('INGEST_SECRET_KEY is not defined')
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
        }

        const authHeader = req.headers.get('Authorization')
        const apiKeyHeader = req.headers.get('apikey')

        const isValidBearer = authHeader === `Bearer ${secretKey}`
        const isValidApiKey = apiKeyHeader === secretKey

        if (!isValidBearer && !isValidApiKey) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Processa o Corpo
        const body = await req.json()

        let targetTable = ''
        let eventsToInsert: any[] = []

        if (body.table && Array.isArray(body.events)) {
            targetTable = body.table
            eventsToInsert = body.events
        } else if (body.table && !Array.isArray(body)) {
            targetTable = body.table
            eventsToInsert = [body]
        } else {
            return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 })
        }

        // 3. Valida Tabela
        targetTable = targetTable.replace('public.', '')
        if (!ALLOWED_TABLES.includes(targetTable)) {
            return NextResponse.json({ error: `Invalid table: ${targetTable}` }, { status: 400 })
        }

        const supabaseAdmin = getSupabaseAdmin()

        // 4. AUTO-CADASTRO DE SITES & CLASSIFICAÇÃO DE PÁGINAS
        const sitesToUpsert = new Map()
        const siteIds = new Set<string>()

        // Coleta IDs únicos para buscar regras
        eventsToInsert.forEach(evt => {
            if (evt.site_id) siteIds.add(evt.site_id)
        })

        // Busca regras de páginas cadastradas para esses sites
        let pageRules: any[] = []
        if (siteIds.size > 0) {
            const { data: rules } = await supabaseAdmin
                .from('site_pages')
                .select('site_id, path, page_type')
                .in('site_id', Array.from(siteIds))

            if (rules) pageRules = rules
        }

        // Prepara sites para auto-cadastro
        eventsToInsert.forEach(evt => {
            if (evt.site_id && !sitesToUpsert.has(evt.site_id)) {
                const siteName = evt.sites?.name || 'Novo Site (Auto)'
                let siteUrl = `https://auto-${evt.site_id}.com`

                if (evt.url_full) {
                    try { siteUrl = new URL(evt.url_full).origin } catch { }
                } else if (evt.url) {
                    try { siteUrl = new URL(evt.url).origin } catch { }
                }

                sitesToUpsert.set(evt.site_id, {
                    id: evt.site_id,
                    name: siteName,
                    url: siteUrl,
                    user_id: evt.user_id
                })
            }
        })

        // Executa Auto-cadastro de sites (se não existirem)
        if (sitesToUpsert.size > 0) {
            const sitesArray = Array.from(sitesToUpsert.values())
            for (const site of sitesArray) {
                const { error: siteError } = await supabaseAdmin
                    .from('sites')
                    .upsert(site, { onConflict: 'id' })

                if (siteError) {
                    console.warn(`Falha ao criar site. Tentando órfão...`)
                    const { user_id, ...siteOrphan } = site
                    await supabaseAdmin.from('sites').upsert(siteOrphan, { onConflict: 'id' })
                }
            }
        }

        // 5. Limpeza e CLASSIFICAÇÃO (AQUI ESTÁ A LÓGICA QUE VOCÊ QUER)
        const cleanEvents = eventsToInsert.map(evt => {
            // Remove campos que não são colunas
            const { table, sites, ...rest } = evt

            // Lógica de Classificação Baseada no Cadastro Manual
            let contentType = rest.content_type || 'article'; // Default é artigo se não achar nada

            if (targetTable === 'pageviews' && rest.url_path) {
                // Procura se esse path está cadastrado nas regras
                const rule = pageRules.find(r =>
                    r.site_id === rest.site_id &&
                    r.path === rest.url_path // Ex: /oferta
                )

                if (rule) {
                    contentType = rule.page_type // Ex: sales_page
                }
            } else if (targetTable === 'initiate_checkouts' || targetTable === 'purchases') {
                contentType = 'sales_page' // Vendas e Checkouts são sempre de vendas
            }

            return {
                ...rest,
                content_type: contentType // Grava a classificação correta
            }
        })

        // 6. Inserção dos Dados
        const { error } = await (supabaseAdmin
            .from(targetTable as any) as any)
            .upsert(cleanEvents, { onConflict: 'id' })

        if (error) {
            console.error('Supabase insert error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            message: 'Events processed successfully',
            count: cleanEvents.length
        }, { status: 200 })

    } catch (err: any) {
        console.error('Ingest API error:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
