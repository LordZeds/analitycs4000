import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'edge'

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

export async function POST(req: NextRequest) {
    try {
        // 1. Autenticação e Configuração
        const secretKey = process.env.INGEST_SECRET_KEY
        const ownerId = process.env.OWNER_USER_ID

        if (!secretKey || !ownerId) {
            return NextResponse.json({ error: 'Config Error: Missing Secret or Owner ID' }, { status: 500, headers: corsHeaders })
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

        // Normaliza para Array de Eventos
        let eventsToProcess: any[] = []
        let targetTable = body.table || ''

        if (body.events) {
            eventsToProcess = Array.isArray(body.events) ? body.events : [body.events]
        } else if (body.table) {
            // Formato legado onde o body é o evento
            eventsToProcess = [body]
        } else {
            return NextResponse.json({ error: 'Invalid payload format' }, { status: 400, headers: corsHeaders })
        }

        targetTable = targetTable.replace('public.', '')
        if (!ALLOWED_TABLES.includes(targetTable)) {
            return NextResponse.json({ error: 'Invalid table' }, { status: 400, headers: corsHeaders })
        }

        const supabaseAdmin = getSupabaseAdmin()
        const results = []

        // 3. Ingestão via RPC (Lógica no Banco)
        for (const evt of eventsToProcess) {
            // Prepara o objeto do evento com a tabela correta
            const eventData = {
                ...evt,
                table: targetTable
            }

            const { data, error } = await supabaseAdmin.rpc('ingest_event', {
                p_owner_id: ownerId,
                p_event_data: eventData
            } as any)

            if (error) {
                console.error('RPC Error:', error)
                results.push({ error: error.message })
            } else {
                results.push(data)
            }
        }

        return NextResponse.json({ success: true, count: results.length, results }, { status: 200, headers: corsHeaders })

    } catch (err: any) {
        console.error('API error:', err)
        return NextResponse.json({ error: 'Internal Error' }, { status: 500, headers: corsHeaders })
    }
}
