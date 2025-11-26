const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Carregar variáveis de ambiente manualmente
const envPath = path.resolve(__dirname, '.env.local');
const envConfig = {};

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            envConfig[key.trim()] = value.trim().replace(/"/g, '');
        }
    });
}

const SUPABASE_URL = envConfig.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = envConfig.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_ID = envConfig.OWNER_USER_ID;

console.log('--- Configuração ---');
console.log('URL:', SUPABASE_URL ? 'OK' : 'MISSING');
console.log('Service Key:', SERVICE_KEY ? 'OK' : 'MISSING');
console.log('Owner ID:', OWNER_ID ? 'OK' : 'MISSING');

if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error('ERRO: Variáveis de ambiente (URL/ServiceKey) faltando em .env.local');
    process.exit(1);
}

// 2. Inicializar Cliente Supabase (Admin)
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// 3. Obter Owner ID (se não estiver no env)
async function getOwnerId() {
    if (OWNER_ID) return OWNER_ID;

    console.log('Owner ID não encontrado no .env.local, buscando no banco...');
    // Tenta pegar o primeiro site e usar o user_id dele
    const { data, error } = await supabase.from('sites').select('user_id').limit(1).single();
    if (data) return data.user_id;

    console.error('Não foi possível encontrar um Owner ID (nenhum site cadastrado?).');
    process.exit(1);
}

// 4. Payload de Teste
const testEvent = {
    table: 'pageviews',
    url: 'https://teste-manual.com/pagina-teste',
    visitor_id: 'test-visitor-' + Date.now(),
    content_type: 'test'
};

// 5. Executar RPC
async function runTest() {
    const validOwnerId = await getOwnerId();
    console.log('Usando Owner ID:', validOwnerId);

    console.log('\n--- Executando Teste RPC (ingest_event) ---');
    console.log('Payload:', testEvent);

    const { data, error } = await supabase.rpc('ingest_event', {
        p_owner_id: validOwnerId,
        p_event_data: testEvent
    });

    if (error) {
        console.error('\n❌ FALHA NO RPC:');
        console.error(error);
    } else {
        console.log('\n✅ SUCESSO NO RPC:');
        console.log(JSON.stringify(data, null, 2));

        // Verificar se gravou
        if (data && data.success) {
            console.log('\nVerificando tabela pageviews...');
            const { data: checkData, error: checkError } = await supabase
                .from('pageviews')
                .select('*')
                .eq('visitor_id', testEvent.visitor_id);

            if (checkData && checkData.length > 0) {
                console.log('✅ Registro encontrado no banco!');
            } else {
                console.log('⚠️ RPC retornou sucesso, mas registro NÃO encontrado (RLS de Select?)');
            }
        }
    }
}

runTest();
