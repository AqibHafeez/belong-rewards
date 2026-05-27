# FanRewards API

A fan rewards REST API built for the Belong Backend Developer technical assessment. It covers auth, challenges, rewards, leaderboard, and admin CRUD — with several production-oriented patterns (async jobs, Redis caching, audit logging, and hardened security).

> For a detailed architecture overview — design rationale, request flows, diagrams, and trade-offs — see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Quick Start

### Option A — One-command Docker demo (recommended for reviewers)

```bash
cp .env.example .env   # optional; compose uses .env.example by default
docker compose up --build
```

This starts PostgreSQL, Redis, and the API. On first boot it runs migrations, seeds demo data, and starts the dev server.

| URL | Description |
|-----|-------------|
| http://localhost:3000 | API base |
| http://localhost:3000/docs | Swagger UI |
| http://localhost:3000/health | Health check (DB + Redis) |

**Demo logins** (password for all: `Test@1234`)

| Email | Points (approx.) |
|-------|------------------|
| `alice@belong.com` | 950 |
| `bob@belong.com` | 450 |
| `test@belong.com` | 0 (clean reviewer account) |

**Admin endpoints:** send header `X-Admin-Key: demo-admin-key-change-in-production` (see `.env.example`).

### Option B — Local development

```bash
# 1. Copy env and start infrastructure
cp .env.example .env
docker compose up -d postgres redis

# 2. Install dependencies
npm install

# 3. Run migrations and seed
npm run migration:run
npm run seed

# 4. Start dev server
npm run dev
```

Server runs on http://localhost:3000

## API Overview

All authenticated routes require `Authorization: Bearer <accessToken>` (obtain via `POST /api/auth/login`).

| Area | Endpoints |
|------|-----------|
| **Auth** | `POST /api/auth/register`, `/login`, `/refresh`, `/logout` |
| **Users** | `GET/PATCH /api/users/me`, `GET /api/users/me/stats` |
| **Challenges** | `GET /api/challenges`, `GET /api/challenges/:id`, `POST /api/challenges/:id/complete` |
| **Rewards** | `GET /api/rewards`, `POST /api/rewards/:id/redeem`, `GET /api/rewards/history` |
| **Leaderboard** | `GET /api/leaderboard`, `GET /api/leaderboard/me` |
| **Admin** | CRUD for challenges and rewards under `/api/admin/*` |

Responses use a consistent envelope: `{ statusCode, message, data, metadata? }`. Paginated lists include `metadata.pagination`.

## Architecture

See **[ARCHITECTURE.md](./ARCHITECTURE.md)** for the full overview: why this structure was chosen, how critical flows work, and the trade-offs involved.

At a glance:

- **Layered monolith** — routes (HTTP) → services (logic) → PostgreSQL (truth) + Redis (leaderboard cache) + Bull (async completions)
- **Async completions, sync redemptions** — queue where latency matters; transactions + row locks where correctness matters
- **Security** — JWT rotation with reuse detection, audit logs, rate limits, account lockout

## Project Structure

```
src/
├── config/           # Env config and TypeORM data source
├── entities/         # User, Challenge, ChallengeCompletion, Reward, RewardRedemption, RefreshToken, AuditLog
├── services/         # Business logic
├── routes/           # Fastify route plugins (TypeBox schemas)
├── middleware/       # JWT auth guard, admin API key guard
├── plugins/          # db, redis, bull, swagger, correlationId, auditLog, challengeEvents
├── events/           # In-process event bus (challenge.completed)
├── migrations/       # Versioned schema migrations
├── utils/            # ResponseHelper, TokenHelper, constants, explainQuery
├── __tests__/        # Unit and integration tests
├── test-utils/       # Shared test helpers
├── seed.ts           # Idempotent demo data
└── app.ts            # App factory, health check, graceful shutdown
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled output |
| `npm run migration:run` | Run database migrations |
| `npm run migration:revert` | Revert last migration |
| `npm run seed` | Seed database (idempotent) |
| `npm run docker:up` | `docker compose up --build` |
| `npm run docker:down` | Stop containers |
| `npm run docker:reset` | Tear down volumes and rebuild |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests (requires `postgres-test` profile) |
| `npm run test:coverage` | Unit tests with coverage |

### Running tests

```bash
# Unit tests (no Docker required)
npm test

# Integration tests — start test DB first
docker compose --profile test up -d postgres-test
npm run test:integration
```

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict)
- **Framework:** Fastify 4
- **ORM:** TypeORM + PostgreSQL 16
- **Cache / leaderboard:** Redis 7 (sorted sets)
- **Jobs:** Bull (Redis-backed)
- **Auth:** JWT access + refresh tokens, bcrypt passwords
- **Validation / docs:** TypeBox + Swagger UI
- **Testing:** Jest + Supertest

## Documentation

| Document | Contents |
|----------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Why this architecture, flows, trade-offs, scale notes |
| [ai_use_description.md](./ai_use_description.md) | How I used AI on this project |
| [../README.md](../README.md) | Full assessment requirements |

## Assessment Reference

Full requirements and evaluation questions: [../README.md](../README.md)
