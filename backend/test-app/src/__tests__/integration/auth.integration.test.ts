import { FastifyInstance } from 'fastify';
import { buildApp } from '../../app';
import { cleanupTestData } from '../../test-utils/setupTestEnv';
import {
  authHeaders,
  injectJson,
  loginUser,
  registerUser,
  TEST_PASSWORD,
} from '../../test-utils/integrationHelpers';
import type { TokenPair } from '../../types';

describe('Auth API (integration)', () => {
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

  it('registers a new user and returns tokens', async () => {
    const email = `user-${Date.now()}@test.com`;

    const { response, body } = await injectJson<TokenPair>(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: TEST_PASSWORD, displayName: 'Alice' },
    });

    expect(response.statusCode).toBe(201);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
  });

  it('rejects duplicate registration with 409', async () => {
    const email = `dup-${Date.now()}@test.com`;
    await registerUser(app, email);

    const { response } = await injectJson(app, {
      method: 'POST',
      url: '/api/auth/register',
      payload: { email, password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(409);
  });

  it('logs in and accesses protected profile', async () => {
    const email = `login-${Date.now()}@test.com`;
    await registerUser(app, email);

    const tokens = await loginUser(app, email);

    const { response, body } = await injectJson<{ email: string; displayName: string | null }>(app, {
      method: 'GET',
      url: '/api/users/me',
      headers: authHeaders(tokens.accessToken),
    });

    expect(response.statusCode).toBe(200);
    expect(body.data.email).toBe(email);
  });

  it('rotates refresh token on refresh', async () => {
    const email = `refresh-${Date.now()}@test.com`;
    const initial = await registerUser(app, email);

    const { response, body } = await injectJson<TokenPair>(app, {
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: initial.refreshToken },
    });

    expect(response.statusCode).toBe(200);
    expect(body.data.refreshToken).not.toBe(initial.refreshToken);
    expect(body.data.accessToken).not.toBe(initial.accessToken);
  });

  it('invalidates old refresh token after rotation (reuse detection)', async () => {
    const email = `reuse-${Date.now()}@test.com`;
    const initial = await registerUser(app, email);

    await injectJson<TokenPair>(app, {
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: initial.refreshToken },
    });

    const { response } = await injectJson(app, {
      method: 'POST',
      url: '/api/auth/refresh',
      payload: { refreshToken: initial.refreshToken },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects protected routes without a token', async () => {
    const { response } = await injectJson(app, {
      method: 'GET',
      url: '/api/users/me',
    });

    expect(response.statusCode).toBe(401);
  });
});
