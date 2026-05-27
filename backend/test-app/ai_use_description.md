# AI Use — FanRewards API

**Tool:** [Cursor](https://cursor.com) (Sonnet 4.6 Agent mode)

Cursor wrote a lot of the code. I still drove the project — architecture, business rules, and what actually shipped. AI was a speed layer for boilerplate and repetition so I could spend time on the parts that matter for the assessment.

---

## How I actually used it

### My job: decide, challenge, conclude

For anything non-trivial I did not take the first answer:

1. **Read the assessment spec** and decided what to build (core API + bonus items worth the time).
2. **Asked Cursor for options** (e.g. async completion, leaderboard storage, redemption concurrency).
3. **Cross-questioned the suggestions** — “what if two redeems hit at once?”, “where is the source of truth for points?”, “what happens on job retry?”
4. **Pushed my own direction** when the default was wrong or too shallow.
5. **Made the final call** and had Agent implement *that* design.

Example — **challenge completion:**

- I wanted a fast response and async processing.
- Cursor suggested writing points to Redis first and persisting later.
- I rejected it: redemption and leaderboard depend on a reliable DB balance.
- **My conclusion:** enqueue Bull job → PostgreSQL credits points (`bullJobId` idempotency) → emit event → update Redis ZSET. HTTP returns `jobId` + estimated points only.

Example — **leaderboard:**

- I asked for Redis sorted sets, not SQL `RANK()` on every read.
- Cursor drafted `ZREVRANGE` + tie handling; I validated behaviour with seeded users in Swagger.

Example — **redemptions:**

- I required explicit concurrency handling for the review discussion.
- I went with `SELECT FOR UPDATE` in a transaction; I verified insufficient-points and double-redeem scenarios manually.

Those flows are in [ARCHITECTURE.md](./ARCHITECTURE.md) because **I** chose them after back-and-forth, not because Cursor picked them once.

### Cursor’s job: boilerplate and repeated work

I used Agent where typing the same patterns again would not add value:

| Delegated to AI | I focused on |
|---------------|--------------|
| Entity/migration scaffolding, route + TypeBox boilerplate | Service-layer rules (80% listen, point formula, lockout) |
| Plugin wiring templates (db, redis, bull, swagger) | Plugin *order* and what runs on `onClose` |
| Jest mocks, integration test harness | What to assert (double-spend, token reuse, pagination) |
| Docker compose / entrypoint scripts | One-command reviewer experience |
| README / ARCHITECTURE drafts from the codebase | Accuracy, trade-offs, first-person wording |

Rough split in my head: **~70% of lines touched by AI, ~100% of architecture and business logic owned by me** after review.

---

## What I owned end-to-end

- **Architecture** — layered monolith, async vs sync paths, Redis as read cache not write truth, event bus scope.
- **Business logic** — partial points below 80%, multiple completions per challenge, redemption status, auth lockout + refresh rotation policy.
- **Security choices** — reuse detection nukes all sessions, audit redaction, admin key vs JWT roles.
- **Verification** — `npm test`, integration tests, Swagger walkthroughs with demo users.
- **Documentation** — edited AI drafts so they reflect decisions I made and trade-offs I accept.

---

## My workflow (short)

1. Define the slice (“RewardService redeem with row lock”).
2. Let Cursor generate; **read the diff**.
3. Run tests; if red, paste error or fix myself.
4. For design questions: ask → challenge → propose alternative → **conclude** → implement.

I did **not** one-shot “build the entire API” and submit. It was iterative, and the interesting parts are where I disagreed with the tool.

---

## Honest line

Cursor accelerated implementation. If you ask me about pessimistic locking, refresh token reuse, or why completion is async but redeem is sync, I can answer from **my** decisions — the doc and code match what I concluded after questioning the suggestions, not a blind paste.
