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
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string | null;
  totalPoints: number;
}

interface MyRank {
  rank: number;
  totalPoints: number;
}

describe('Leaderboard API (integration)', () => {
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

  async function completeChallenge(accessToken: string, points: number): Promise<void> {
    const challenge = await seedChallenge(app.db, { points });

    const { body } = await injectJson<CompletionQueued>(app, {
      method: 'POST',
      url: `/api/challenges/${challenge.id}/complete`,
      headers: authHeaders(accessToken),
      payload: { listenPercentage: 100 },
    });

    await waitForBullJob(app.challengeQueue, body.data.jobId);
  }

  it('returns fans ranked by total points', async () => {
    const alice = await registerUser(app, `alice-${Date.now()}@test.com`, 'Alice');
    const bob = await registerUser(app, `bob-${Date.now()}@test.com`, 'Bob');

    await completeChallenge(alice.accessToken, 300);
    await completeChallenge(bob.accessToken, 150);

    const { response, body } = await injectJson<LeaderboardEntry[]>(app, {
      method: 'GET',
      url: '/api/leaderboard?limit=10',
      headers: authHeaders(alice.accessToken),
    });

    expect(response.statusCode).toBe(200);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.data[0].totalPoints).toBeGreaterThanOrEqual(body.data[1].totalPoints);
    expect(body.data[0].rank).toBe(1);
  });

  it('assigns the same rank to users with tied scores', async () => {
    const userA = await registerUser(app, `tie-a-${Date.now()}@test.com`, 'Tie A');
    const userB = await registerUser(app, `tie-b-${Date.now()}@test.com`, 'Tie B');

    await completeChallenge(userA.accessToken, 100);
    await completeChallenge(userB.accessToken, 100);

    const { body } = await injectJson<LeaderboardEntry[]>(app, {
      method: 'GET',
      url: '/api/leaderboard?limit=10',
      headers: authHeaders(userA.accessToken),
    });

    const tied = body.data.filter((e) => e.totalPoints === 100);
    expect(tied.length).toBeGreaterThanOrEqual(2);
    expect(tied[0].rank).toBe(tied[1].rank);
  });

  it('returns the current user rank via /me', async () => {
    const email = `rank-me-${Date.now()}@test.com`;
    const tokens = await registerUser(app, email, 'Rank Me');

    await completeChallenge(tokens.accessToken, 250);

    const { response, body } = await injectJson<MyRank>(app, {
      method: 'GET',
      url: '/api/leaderboard/me',
      headers: authHeaders(tokens.accessToken),
    });

    expect(response.statusCode).toBe(200);
    expect(body.data.totalPoints).toBe(250);
    expect(body.data.rank).toBe(1);
  });
});
