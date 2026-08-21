# Aureon Base

Aureon Base é a infraestrutura backend dos produtos Aureon. A versão `v0.1` começa pequena e focada: autenticação, PostgreSQL, API, multi-projeto, isolamento de dados e SDK JavaScript inicial.

## O que já existe

- API Node.js + Express
- PostgreSQL
- Cadastro e login com senha protegida por bcrypt
- JWT para autenticação
- Usuários ativos/inativos
- Projetos e associação usuário ↔ projeto
- Logs de auditoria
- Projeto inicial `tradevision`
- Operações do TradeVision isoladas por usuário
- SDK JavaScript inicial
- Docker Compose para desenvolvimento local
- Headers de segurança com Helmet
- CORS configurável por ambiente

## Estrutura

```text
Aureon-Base/
├── database/
│   └── schema.sql
├── sdk/
│   └── aureon.js
├── src/
│   ├── auth.js
│   ├── db.js
│   └── server.js
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
└── README.md
```

## Rodar localmente

1. Copie `.env.example` para `.env`.
2. Troque `JWT_SECRET` por uma chave aleatória longa.
3. Inicie o PostgreSQL:

```bash
docker compose up -d
```

4. Instale as dependências:

```bash
npm install
```

5. Rode a API:

```bash
npm run dev
```

6. Teste:

```text
GET http://localhost:3000/health
```

## Endpoints v0.1

```text
GET    /health
POST   /auth/register
POST   /auth/login
GET    /me
GET    /projects
GET    /projects/:slug/operations
POST   /projects/:slug/operations
DELETE /projects/:slug/operations/:id
```

## TradeVision

O schema já cria automaticamente o projeto:

```text
slug: tradevision
name: TradeVision
```

Depois que a usuária for cadastrada, ela precisa ser vinculada ao projeto `tradevision` na tabela `project_users`. A integração com o PWA será feita pelo SDK localizado em `sdk/aureon.js`.

## Segurança

Nunca envie para o GitHub:

- `.env`
- `JWT_SECRET`
- senha do PostgreSQL de produção
- tokens privados
- chaves administrativas

O repositório contém apenas `.env.example` com valores de desenvolvimento.

## Próximas versões

- refresh tokens
- recuperação de senha
- convites de usuários
- painel administrativo
- API keys por projeto
- rate limiting persistente
- storage
- realtime
- migrations versionadas
- backups

> Aureon Base ainda não é um substituto completo do Supabase. A v0.1 é o núcleo próprio sobre o qual os serviços seguintes serão construídos.