const fs = require('fs');
const path = require('path');

try {
    // Tenta ler com utf-16le (comum em redirecionamento powershell)
    let content = fs.readFileSync('supabase_schema_dump.ts', 'utf16le');

    // Se parecer lixo, tenta utf8
    if (!content.includes('export type Database')) {
        content = fs.readFileSync('supabase_schema_dump.ts', 'utf8');
    }

    // Extrair a parte de Tables
    const start = content.indexOf('Tables: {');
    const end = content.indexOf('Views: {', start);

    if (start !== -1) {
        const extracted = content.substring(start, end !== -1 ? end : start + 10000);
        fs.writeFileSync('schema_utf8.txt', extracted, 'utf8');
        console.log('Schema salvo em schema_utf8.txt');
    } else {
        console.log('Não encontrou definição de Tables.');
    }

} catch (e) {
    console.error('Erro:', e.message);
}
