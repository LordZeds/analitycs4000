import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'edge'

const ALLOWED_TABLES = ['pageviews', 'initiate_checkouts', 'purchases']

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Helper para limpar URL (remove http, www, path e deixa só o domínio limpo)
const normalizeUrl = (url: string) => {
    try {
        let clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '')
        if (clean.endsWith('/')) clean = clean.slice(0, -1)
        return clean.split('/')[0].toLowerCase()
    } catch {
        return ''
    }
}

export async function OPTIONS(req: NextRequest) {
    return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
    try {
        // 1. Autenticação
        const secretKey = process.env.INGEST_SECRET_KEY
        const ownerId = process.env.OWNER_USER_ID

        if (!secretKey || !ownerId) {
            return NextResponse.json({ error: 'Config Error' }, { status: 500, headers: corsHeaders })
        }

        const authHeader = req.headers.get('Authorization')
        const apiKeyHeader = req.headers.get('apikey')

        if ((authHeader !== `Bearer ${secretKey}`) && (apiKeyHeader !== secretKey)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
        }

        // 2. Processamento do Payload
        let body
        try {
            body = await req.json()
        } catch {
            return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders })
        }

        let targetTable = ''
        let eventsToInsert: any[] = []

        // Normaliza o formato de entrada (Batch ou Single)
        if (body.table && Array.isArray(body.events)) {
            targetTable = body.table
            eventsToInsert = body.events
        } else if (body.table && body.events) {
            // Caso venha aninhado mas não array
            targetTable = body.table
            eventsToInsert = Array.isArray(body.events) ? body.events : [body.events]
        } else if (body.table) {
            // Caso venha solto (formato antigo do tracker)
            targetTable = body.table
            eventsToInsert = [body]
        } else {
            return NextResponse.json({ error: 'Invalid payload format' }, { status: 400, headers: corsHeaders })
        }

        targetTable = targetTable.replace('public.', '')
        if (!ALLOWED_TABLES.includes(targetTable)) {
            return NextResponse.json({ error: 'Invalid table' }, { status: 400, headers: corsHeaders })
        }

        const supabaseAdmin = getSupabaseAdmin()

        // 3. BUSCA DE SITES (Apenas Leitura - READ ONLY)
        // Carrega seus sites cadastrados para validar se a URL pode entrar
        const { data: mySites } = await supabaseAdmin
            .from('sites')
            .select('id, url')
            .eq('user_id', ownerId)

        if (!mySites || mySites.length === 0) {
            return NextResponse.json({ error: 'No sites configured in Dashboard' }, { status: 400, headers: corsHeaders })
        }

        // Mapa de Domínio -> ID (Ex: "tiberioz.com.br" -> "uuid-do-site")
        const domainMap = new Map()
        mySites.forEach((s: any) => {
            const domain = normalizeUrl(s.url)
            if (domain) domainMap.set(domain, s.id)
        })

        // Busca regras de página para classificação
        const { data: pageRules } = await supabaseAdmin
            .from('site_pages')
            .select('site_id, path, page_type')
            .in('site_id', mySites.map((s: any) => s.id))

        // 4. PROCESSAMENTO (Filtragem Rígida)
        const cleanEvents: any[] = []

        for (const evt of eventsToInsert) {
            const { table, sites, ...rest } = evt

            // Identifica o site pela URL do evento
            const eventUrl = rest.url_full || rest.url || ''
            const eventDomain = normalizeUrl(eventUrl)

            let matchedSiteId = null

            // Lógica de Match: Verifica se o domínio do evento pertence a um site seu
            if (eventDomain) {
                if (domainMap.has(eventDomain)) {
                    // Match exato
                    matchedSiteId = domainMap.get(eventDomain)
                } else {
                    // Tenta match de subdomínio (ex: app.tiberioz.com -> tiberioz.com)
                    for (const [dbDomain, dbId] of Array.from(domainMap.entries())) {
                        if (typeof dbDomain === 'string' && eventDomain.endsWith('.' + dbDomain)) {
                            matchedSiteId = dbId
                            break
                        }
                    }
                }
            }

            // 🛑 BLOQUEIO: Se não achou site cadastrado, IGNORA o evento.
            // Não cria nada. Não dá erro 500. Apenas descarta.
            if (!matchedSiteId) {
                continue
            }

            // Classificação de Conteúdo
            let contentType = rest.content_type || 'article'
            if (targetTable === 'pageviews' && rest.url_path && pageRules) {
                const rule = pageRules.find((r: any) => r.site_id === matchedSiteId && r.path === rest.url_path)
                if (rule) contentType = rule.page_type
            } else if (targetTable !== 'pageviews') {
                contentType = 'sales_page'
            }

            cleanEvents.push({
                ...rest,
                site_id: matchedSiteId, // Usa o ID do seu banco
                user_id: ownerId,       // Usa o seu usuário
                content_type: contentType
            })
        }

        if (cleanEvents.length === 0) {
            // Retorna sucesso 200 mesmo vazia para não alarmar o tracker, mas avisa no corpo
            return NextResponse.json({ message: 'No matching sites found, events ignored.' }, { status: 200, headers: corsHeaders })
        }

        // 5. SALVAR NO BANCO
        // 'as any' aqui garante que o TypeScript não reclame do formato dinâmico
        const { error } = await (supabaseAdmin
            .from(targetTable as any) as any)
            .upsert(cleanEvents as any, { onConflict: 'id' })

        if (error) {
            console.error('Supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
        }

        return NextResponse.json({ success: true, count: cleanEvents.length }, { status: 200, headers: corsHeaders })

    } catch (err: any) {
        console.error('API error:', err)
        return NextResponse.json({ error: 'Internal Error' }, { status: 500, headers: corsHeaders })
    }
}
