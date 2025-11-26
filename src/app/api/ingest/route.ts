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

        // 4. LIMPEZA CRÍTICA (AQUI ESTÁ A CORREÇÃO)
        // Removemos 'table' e 'sites' (que é um objeto join) para não quebrar o insert
        const cleanEvents = eventsToInsert.map(evt => {
            // Extrai 'sites' e 'table' para jogar fora, fica com o resto
            const { table, sites, ...rest } = evt
            return rest
        })

        // 5. Inserção
        const supabaseAdmin = getSupabaseAdmin()

        const { error } = await (supabaseAdmin
            .from(targetTable as any) as any)
            .upsert(cleanEvents, { onConflict: 'id' })

        if (error) {
            console.error('Supabase error:', error)
            // Se der erro de coluna, mostramos qual para facilitar
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
