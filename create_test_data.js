const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Carregar variáveis
const envPath = path.resolve(__dirname, '.env.local');
const envConfig = {};
if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
        const [k, v] = line.split('=');
        if (k && v) envConfig[k.trim()] = v.trim().replace(/"/g, '');
    });
}

const supabase = createClient(
    envConfig.NEXT_PUBLIC_SUPABASE_URL,
    envConfig.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function setup() {
    console.log('--- Criando Dados de Teste ---');

    // 1. Criar Usuário de Teste (Fake)
    // Nota: Como estamos usando Service Key, podemos inserir direto na tabela sites com um UUID gerado
    const testUserId = '00000000-0000-0000-0000-000000000001'; // UUID fixo para teste

    // 2. Criar Site de Teste
    console.log('Criando site para user:', testUserId);
    const { data: site, error: siteError } = await supabase
        .from('sites')
        .upsert({
            user_id: testUserId,
            name: 'Site de Teste Manual',
            url: 'https://teste-manual.com'
        }, { onConflict: 'url' })
        .select()
        .single();

    if (siteError) {
        console.error('Erro ao criar site:', siteError);
        return;
    }
    console.log('Site criado/encontrado:', site.id);

    // 3. Testar RPC com esse usuário
    console.log('\n--- Testando RPC ---');
    const testEvent = {
        table: 'pageviews',
        url: 'https://teste-manual.com/pagina-teste',
        visitor_id: 'visitor-' + Date.now()
    };

    const { data: rpcData, error: rpcError } = await supabase.rpc('ingest_event', {
        p_owner_id: testUserId,
        p_event_data: testEvent
    });

    if (rpcError) {
        console.error('RPC Falhou:', rpcError);
    } else {
        console.log('RPC Sucesso:', rpcData);
    }
}

setup();
