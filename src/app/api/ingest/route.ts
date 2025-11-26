import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

// Tabelas permitidas (Whitelist)
const ALLOWED_TABLES = ['pageviews', 'initiate_checkouts', 'purchases']

export async function POST(req: NextRequest) {
    try {
        // 1. SEGURANÇA: Validação de Chaves
        const secretKey = process.env.INGEST_SECRET_KEY
        const ownerId = process.env.OWNER_USER_ID // O Dono Real dos dados

        if (!secretKey) {
            return NextResponse.json({ error: 'Config error: INGEST_SECRET_KEY missing' }, { status: 500 })
        }

        // Trava de Segurança: Se não soubermos quem é o dono, não deixamos entrar nada.
        // Isso evita criar dados órfãos ou corrompidos.
        if (!ownerId) {
            console.error('CRITICAL: OWNER_USER_ID is not defined')
            return NextResponse.json({ error: 'Config error: OWNER_USER_ID missing' }, { status: 500 })
        }

        // Validação do Token (Aceita Bearer ou apikey)
        const authHeader = req.headers.get('Authorization')
        const apiKeyHeader = req.headers.get('apikey')
        const isValidBearer = authHeader === `Bearer ${secretKey}`
        const isValidApiKey = apiKeyHeader === secretKey

        if (!isValidBearer && !isValidApiKey) {
            return NextResponse.json({ error: 'Unauthorized Access' }, { status: 401 })
        }

        // 2. Processamento e Validação do Payload
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

        // Validação de Tabela (Sanitização)
        targetTable = targetTable.replace('public.', '')
        if (!ALLOWED_TABLES.includes(targetTable)) {
            return NextResponse.json({ error: `Invalid table: ${targetTable}` }, { status: 400 })
        }

        const supabaseAdmin = getSupabaseAdmin()

        // 3. INTEGRIDADE REFERENCIAL (Sites)
        // Garante que o site exista e pertença ao Dono Real antes de salvar os dados
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
                    user_id: ownerId // <--- FORÇA A PROPRIEDADE SEGURA
                })
            }
        })

        if (sitesToUpsert.size > 0) {
            const sitesArray = Array.from(sitesToUpsert.values())
            // O 'as any' aqui corrige o erro de Build do TypeScript
            await supabaseAdmin.from('sites').upsert(sitesArray as any, { onConflict: 'id' })
        }

        // 4. HIGIENIZAÇÃO DOS EVENTOS (Data Mapping)
        const cleanEvents = eventsToInsert.map(evt => {
            const { table, sites, ...rest } = evt

            // Classificação de Conteúdo
            let contentType = rest.content_type || 'article';
            // Lógica simplificada de classificação (pode ser expandida depois)
            if (targetTable === 'initiate_checkouts' || targetTable === 'purchases') {
                contentType = 'sales_page'
            }

            return {
                ...rest,
                user_id: ownerId, // <--- SUBSTITUIÇÃO SEGURA DO ID
                content_type: contentType
            }
        })

        // 5. INSERÇÃO NO BANCO
        // O 'as any' aqui corrige o erro de Build do TypeScript
        const { error } = await (supabaseAdmin
            .from(targetTable as any) as any)
            .upsert(cleanEvents as any, { onConflict: 'id' })

        if (error) {
            console.error('Database integrity error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, count: cleanEvents.length }, { status: 200 })

    } catch (err: any) {
        console.error('Critical API error:', err)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
