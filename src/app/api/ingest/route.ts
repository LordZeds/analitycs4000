import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase'

// export const runtime = 'edge' // Comentado para usar Node.js Runtime (mais estável para DB)

const ALLOWED_TABLES = ['pageviews', 'initiate_checkouts', 'purchases']

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Helper para limpar URL e extrair domínio
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

// Helper para normalizar chaves (CamelCase -> snake_case) e Aliases
const normalizePayload = (evt: any) => {
    const map: Record<string, string> = {
        // IDs
        'siteId': 'site_id',
        'visitorId': 'visitor_id',
        'sessionId': 'session_id',
        'userId': 'user_id',

        // Screen / Device
        'screenWidth': 'screen_width',
        'screenHeight': 'screen_height',
        'viewportWidth': 'viewport_width',
        'viewportHeight': 'viewport_height',
        'deviceType': 'device_type',
        'client_user_agent': 'user_agent',

        // Content / Product
        'content_name': 'product_name',
        'content_category': 'product_category',
        'title': 'page_title',
        'value': 'price_value',
        'currency': 'price_currency',

        // URL / Nav
        'url': 'url_full',
        'path': 'url_path',
        'referrer': 'referrer_url',
    }

    const newEvt: any = { ...evt }

    // 1. Mapear campos conhecidos
    for (const [key, val] of Object.entries(evt)) {
        if (map[key]) {
            newEvt[map[key]] = val
            // Opcional: remover a chave antiga se quiser limpar, mas manter pode ser seguro para raw_payload
        }
    }

    // 2. Tratar content_ids (Array -> Single)
    if (evt.content_ids && Array.isArray(evt.content_ids) && evt.content_ids.length > 0) {
        newEvt.product_id = evt.content_ids[0]
    }

    // 3. Inferir Tabela pelo eventType
    if (evt.eventType) {
        const type = evt.eventType.toUpperCase()
        if (type === 'PURCHASE') newEvt.table = 'purchases'
        else if (type === 'INITIATE_CHECKOUT') newEvt.table = 'initiate_checkouts'
        else if (type === 'PAGEVIEW') newEvt.table = 'pageviews'
    }

    // Fallback para Purchase se tiver transaction_id e não tiver table
    if (!newEvt.table && newEvt.transaction_id) {
        newEvt.table = 'purchases'
    }

    return newEvt
}

export async function POST(req: NextRequest) {
    const debugLog: any[] = []
    try {
        // 1. Autenticação e Configuração
        const secretKey = process.env.INGEST_SECRET_KEY
        const ownerId = process.env.OWNER_USER_ID
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        debugLog.push({ step: 'config', hasSecret: !!secretKey, hasOwner: !!ownerId, hasServiceKey: !!serviceKey })

        if (!secretKey || !ownerId) {
            return NextResponse.json({ error: 'Config Error', debug: debugLog }, { status: 500, headers: corsHeaders })
        }

        const authHeader = req.headers.get('Authorization')
        const apiKeyHeader = req.headers.get('apikey')

        if ((authHeader !== `Bearer ${secretKey}`) && (apiKeyHeader !== secretKey)) {
            return NextResponse.json({ error: 'Unauthorized', debug: debugLog }, { status: 401, headers: corsHeaders })
        }

        // 2. Processamento do Payload
        let body
        try {
            body = await req.json()
            debugLog.push({ step: 'payload_parsed', bodyKeys: Object.keys(body) })
        } catch {
            return NextResponse.json({ error: 'Invalid JSON', debug: debugLog }, { status: 400, headers: corsHeaders })
        }

        // Normaliza para Array de Eventos
        let eventsToProcess: any[] = []

        if (body.events) {
            eventsToProcess = Array.isArray(body.events) ? body.events : [body.events]
        } else if (Array.isArray(body)) {
            eventsToProcess = body
        } else {
            eventsToProcess = [body]
        }

        debugLog.push({ step: 'processing', eventCount: eventsToProcess.length })

        let supabaseAdmin
        try {
            supabaseAdmin = getSupabaseAdmin()
        } catch (e: any) {
            debugLog.push({ step: 'supabase_client_error', error: e.message })
            return NextResponse.json({ error: 'Supabase Config Error', details: e.message, debug: debugLog }, { status: 500, headers: corsHeaders })
        }

        const results = []

        // 3. Ingestão via RPC (Lógica no Banco)
        for (const rawEvt of eventsToProcess) {
            // NORMALIZAÇÃO CRÍTICA (CamelCase -> snake_case)
            const evt = normalizePayload(rawEvt)

            // Define tabela alvo (prioridade: campo table > inferência)
            let targetTable = evt.table || body.table || ''
            targetTable = targetTable.replace('public.', '')

            if (!ALLOWED_TABLES.includes(targetTable)) {
                results.push({ error: 'Table not identified or invalid', event: evt })
                continue
            }

            // REMOVE user_id e site_id que vêm do JSON (conforme solicitado)
            // Mantemos TODO O RESTO para garantir que UTMs, Browser, etc cheguem no banco
            const { user_id, site_id, table, ...rest } = evt

            const eventData = {
                ...rest,
                table: targetTable
            }

            const { data, error } = await supabaseAdmin.rpc('ingest_event', {
                p_owner_id: ownerId,
                p_event_data: eventData
            } as any)

            if (error) {
                console.error('RPC Error:', error)
                results.push({ error: error.message, code: error.code, details: error.details })
                debugLog.push({ step: 'rpc_transport_error', error })
            } else if (data && (data as any).error) {
                // ERRO LÓGICO DO SQL
                console.error('RPC Logic Error:', (data as any).error)
                results.push({ error: (data as any).error })
                debugLog.push({ step: 'rpc_logic_error', error: (data as any).error })
            } else {
                results.push(data)
                debugLog.push({ step: 'rpc_success', data })
            }
        }

        return NextResponse.json({ success: true, count: results.length, results, debug: debugLog }, { status: 200, headers: corsHeaders })

    } catch (err: any) {
        console.error('API error:', err)
        return NextResponse.json({ error: 'Internal Error', message: err.message, debug: debugLog }, { status: 500, headers: corsHeaders })
    }
}

export async function GET(req: NextRequest) {
    const secretKey = process.env.INGEST_SECRET_KEY
    const ownerId = process.env.OWNER_USER_ID
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    let dbConnection = 'PENDING'
    let dbError = null

    if (supabaseUrl && serviceKey) {
        try {
            const adminClient = createClient(supabaseUrl, serviceKey, {
                auth: { persistSession: false, autoRefreshToken: false }
            })
            // Tenta uma query simples para validar a chave
            const { data, error } = await adminClient.from('sites').select('id').limit(1)
            if (error) {
                dbConnection = 'FAILED'
                dbError = error.message
            } else {
                dbConnection = 'SUCCESS'
            }
        } catch (e: any) {
            dbConnection = 'ERROR'
            dbError = e.message
        }
    }

    return NextResponse.json({
        status: 'diagnostic',
        env: {
            NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ? 'OK' : 'MISSING',
            INGEST_SECRET_KEY: secretKey ? 'OK' : 'MISSING',
            OWNER_USER_ID: ownerId ? 'OK' : 'MISSING',
            SUPABASE_SERVICE_ROLE_KEY: serviceKey ? 'OK' : 'MISSING'
        },
        connection_test: {
            status: dbConnection,
            error: dbError
        },
        timestamp: new Date().toISOString()
    }, { headers: corsHeaders })
}
