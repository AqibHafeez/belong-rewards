# FanRewards API — Architecture

This document explains **why** the FanRewards API is structured the way it is, how the pieces fit together, and the trade-offs I accepted along the way.

For setup and running the project, see [README.md](./README.md).

---

## Why this architecture?

The assessment asks for a backend that mirrors patterns used on Belong's platform: **Fastify + TypeScript**, **TypeORM + PostgreSQL**, **JWT auth**, **service-layer separation**, and production-minded concerns (concurrency, security, performance). The architecture is not arbitrary — each layer exists to satisfy a specific requirement or risk:

| Goal | Architectural response |
|------|------------------------|
| Demonstrate clean separation of concerns | Routes → Services → Entities |
| Handle concurrent point spending safely | DB transactions + pessimistic row locks |
| Keep challenge completion fast under load | Async job queue (Bull) off the HTTP thread |
| Serve leaderboard reads at scale | Redis sorted set as a read-optimized cache |
| Prove security awareness | Token rotation, reuse detection, lockout, audit logs |
| Be easy to review and run locally | Docker Compose one-command demo, Swagger, seed data |
| Stay testable without a full stack | `buildApp()` factory, unit tests on services |

I optimised for **clarity, correctness under concurrency, and reviewer ergonomics** — not for maximum microservice decomposition. A single deployable Node process with clear internal boundaries is the right scope for this assessment; the design still shows where you would split things later.

---

## High-level overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Client (Swagger / app)                          │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ HTTP
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Fastify (app.ts)                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────────────┐ │
│  │ Middleware  │  │ Plugins      │  │ Routes (TypeBox validation)     │ │
│  │ JWT, Admin  │  │ db, redis,   │  │ auth, users, challenges,        │ │
│  │             │  │ bull, audit, │  │ rewards, leaderboard, admin     │ │
│  │             │  │ swagger, …   │  │                                 │ │
│  └─────────────┘  └──────────────┘  └──────────────┬──────────────────┘ │
│                                                     │                   │
│                                                     ▼                   │
│                              ┌──────────────────────────────────┐     │
│                              │ Services (business logic)        │     │
│                              │ Auth, Challenge, Reward,         │     │
│                              │ Leaderboard, User, Admin, Audit  │     │
│                              └──────────┬───────────────┬───────┘     │
└─────────────────────────────────────────┼───────────────┼─────────────┘
                                          │               │
              ┌───────────────────────────┼───────────────┼───────────────┐
              ▼                           ▼               ▼               ▼
     ┌────────────────┐        ┌──────────────┐  ┌────────────┐  ┌──────────────┐
     │  PostgreSQL    │        │  Redis       │  │  Bull      │  │  Event bus   │
     │  (source of    │        │  leaderboard │  │  challenge │  │  challenge.  │
     │   truth)       │        │  ZSET cache  │  │  completions│  │  completed   │
     └────────────────┘        └──────────────┘  └────────────┘  └──────────────┘
```

**Request path (typical):** Client → Fastify route (validate + auth) → Service → PostgreSQL / Redis / Bull → response envelope.

**Write path (challenge complete):** Route enqueues Bull job → HTTP returns → Worker writes DB → emits event → Redis leaderboard updated.

---

## Layered design

### Routes (`src/routes/`)

Routes own **HTTP concerns only**:

- TypeBox schemas for query, body, and params (also feed Swagger)
- `preHandler: [authenticate]` where required
- Mapping service results to `ResponseHelper.ok()` / `paginated()` / `created()`
- Route-scoped rate limits (e.g. stricter on `/api/auth`)

They do **not** contain business rules (point calculations, locking, token rotation). That keeps handlers short and makes integration tests focus on HTTP contracts while unit tests cover logic.

### Services (`src/services/`)

Services own **domain logic and orchestration**:

| Service | Responsibility |
|---------|----------------|
| `AuthService` | Register, login, refresh rotation, logout, lockout |
| `ChallengeService` | List/filter challenges, enqueue & process completions, point formula |
| `RewardService` | List rewards, redeem with locking, redemption history |
| `LeaderboardService` | Top fans, my rank, cache warm/sync |
| `UserService` | Profile, stats aggregates |
| `AdminService` | Admin CRUD for challenges and rewards |
| `AuditService` | Persist audit rows (called from plugin) |

Services receive `DataSource` and/or `Redis` via constructor injection — no global singletons — so tests can pass mocks or a test database.

### Entities (`src/entities/`)

TypeORM entities model the relational schema:

- **User** — `totalPoints` denormalised for fast reads and leaderboard sync; `failedLoginAttempts` / `lockedUntil` for lockout
- **Challenge** / **ChallengeCompletion** — completions are append-only; `bullJobId` unique for idempotent job processing
- **Reward** / **RewardRedemption** — redemptions track `status` (pending → fulfilled flow left open for ops)
- **RefreshToken** — hashed token storage, `revokedAt` for rotation and reuse detection
- **AuditLog** — append-only request audit trail

PostgreSQL remains the **source of truth** for balances and history. Redis mirrors leaderboard scores for read performance only.

### Plugins (`src/plugins/`)

Cross-cutting infrastructure is registered as Fastify plugins with explicit dependencies:

```
swagger, correlationId → helmet, cors, rateLimit
  → db → auditLog
  → redis → bull → challengeEvents
```

`buildApp()` in `app.ts` is shared by the production server and integration tests — one place to wire the stack.

---

## Critical flows

### Authentication

```
Register/Login → bcrypt hash/compare → issue JWT pair
              → store SHA-256 hash of refresh token in DB

Refresh → verify JWT → find token by hash
       → if revoked: invalidate ALL user sessions (reuse attack)
       → else: revoke old token, issue new pair

Logout → revoke refresh token by hash
```

Access tokens are short-lived and stateless. Refresh tokens are stateful (DB-backed) so I can rotate and revoke them. I hash tokens at rest — a DB leak does not immediately yield usable refresh tokens.

### Challenge completion (async + idempotent)

```
POST /complete
  → validate listenPercentage
  → calculate estimated points (sync, for response)
  → Bull queue.add({ userId, challengeId, listenPercentage })
  → return { jobId, pointsEarned }

Worker (processCompletionJob)
  → BEGIN TRANSACTION
  → INSERT completion ON CONFLICT (bullJobId) DO NOTHING
  → if inserted: increment user.totalPoints
  → COMMIT
  → emit challenge.completed { newTotalPoints }
  → listener: Redis ZADD leaderboard
```

**Point formula:** ≥ 80% listen → full challenge points; below 80% → `floor(points × listenPercentage / 100)`.

The HTTP response is **optimistic** — points are credited asynchronously. Clients should treat `jobId` as the handle for eventual consistency (in a full product, you might add `GET /completions/:jobId` status).

### Reward redemption (synchronous + locked)

```
POST /redeem
  → BEGIN TRANSACTION
  → SELECT user FOR UPDATE
  → check balance, deduct points, insert redemption
  → COMMIT
  → Redis ZADD (sync leaderboard down)
```

Redemption is **synchronous** because the user needs an immediate success/failure answer and I must prevent double-spend. Pessimistic locking on the user row serialises concurrent redemptions for the same account.

### Leaderboard reads

```
GET /leaderboard
  → ZREVRANGE (page of userIds + scores)
  → ZCARD (total)
  → pipeline ZCOUNT per unique score (tie-aware rank)
  → single DB query for display names

GET /leaderboard/me
  → ZSCORE + ZCOUNT, or fallback to DB if not in ZSET yet
```

On startup, `syncFromDB()` rebuilds the Redis ZSET from `users.totalPoints > 0` so restarts do not leave a cold cache.

---

## Data model (relations)

```
User 1──* ChallengeCompletion *──1 Challenge
User 1──* RewardRedemption     *──1 Reward
User 1──* RefreshToken
```

Indexes support common queries: `users.email` (unique), `users.totalPoints`, `challenge_completions(userId, completedAt)`, `challenge_completions.bullJobId` (unique).

---

## Security model

| Concern | Approach |
|---------|----------|
| Passwords | bcrypt (configurable rounds) |
| API auth | Bearer JWT (access) |
| Session refresh | Rotating refresh tokens in DB |
| Token theft | Reuse detection → revoke all sessions |
| Brute force | Account lockout after N failures |
| Enumeration | Dummy bcrypt on unknown email at login |
| Admin | Separate `X-Admin-Key` (not mixed into JWT roles) |
| Transport / headers | Helmet, CORS whitelist |
| Abuse | Global + auth-specific rate limits |
| Audit | Mutating requests logged; secrets redacted |

---

## Trade-offs

Honest limitations and what I gave up to gain something else:

### 1. Monolith vs microservices

| Chosen | Trade-off |
|--------|-----------|
| Single Node process with internal layers | Simpler to run, test, and review. Cannot scale challenge workers independently without running another process that shares the same Bull queue. At Belong scale, completion workers and API servers would likely split first. |

### 2. Async challenge completion

| Chosen | Trade-off |
|--------|-----------|
| Bull queue; HTTP returns before points are persisted | Better latency and resilience under spikes. **Eventual consistency:** `totalPoints` and leaderboard may lag by seconds; client sees estimated `pointsEarned` before DB confirms. A failed job after HTTP 200 requires monitoring/alerting (I log failures on the queue). |

### 3. Denormalised `user.totalPoints` + Redis cache

| Chosen | Trade-off |
|--------|-----------|
| Points on `users` row; Redis ZSET for reads | Fast leaderboard and profile reads. **Three places** can hold score truth momentarily (completion row sum vs `totalPoints` vs Redis). I update Redis after DB commit and on redeem, but a crash between commit and `ZADD` could stale the cache until restart (`syncFromDB`) or next write. Production would add reconciliation jobs or transactional outbox. |

### 4. In-process event bus

| Chosen | Trade-off |
|--------|-----------|
| `EventEmitter` for `challenge.completed` | Simple, no extra broker. Events are **lost if the process crashes** before listeners run, and **not shared across instances** — multiple API replicas would each need their own listener or a move to Redis Pub/Sub / SNS. Fine for single-instance demo; wrong for multi-replica without change. |

### 5. Pessimistic locking on redemption

| Chosen | Trade-off |
|--------|-----------|
| `SELECT FOR UPDATE` on user row | Correct and easy to reason about. **Contention:** high-volume redeem on one account queues requests; at extreme scale you might use optimistic locking with version column or atomic `UPDATE … WHERE totalPoints >= cost`. |

### 6. Refresh token reuse → revoke all sessions

| Chosen | Trade-off |
|--------|-----------|
| Nuclear invalidation on reuse detection | Strong security when theft is suspected. **UX cost:** legitimate user with two devices might get logged out everywhere if an old tab replays a consumed token. Acceptable for high-security; product might soften with device-scoped tokens. |

### 7. Admin API key vs RBAC

| Chosen | Trade-off |
|--------|-----------|
| Shared secret header for admin routes | Minimal code, easy for reviewers. **Not suitable for production admin** — no per-admin identity, rotation story, or fine-grained permissions. Would become role-based JWT or SSO integration. |

### 8. Fire-and-forget audit logs

| Chosen | Trade-off |
|--------|-----------|
| Async `auditService.log()` in `onResponse` | Never blocks the client. **Risk:** audit row might be lost if the process dies mid-write; no guaranteed delivery. Production often uses a durable queue (SQS, Kafka) for audit events. |

### 9. Bull (legacy) vs modern queues

| Chosen | Trade-off |
|--------|-----------|
| Bull 4 on Redis | Well understood, fits assessment bonus. Bull is in maintenance mode; greenfield might pick BullMQ, SQS, or Temporal. Same conceptual trade-off: operational complexity of Redis + workers vs inline processing. |

### 10. TypeORM

| Chosen | Trade-off |
|--------|-----------|
| Matches assessment stack | Migrations and entities are productive. Trade-offs vs raw SQL or Prisma: heavier runtime, some query patterns need `QueryBuilder`, N+1 risks if relations are loaded carelessly (I mostly use explicit queries). |

### 11. Test split (unit vs integration)

| Chosen | Trade-off |
|--------|-----------|
| Unit tests mock DB/Redis; integration tests need Docker | Fast default `npm test`. Integration suite is slower and requires `postgres-test` profile — not run in CI unless configured. |

---

## What I would add at scale

These are intentional gaps for assessment scope, not oversights:

1. **Transactional outbox** — publish `challenge.completed` and leaderboard updates atomically with the DB commit.
2. **Job status endpoint** — poll completion by `jobId` for clients.
3. **Leaderboard reconciliation** — periodic job comparing `SUM(points)` vs `totalPoints` vs Redis.
4. **Read replicas** — route leaderboard name lookups and list endpoints to replicas.
5. **Materialised leaderboard** — precomputed ranks table refreshed by worker if Redis is insufficient.
6. **Distributed tracing** — OpenTelemetry from correlation ID through Bull jobs.
7. **Structured RBAC** — replace admin API key with scoped roles.

---

## File map (architecture-relevant)

| Path | Role |
|------|------|
| `src/app.ts` | Compose plugins, routes, error handler, health, shutdown |
| `src/config/` | Environment and TypeORM data source |
| `src/routes/*.ts` | HTTP + TypeBox + thin delegation |
| `src/services/*.ts` | Business logic |
| `src/entities/*.ts` | Schema and relations |
| `src/plugins/*.ts` | Infrastructure wiring |
| `src/events/challengeEvents.ts` | In-process event bus |
| `src/middleware/auth.ts` | JWT guard |
| `src/errors.ts` + `src/utils/ResponseHelper.ts` | Errors and API envelope |
| `src/migrations/` | Schema evolution |

---

## Summary

I implemented a **layered monolith** that separates HTTP from domain logic, uses **PostgreSQL as the source of truth**, **Bull for async writes** where latency matters, **pessimistic transactions** where correctness matters, and **Redis** where read patterns demand speed. The architecture exists to satisfy assessment requirements while demonstrating how Belong-style backends handle **concurrency, security, and performance** — with documented trade-offs where simpler choices were appropriate for scope and time.
