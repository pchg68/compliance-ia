# Vexiajuris Guard App

Aplicação Next.js + tRPC do Vexiajuris Guard, a camada de governança e trilha de auditoria para uso de IA em contexto jurídico.

## Stack

- Next.js 16
- React 19
- tRPC 11
- PostgreSQL/Supabase
- Vitest

## Ambiente local

Pré-requisito: Docker Desktop/Engine em execução para subir o Supabase local.

```bash
npm ci
npx supabase start
npm run dev
```

Serviços locais padrão:

- App: `http://localhost:3000`
- Supabase API: `http://localhost:54321`
- Postgres: `localhost:54322`
- Studio: `http://localhost:54323`

## Variáveis de ambiente

Copie `.env.example` para `.env.local` e ajuste o que for necessário.

Em desenvolvimento local, os fallbacks do projeto já apontam para o Supabase local. Para ambientes reais, defina explicitamente:

- `DATABASE_URL`
- `BOOTSTRAP_DATABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DATAJUD_API_KEY`
- `ANTHROPIC_API_KEY`

## Comandos úteis

```bash
# lint
npm run lint

# build de produção
npm run build

# testes
npm test

# parar stack local
npx supabase stop
```

## Observações

- Os testes de banco dependem do Postgres local do Supabase.
- O fluxo `/registrar` atual mascara o conteúdo no cliente antes de enviá-lo ao núcleo da aplicação.
- A trilha principal é append-only e a verificação da cadeia pode ser consultada no dashboard.
