import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { cleanupTestData } from '../../test-utils/setupTestEnv';
import {
  authHeaders,
  injectJson,
  registerUser,
  seedChallenge,
  waitForBullJob,
} from '../../test-utils/integrationHelpers';

interface CompletionQueued {
  jobId: string | number;
  pointsEarned: number;
}

interface UserStats {
  totalPoints: number;
  completionsCount: number;
}

describe('Challenges API (integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanupTestData(app.db, app.redis);
  });

  it('lists public challenges without auth', async () => {
    await seedChallenge(app.db, { title: `Public-${Date.now()}` });

    const { response, body } = await injectJson<unknown[]>(app, {
      method: 'GET',
      url: '/api/challenges',
    });

    expect(response.statusCode).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('queues completion, processes job, and credits points', async () => {
    const email = `challenge-${Date.now()}@test.com`;
    const tokens = await registerUser(app, email);
    const challenge = await seedChallenge(app.db, { points: 120 });

    const { response, body } = await injectJson<CompletionQueued>(app, {
      method: 'POST',
      url: `/api/challenges/${challenge.id}/complete`,
      headers: authHeaders(tokens.accessToken),
      payload: { listenPercentage: 100 },
    });

    expect(response.statusCode).toBe(200);
    expect(body.data.pointsEarned).toBe(120);
    expect(body.data.jobId).toBeDefined();

    await waitForBullJob(app.challengeQueue, body.data.jobId);

    const stats = await injectJson<UserStats>(app, {
      method: 'GET',
      url: '/api/users/me/stats',
      headers: authHeaders(tokens.accessToken),
    });

    expect(stats.response.statusCode).toBe(200);
    expect(stats.body.data.totalPoints).toBe(120);
    expect(stats.body.data.completionsCount).toBe(1);
  });

  it('does not double-credit points when the same Bull job is retried', async () => {
    const email = `idempotent-${Date.now()}@test.com`;
    const tokens = await registerUser(app, email);
    const challenge = await seedChallenge(app.db, { points: 80 });

    const { body } = await injectJson<CompletionQueued>(app, {
      method: 'POST',
      url: `/api/challenges/${challenge.id}/complete`,
      headers: authHeaders(tokens.accessToken),
      payload: { listenPercentage: 100 },
    });

    await waitForBullJob(app.challengeQueue, body.data.jobId);

    const job = await app.challengeQueue.getJob(body.data.jobId);
    expect(job).toBeDefined();

    const { ChallengeService } = await import('../../services/ChallengeService');
    const service = new ChallengeService(app.db);
    await service.processCompletionJob(job!);
    await service.processCompletionJob(job!);

    const stats = await injectJson<UserStats>(app, {
      method: 'GET',
      url: '/api/users/me/stats',
      headers: authHeaders(tokens.accessToken),
    });

    expect(stats.body.data.totalPoints).toBe(80);
    expect(stats.body.data.completionsCount).toBe(1);
  });
});
