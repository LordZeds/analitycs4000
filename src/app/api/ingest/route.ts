import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'edge'

const ALLOWED_TABLES = ['pageviews', 'initiate_checkouts', 'purchases']

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface IngestEvent {
    site_id?: string
    url?: string
    url_full?: string
    url_path?: string
    content_type?: string
    sites?: { name?: string }
    [key: string]: any
}

interface IngestBody {
    table: string
    events: IngestEvent[] | IngestEvent
}

export async function OPTIONS(req: NextRequest) {
    return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
    try {
        // 1. Autenticação e Configuração
        const secretKey = process.env.INGEST_SECRET_KEY
        const ownerId = process.env.OWNER_USER_ID

        if (!secretKey) {
            console.error('Config error: INGEST_SECRET_KEY missing')
            return NextResponse.json({ error: 'Configuration Error' }, { status: 500, headers: corsHeaders })
        }

        if (!ownerId) {
            console.error('Config error: OWNER_USER_ID missing')
            return NextResponse.json({ error: 'Configuration Error' }, { status: 500, headers: corsHeaders })
        }

        const authHeader = req.headers.get('Authorization')
        const apiKeyHeader = req.headers.get('apikey')

        const isValidBearer = authHeader === `Bearer ${secretKey}`
        const isValidApiKey = apiKeyHeader === secretKey

        if (!isValidBearer && !isValidApiKey) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
        }

        // 2. Processamento do Payload
        let body: IngestBody
        try {
            body = await req.json()
        } catch (e) {
            return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400, headers: corsHeaders })
        }

        let targetTable = ''
        let eventsToInsert: IngestEvent[] = []

        if (body.table && Array.isArray(body.events)) {
            targetTable = body.table
            eventsToInsert = body.events
        } else if (body.table && !Array.isArray(body.events) && typeof body.events === 'object') {
            // Handle case where events might be a single object inside events property (unlikely but possible based on previous code logic)
            // Actually previous code checked: if (body.table && !Array.isArray(body)) -> this implied body ITSELF was the event if not array?
            // Let's look at previous code:
            // } else if (body.table && !Array.isArray(body)) {
            //    targetTable = body.table
            //    eventsToInsert = [body]
            // }
            // This suggests the body could be { table: '...', ...eventData }
            targetTable = body.table
            eventsToInsert = [body as unknown as IngestEvent]
        } else if (body.table && body.events && !Array.isArray(body.events)) {
            // Case where body.events is a single object
            targetTable = body.table
            eventsToInsert = [body.events]
        } else {
            // Fallback for direct object if table is present
            if ((body as any).table) {
                targetTable = (body as any).table
                eventsToInsert = [body as unknown as IngestEvent]
            } else {
                return NextResponse.json({ error: 'Invalid payload structure' }, { status: 400, headers: corsHeaders })
            }
        }

        targetTable = targetTable.replace('public.', '')
        if (!ALLOWED_TABLES.includes(targetTable)) {
            return NextResponse.json({ error: `Invalid table: ${targetTable}` }, { status: 400, headers: corsHeaders })
        }

        const supabaseAdmin = getSupabaseAdmin()

        // 3. PREPARAÇÃO: Classificação de Páginas
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
            const { error: siteError } = await supabaseAdmin.from('sites').upsert(sitesArray as any, { onConflict: 'id' })
            if (siteError) {
                console.error('Error upserting sites:', siteError)
                // Continue execution, don't fail everything just for site upsert? 
                // Or maybe we should log it.
            }
        }

        // 5. HIGIENIZAÇÃO E ATRIBUIÇÃO DE PROPRIEDADE
        const cleanEvents = eventsToInsert.map(evt => {
            // Remove properties that shouldn't be in the DB or are duplicates
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
        // Using 'as any' for table name because Supabase types might not be perfectly inferred for dynamic table names
        const { error } = await supabaseAdmin
            .from(targetTable as any)
            .upsert(cleanEvents as any, { onConflict: 'id' })

        if (error) {
            console.error('Supabase insert error:', error)
            return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
        }

        return NextResponse.json({ success: true, count: cleanEvents.length }, { status: 200, headers: corsHeaders })

    } catch (err: any) {
        console.error('API error:', err)
        return NextResponse.json({ error: 'Internal Error' }, { status: 500, headers: corsHeaders })
    }
}
