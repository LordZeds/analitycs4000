import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const runtime = 'edge'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

        // 2. Parse do Payload
        const body = await req.json()
        let targetTable = ''
        let eventsToInsert: any[] = []

        if (body.table && Array.isArray(body.events)) {
            targetTable = body.table
            eventsToInsert = body.events
        } else if (body.table && body.events) {
            targetTable = body.table
            eventsToInsert = Array.isArray(body.events) ? body.events : [body.events]
        } else if (body.table) {
            targetTable = body.table
            eventsToInsert = [body]
        } else {
            return NextResponse.json({ error: 'Invalid payload format' }, { status: 400, headers: corsHeaders })
        }

        // Remove namespace 'public.' se houver
        targetTable = targetTable.replace('public.', '')

        // 3. CHAMA O BANCO DE DADOS (RPC)
        // A mágica acontece aqui. Passamos a bomba para o Postgres resolver.
        const supabaseAdmin = getSupabaseAdmin()

        const { data, error } = await supabaseAdmin.rpc('handle_ingest_events', {
            p_owner_id: ownerId,
            p_table_name: targetTable,
            p_events: eventsToInsert
        })

        if (error) {
            console.error('RPC Error:', error)
            return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
        }

        return NextResponse.json(data, { status: 200, headers: corsHeaders })

    } catch (err: any) {
        console.error('API error:', err)
        return NextResponse.json({ error: 'Internal Error' }, { status: 500, headers: corsHeaders })
    }
}
