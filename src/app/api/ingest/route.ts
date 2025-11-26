import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Tabelas permitidas para segurança
const ALLOWED_TABLES = ['pageviews', 'initiate_checkouts', 'purchases']

export async function POST(req: NextRequest) {
    try {
        // --- 1. Autenticação Flexível (Aceita Bearer ou apikey) ---
        const secretKey = process.env.INGEST_SECRET_KEY

        if (!secretKey) {
            console.error('INGEST_SECRET_KEY is not defined')
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
        }

        const authHeader = req.headers.get('Authorization')
        const apiKeyHeader = req.headers.get('apikey') // O Tracker manda esse

        const isValidBearer = authHeader === `Bearer ${secretKey}`
        const isValidApiKey = apiKeyHeader === secretKey

        if (!isValidBearer && !isValidApiKey) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // --- 2. Tratamento do Payload (Lote vs Evento Único) ---
        const body = await req.json()

        let targetTable = ''
        let eventsToInsert: any[] = []

        // CASO A: Formato Batch (Padrão do ETL)
        if (body.table && Array.isArray(body.events)) {
            targetTable = body.table
            eventsToInsert = body.events
        }
        // CASO B: Formato Webhook do Tracker (Evento Único)
        else if (body.table && !Array.isArray(body)) {
            // O Tracker manda o nome da tabela dentro do objeto do evento
            targetTable = body.table
            eventsToInsert = [body] // Transforma em array de 1 item
        } else {
            return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 })
        }

        // --- 3. Validação da Tabela ---
        // Remove 'public.' se vier no nome da tabela
        targetTable = targetTable.replace('public.', '')

        if (!ALLOWED_TABLES.includes(targetTable)) {
            return NextResponse.json({ error: `Invalid table: ${targetTable}` }, { status: 400 })
        }

        // --- 4. Inserção no Banco (Upsert) ---
        const supabaseAdmin = getSupabaseAdmin()

        // Remove o campo 'table' de dentro dos eventos antes de salvar, pois ele não existe nas colunas
        const cleanEvents = eventsToInsert.map(evt => {
            const { table, ...rest } = evt
            return rest
        })

        const { error } = await (supabaseAdmin
            .from(targetTable as any) as any)
            .upsert(cleanEvents, { onConflict: 'id' })

        if (error) {
            console.error('Supabase error:', error)
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
