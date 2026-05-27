import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { cleanupTestData } from '../../test-utils/setupTestEnv';
import {
  authHeaders,
  injectJson,
  registerUser,
  seedChallenge,
  seedReward,
  waitForBullJob,
} from '../../test-utils/integrationHelpers';

interface CompletionQueued {
  jobId: string | number;
  pointsEarned: number;
}

interface RedeemResult {
  redemptionId: string;
  pointsSpent: number;
  remainingPoints: number;
}

interface UserStats {
  totalPoints: number;
  redemptionsCount: number;
}

describe('Rewards API (integration)', () => {
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

  async function creditUserPoints(email: string, points: number): Promise<string> {
    const tokens = await registerUser(app, email);
    const challenge = await seedChallenge(app.db, { points });

    const { body } = await injectJson<CompletionQueued>(app, {
      method: 'POST',
      url: `/api/challenges/${challenge.id}/complete`,
      headers: authHeaders(tokens.accessToken),
      payload: { listenPercentage: 100 },
    });

    await waitForBullJob(app.challengeQueue, body.data.jobId);
    return tokens.accessToken;
  }

  it('rejects redemption when points are insufficient', async () => {
    const email = `poor-${Date.now()}@test.com`;
    const tokens = await registerUser(app, email);
    const reward = await seedReward(app.db, { pointsCost: 500 });

    const { response } = await injectJson(app, {
      method: 'POST',
      url: `/api/rewards/${reward.id}/redeem`,
      headers: authHeaders(tokens.accessToken),
    });

    expect(response.statusCode).toBe(400);
  });

  it('redeems a reward and deducts points', async () => {
    const email = `redeem-${Date.now()}@test.com`;
    const accessToken = await creditUserPoints(email, 200);
    const reward = await seedReward(app.db, { pointsCost: 75 });

    const { response, body } = await injectJson<RedeemResult>(app, {
      method: 'POST',
      url: `/api/rewards/${reward.id}/redeem`,
      headers: authHeaders(accessToken),
    });

    expect(response.statusCode).toBe(201);
    expect(body.data.remainingPoints).toBe(125);

    const stats = await injectJson<UserStats>(app, {
      method: 'GET',
      url: '/api/users/me/stats',
      headers: authHeaders(accessToken),
    });

    expect(stats.body.data.totalPoints).toBe(125);
    expect(stats.body.data.redemptionsCount).toBe(1);
  });

  it('prevents double-spend under concurrent redemption requests', async () => {
    const email = `concurrent-${Date.now()}@test.com`;
    const accessToken = await creditUserPoints(email, 100);
    const reward = await seedReward(app.db, { pointsCost: 100 });

    const headers = authHeaders(accessToken);
    const url = `/api/rewards/${reward.id}/redeem`;

    const results = await Promise.all([
      app.inject({ method: 'POST', url, headers }),
      app.inject({ method: 'POST', url, headers }),
    ]);

    const statuses = results.map((r) => r.statusCode).sort();
    expect(statuses).toEqual([201, 400]);

    const stats = await injectJson<UserStats>(app, {
      method: 'GET',
      url: '/api/users/me/stats',
      headers,
    });

    expect(stats.body.data.totalPoints).toBe(0);
    expect(stats.body.data.redemptionsCount).toBe(1);
  });
});
