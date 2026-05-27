import { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import Bull from 'bull';
import { DataSource } from 'typeorm';
import { Challenge } from '../entities/Challenge';
import { Reward } from '../entities/Reward';
import type { ApiResponse } from '../utils/ResponseHelper';
import type { TokenPair } from '../types';
import {
  AUTH_BEARER_PREFIX,
  HTTP_HEADER_ADMIN_API_KEY,
  HTTP_HEADER_AUTHORIZATION,
} from '../utils/constants';

export const TEST_PASSWORD = 'Test@1234';
export const TEST_ADMIN_KEY = process.env.ADMIN_API_KEY || 'test-admin-key';

export function authHeaders(accessToken: string): Record<string, string> {
  return { [HTTP_HEADER_AUTHORIZATION]: `${AUTH_BEARER_PREFIX}${accessToken}` };
}

export function adminHeaders(): Record<string, string> {
  return { [HTTP_HEADER_ADMIN_API_KEY]: TEST_ADMIN_KEY };
}

export function parseJson<T>(response: LightMyRequestResponse): ApiResponse<T> {
  return JSON.parse(response.payload) as ApiResponse<T>;
}

export async function injectJson<T>(
  app: FastifyInstance,
  options: InjectOptions,
): Promise<{ response: LightMyRequestResponse; body: ApiResponse<T> }> {
  const response = await app.inject(options);
  return { response, body: parseJson<T>(response) };
}

export async function registerUser(
  app: FastifyInstance,
  email: string,
  displayName = 'Test User',
): Promise<TokenPair> {
  const { response, body } = await injectJson<TokenPair>(app, {
    method: 'POST',
    url: '/api/auth/register',
    payload: { email, password: TEST_PASSWORD, displayName },
  });

  if (response.statusCode !== 201) {
    throw new Error(`Register failed: ${response.statusCode} ${response.payload}`);
  }

  return body.data;
}

export async function loginUser(app: FastifyInstance, email: string): Promise<TokenPair> {
  const { response, body } = await injectJson<TokenPair>(app, {
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: TEST_PASSWORD },
  });

  if (response.statusCode !== 200) {
    throw new Error(`Login failed: ${response.statusCode} ${response.payload}`);
  }

  return body.data;
}

export async function waitForBullJob(
  queue: Bull.Queue,
  jobId: string | number,
  timeoutMs = 15_000,
): Promise<void> {
  const job = await queue.getJob(jobId);
  if (!job) {
    throw new Error(`Bull job ${jobId} not found`);
  }

  await Promise.race([
    job.finished(),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Bull job ${jobId} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

export async function seedChallenge(
  db: DataSource,
  overrides: Partial<Challenge> = {},
): Promise<Challenge> {
  const repo = db.getRepository(Challenge);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return repo.save(
    repo.create({
      title: `Challenge ${unique}`,
      artist: 'Test Artist',
      description: 'Integration test challenge',
      points: 100,
      durationSeconds: 180,
      difficulty: 'easy',
      isActive: true,
      ...overrides,
    }),
  );
}

export async function seedReward(
  db: DataSource,
  overrides: Partial<Reward> = {},
): Promise<Reward> {
  const repo = db.getRepository(Reward);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return repo.save(
    repo.create({
      name: `Reward ${unique}`,
      description: 'Integration test reward',
      pointsCost: 50,
      isAvailable: true,
      ...overrides,
    }),
  );
}
