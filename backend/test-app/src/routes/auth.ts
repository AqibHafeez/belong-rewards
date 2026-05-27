import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { AuthService } from '../services/AuthService';
import { authenticate } from '../middleware/auth';
import { ResponseHelper } from '../utils/ResponseHelper';
import { HttpStatus } from '../utils/HttpStatus';

// ─── request schemas ──────────────────────────────────────────────────────────

const RegisterBody = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8 }),
  displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
});

const LoginBody = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 1 }),
});

const TokenBody = Type.Object({
  refreshToken: Type.String({ minLength: 1 }),
});

type RegisterBodyT = Static<typeof RegisterBody>;
type LoginBodyT    = Static<typeof LoginBody>;
type TokenBodyT    = Static<typeof TokenBody>;

// ─── routes ───────────────────────────────────────────────────────────────────

export default async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService(fastify.db);

  // POST /api/auth/register
  fastify.post<{ Body: RegisterBodyT }>(
    '/register',
    { schema: { body: RegisterBody } },
    async (request, reply) => {
      const { email, password, displayName } = request.body;
      const tokens = await authService.register(email, password, displayName);
      return reply
        .status(HttpStatus.CREATED)
        .send(ResponseHelper.created(tokens, 'Account registered successfully'));
    },
  );

  // POST /api/auth/login
  fastify.post<{ Body: LoginBodyT }>(
    '/login',
    { schema: { body: LoginBody } },
    async (request, reply) => {
      const { email, password } = request.body;
      const tokens = await authService.login(email, password);
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok(tokens, 'Login successful'));
    },
  );

  // POST /api/auth/refresh  — refresh token is the credential, no Bearer needed
  fastify.post<{ Body: TokenBodyT }>(
    '/refresh',
    { schema: { body: TokenBody } },
    async (request, reply) => {
      const { refreshToken } = request.body;
      const tokens = await authService.refresh(refreshToken);
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok(tokens, 'Token refreshed successfully'));
    },
  );

  // POST /api/auth/logout  — must be authenticated
  fastify.post<{ Body: TokenBodyT }>(
    '/logout',
    { schema: { body: TokenBody }, preHandler: [authenticate] },
    async (request, reply) => {
      const { refreshToken } = request.body;
      await authService.logout(refreshToken);
      return reply.status(HttpStatus.NO_CONTENT).send();
    },
  );
}
