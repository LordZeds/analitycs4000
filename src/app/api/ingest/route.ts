import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Tabelas permitidas
const ALLOWED_TABLES = ['pageviews', 'initiate_checkouts', 'purchases']

export async function POST(req: NextRequest) {
    try {
        // 1. Autenticação e Configuração
        const secretKey = process.env.INGEST_SECRET_KEY
        const ownerId = process.env.OWNER_USER_ID

        if (!secretKey) {
            return NextResponse.json({ error: 'Config error: INGEST_SECRET_KEY missing' }, { status: 500 })
        }

        if (!ownerId) {
            console.error('OWNER_USER_ID is not defined in Vercel')
            return NextResponse.json({ error: 'Config error: OWNER_USER_ID missing' }, { status: 500 })
        }

        const authHeader = req.headers.get('Authorization')
        const apiKeyHeader = req.headers.get('apikey')

        const isValidBearer = authHeader === `Bearer ${secretKey}`
        const isValidApiKey = apiKeyHeader === secretKey

        if (!isValidBearer && !isValidApiKey) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Processamento do Payload
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
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
        }

        targetTable = targetTable.replace('public.', '')
        if (!ALLOWED_TABLES.includes(targetTable)) {
            return NextResponse.json({ error: `Invalid table: ${targetTable}` }, { status: 400 })
        }

        const supabaseAdmin = getSupabaseAdmin()

        // 3. PREPARAÇÃO: Coleta IDs para classificar páginas
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

        // 4. AUTO-CADASTRO DE SITES
        const sitesToUpsert = new Map()

        eventsToInsert.forEach(evt => {
            if (evt.site_id && !sitesToUpsert.has(evt.site_id)) {
                const siteName = evt.sites?.name || 'Novo Site (Auto)'
                let siteUrl = `https://auto-${evt.site_id}.com`

                if (evt.url_full) { try { siteUrl = new URL(evt.url_full).origin } catch { } }
                else if (evt.url) { try { siteUrl = new URL(evt.url).origin } catch { } }

                sitesToUpsert.set(evt.site_id, {
                    id: evt.site_id,
                    name: siteName,
                    url: siteUrl,
                    user_id: ownerId
                })
            }
        })

        if (sitesToUpsert.size > 0) {
            const sitesArray = Array.from(sitesToUpsert.values())
            // ✅ CORREÇÃO: Adicionado 'as any' para passar no build do TypeScript
            await supabaseAdmin.from('sites').upsert(sitesArray as any, { onConflict: 'id' })
        }

        // 5. HIGIENIZAÇÃO E ATRIBUIÇÃO DE PROPRIEDADE
        const cleanEvents = eventsToInsert.map(evt => {
            const { table, sites, ...rest } = evt

            let contentType = rest.content_type || 'article';
            if (targetTable === 'pageviews' && rest.url_path) {
                const rule = pageRules.find(r => r.site_id === rest.site_id && r.path === rest.url_path)
                if (rule) contentType = rule.page_type
            } else if (targetTable === 'initiate_checkouts' || targetTable === 'purchases') {
                contentType = 'sales_page'
            }

            return {
                ...rest,
                user_id: ownerId,
                content_type: contentType
            }
        })

        // 6. Inserção Segura
        // ✅ CORREÇÃO: Adicionado 'as any' para passar no build do TypeScript
        const { error } = await (supabaseAdmin
            .from(targetTable as any) as any)
            .upsert(cleanEvents as any, { onConflict: 'id' })

        if (error) {
            console.error('Supabase insert error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, count: cleanEvents.length }, { status: 200 })

    } catch (err: any) {
        console.error('API error:', err)
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 })
    }
}
