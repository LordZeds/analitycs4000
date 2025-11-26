# TiberioZ Analytics - Walkthrough

## Configuração

1. **Variáveis de Ambiente**:
    Renomeie `.env.local.example` para `.env.local` e preencha com suas chaves do Supabase.

    ```bash
    NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
    SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
    INGEST_SECRET_KEY=sua-chave-secreta-ingestao
    ```

2. **Instalação**:
    As dependências já foram instaladas. Se precisar reinstalar:

    ```bash
    npm install
    ```

3. **Rodar o Servidor**:

    ```bash
    npm run dev
    ```

    Acesse [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Funcionalidades

### 1. API de Ingestão (`/api/ingest`)

- **Método**: POST
- **Auth**: Header `Authorization: Bearer <INGEST_SECRET_KEY>`
- **Exemplo de Payload**:

    ```json
    {
      "table": "pageviews",
      "events": [
        {
          "site_id": "site_123",
          "visitor_id": "vis_abc",
          "url_full": "https://exemplo.com",
          "timestamp": "2023-10-27T10:00:00Z"
        }
      ]
    }
    ```

### 2. Dashboard (`/dashboard`)

- **Acesso**: Requer login.

# TiberioZ Analytics - Walkthrough

## Configuração

1. **Variáveis de Ambiente**:
    Renomeie `.env.local.example` para `.env.local` e preencha com suas chaves do Supabase.

    ```bash
    NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
    NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
    SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
    INGEST_SECRET_KEY=sua-chave-secreta-ingestao
    ```

2. **Instalação**:
    As dependências já foram instaladas. Se precisar reinstalar:

    ```bash
    npm install
    ```

3. **Rodar o Servidor**:

    ```bash
    npm run dev
    ```

    Acesse [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

## Funcionalidades

### 1. API de Ingestão (`/api/ingest`)

- **Método**: POST
- **Auth**: Header `Authorization: Bearer <INGEST_SECRET_KEY>`
- **Exemplo de Payload**:

    ```json
    {
      "table": "pageviews",
      "events": [
        {
          "site_id": "site_123",
          "visitor_id": "vis_abc",
          "url_full": "https://exemplo.com",
          "timestamp": "2023-10-27T10:00:00Z"
        }
      ]
    }
    ```

### 2. Dashboard (`/dashboard`)

- **Acesso**: Requer login.
- **Filtros**: Selecione o Site e o Período (Hoje, 7 dias, 30 dias).
- O Dashboard usa **Client-side Fetching** para interatividade.
- A API usa **Service Role** para garantir permissão de escrita (Upsert).
- Tipagem TypeScript completa baseada no schema fornecido.
