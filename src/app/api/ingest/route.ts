import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const ALLOWED_TABLES = ['pageviews', 'initiate_checkouts', 'purchases']

export async function POST(req: NextRequest) {
    try {
        // 1. Validate Authorization Header
        const authHeader = req.headers.get('Authorization')
        const secretKey = process.env.INGEST_SECRET_KEY

        if (!secretKey) {
            console.error('INGEST_SECRET_KEY is not defined')
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
        }

        if (!authHeader || authHeader !== `Bearer ${secretKey}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Parse Body
        const body = await req.json()
        const { table, events } = body

        if (!table || !events || !Array.isArray(events)) {
            return NextResponse.json({ error: 'Invalid payload format' }, { status: 400 })
        }

        // 3. Validate Table
        if (!ALLOWED_TABLES.includes(table)) {
            return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
        }

        // 4. Upsert Data
        const supabaseAdmin = getSupabaseAdmin()

        // We cast to any to bypass strict type checking for dynamic table names
        const { error, count } = await (supabaseAdmin
            .from(table as any) as any)
            .upsert(events, { onConflict: 'id' })
            .select('id', { count: 'exact' }) // Select count to return it

        if (error) {
            console.error('Supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            message: 'Events processed successfully',
            count: events.length
        }, { status: 200 })

    } catch (err: any) {
        console.error('Ingest API error:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
