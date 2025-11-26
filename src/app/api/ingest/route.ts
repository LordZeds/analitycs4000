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

        // 4. PREPARAÇÃO & CLASSIFICAÇÃO
        // Coleta IDs de site para buscar regras de página
        const siteIds = new Set<string>()
        eventsToInsert.forEach(evt => { if (evt.site_id) siteIds.add(evt.site_id) })

        let pageRules: any[] = []
        if (siteIds.size > 0) {
            const { data: rules } = await supabaseAdmin
                .from('site_pages')
                .select('site_id, path, page_type')
                .in('site_id', Array.from(siteIds))
            if (rules) pageRules = rules
        }

        // 5. AUTO-CADASTRO DE SITES (Correção do Erro 23503)
        const sitesToUpsert = new Map()

        eventsToInsert.forEach(evt => {
            if (evt.site_id && !sitesToUpsert.has(evt.site_id)) {
                const siteName = evt.sites?.name || 'Novo Site (Auto)'
                let siteUrl = `https://auto-${evt.site_id}.com`

                if (evt.url_full) { try { siteUrl = new URL(evt.url_full).origin } catch { } }
                else if (evt.url) { try { siteUrl = new URL(evt.url).origin } catch { } }

                // Tenta usar o user_id que veio (do Tracker), mas se falhar, a API cuidará
                sitesToUpsert.set(evt.site_id, {
                    id: evt.site_id,
                    name: siteName,
                    url: siteUrl,
                    user_id: evt.user_id
                })
            }
        })

        if (sitesToUpsert.size > 0) {
            const sitesArray = Array.from(sitesToUpsert.values())

            // Loop um por um para garantir que sites novos não travem o lote
            for (const site of sitesArray) {
                // Tenta criar normal
                const { error: siteError } = await supabaseAdmin
                    .from('sites')
                    .upsert(site, { onConflict: 'id' })

                if (siteError) {
                    console.warn(`Site ${site.id} falhou com user_id. Tentando modo órfão...`)
                    // Se falhar (ex: user_id não existe no banco novo), cria sem dono
                    const { user_id, ...siteOrphan } = site
                    await supabaseAdmin.from('sites').upsert(siteOrphan, { onConflict: 'id' })
                }
            }
        }

        // 6. LIMPEZA E INSERÇÃO
        const cleanEvents = eventsToInsert.map(evt => {
            const { table, sites, ...rest } = evt

            // Classificação Inteligente
            let contentType = rest.content_type || 'article';
            if (targetTable === 'pageviews' && rest.url_path) {
                const rule = pageRules.find(r => r.site_id === rest.site_id && r.path === rest.url_path)
                if (rule) contentType = rule.page_type
            } else if (targetTable === 'initiate_checkouts' || targetTable === 'purchases') {
                contentType = 'sales_page'
            }

            return {
                ...rest,
                content_type: contentType
            }
        })

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
        console.error('API error:', err)
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
    }
}
