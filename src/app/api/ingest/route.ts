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

const normalizeUrl = (url: string) => {
    try {
        // Remove protocol
        let clean = url.replace(/^https?:\/\//, '')
        // Remove www.
        clean = clean.replace(/^www\./, '')
        // Remove trailing slash
        if (clean.endsWith('/')) clean = clean.slice(0, -1)
        // Get host only for site matching (ignore path)
        return clean.split('/')[0].toLowerCase()
    } catch {
        return ''
    }
}

const normalizePath = (url: string) => {
    try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`)
        return urlObj.pathname
    } catch {
        return url
    }
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
            targetTable = body.table
            eventsToInsert = [body.events]
        } else if (body.table && body.events && !Array.isArray(body.events)) {
            targetTable = body.table
            eventsToInsert = [body.events]
        } else {
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

        // 3. PREPARAÇÃO: Buscar sites existentes para matching
        const { data: existingSites } = await supabaseAdmin
            .from('sites')
            .select('id, url, name')
            .eq('user_id', ownerId)

        const siteMap = new Map<string, string>() // normalizedUrl -> siteId
        if (existingSites) {
            existingSites.forEach((site: any) => {
                if (site.url) {
                    siteMap.set(normalizeUrl(site.url), site.id)
                }
            })
        }

        // 4. PROCESSAMENTO DE SITES E EVENTOS
        const sitesToUpsert = new Map()
        const processedEvents: any[] = []
        const siteIdsForRules = new Set<string>()

        for (const evt of eventsToInsert) {
            let eventUrl = evt.url_full || evt.url || ''
            let normalizedEventHost = normalizeUrl(eventUrl)

            let finalSiteId = evt.site_id

            // Tenta encontrar site existente pelo URL se não tiver ID ou se o ID não bater
            if (normalizedEventHost && siteMap.has(normalizedEventHost)) {
                finalSiteId = siteMap.get(normalizedEventHost)
            }

            // Se ainda não temos siteId (novo site), vamos gerar um ID ou usar o que veio
            if (!finalSiteId) {
                finalSiteId = evt.site_id
            }

            const existingSiteById = existingSites?.find(s => s.id === finalSiteId)

            if (!existingSiteById && finalSiteId) {
                // Novo site (ou site que veio com ID mas URL diferente/não cadastrada)
                if (!sitesToUpsert.has(finalSiteId)) {
                    const siteName = evt.sites?.name || normalizedEventHost || 'Novo Site'
                    let siteUrl = eventUrl
                    try { siteUrl = new URL(eventUrl).origin } catch { }

                    sitesToUpsert.set(finalSiteId, {
                        id: finalSiteId,
                        name: siteName,
                        url: siteUrl,
                        user_id: ownerId
                    })
                }
            }

            if (finalSiteId) {
                siteIdsForRules.add(finalSiteId)

                // Atualiza o evento com o ID correto (pode ter mudado pelo match de URL)
                processedEvents.push({
                    ...evt,
                    site_id: finalSiteId,
                    normalized_host: normalizedEventHost // auxiliar
                })
            }
        }

        // Upsert dos novos sites
        if (sitesToUpsert.size > 0) {
            const sitesArray = Array.from(sitesToUpsert.values())
            const { error: siteError } = await supabaseAdmin.from('sites').upsert(sitesArray as any, { onConflict: 'id' })
            if (siteError) console.error('Error upserting sites:', siteError)
        }

        // 5. REGRAS DE PÁGINA
        let pageRules: any[] = []
        if (siteIdsForRules.size > 0) {
            const { data: rules } = await supabaseAdmin
                .from('site_pages')
                .select('site_id, path, page_type')
                .in('site_id', Array.from(siteIdsForRules))
            if (rules) pageRules = rules
        }

        // 6. HIGIENIZAÇÃO FINAL E INSERÇÃO
        const cleanEvents = processedEvents.map(evt => {
            const { table, sites, normalized_host, ...rest } = evt

            let contentType = rest.content_type || 'article';

            if (targetTable === 'pageviews') {
                const eventPath = normalizePath(rest.url_full || rest.url || '')

                // Procura regra exata de path
                const rule = pageRules.find(r => r.site_id === evt.site_id && r.path === eventPath)
                if (rule) contentType = rule.page_type
            } else if (targetTable === 'initiate_checkouts' || targetTable === 'purchases') {
                contentType = 'sales_page'
            }

            return {
                ...rest,
                site_id: evt.site_id, // Garante que usa o ID resolvido
                user_id: ownerId,
                content_type: contentType
            }
        })

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
