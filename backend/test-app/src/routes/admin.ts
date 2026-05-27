import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { adminAuthenticate } from '../middleware/adminAuth';
import { AdminService } from '../services/AdminService';
import { ResponseHelper } from '../utils/ResponseHelper';
import { HttpStatus } from '../utils/HttpStatus';
import { AppError } from '../errors';

// ─── challenge schemas ────────────────────────────────────────────────────────

const DifficultyEnum = Type.Union([
  Type.Literal('easy'),
  Type.Literal('medium'),
  Type.Literal('hard'),
]);

const CreateChallengeBody = Type.Object({
  title:           Type.String({ minLength: 1, maxLength: 200 }),
  artist:          Type.String({ minLength: 1, maxLength: 200 }),
  description:     Type.String({ minLength: 1 }),
  points:          Type.Integer({ minimum: 1 }),
  durationSeconds: Type.Integer({ minimum: 1 }),
  difficulty:      DifficultyEnum,
  isActive:        Type.Optional(Type.Boolean()),
});

const UpdateChallengeBody = Type.Partial(
  Type.Object({
    title:           Type.String({ minLength: 1, maxLength: 200 }),
    artist:          Type.String({ minLength: 1, maxLength: 200 }),
    description:     Type.String({ minLength: 1 }),
    points:          Type.Integer({ minimum: 1 }),
    durationSeconds: Type.Integer({ minimum: 1 }),
    difficulty:      DifficultyEnum,
    isActive:        Type.Boolean(),
  }),
);

// ─── reward schemas ───────────────────────────────────────────────────────────

const CreateRewardBody = Type.Object({
  name:        Type.String({ minLength: 1, maxLength: 200 }),
  description: Type.String({ minLength: 1 }),
  pointsCost:  Type.Integer({ minimum: 1 }),
  isAvailable: Type.Optional(Type.Boolean()),
});

const UpdateRewardBody = Type.Partial(
  Type.Object({
    name:        Type.String({ minLength: 1, maxLength: 200 }),
    description: Type.String({ minLength: 1 }),
    pointsCost:  Type.Integer({ minimum: 1 }),
    isAvailable: Type.Boolean(),
  }),
);

type CreateChallengeBodyT = Static<typeof CreateChallengeBody>;
type UpdateChallengeBodyT = Static<typeof UpdateChallengeBody>;
type CreateRewardBodyT    = Static<typeof CreateRewardBody>;
type UpdateRewardBodyT    = Static<typeof UpdateRewardBody>;

// ─── routes ───────────────────────────────────────────────────────────────────

export default async function adminRoutes(fastify: FastifyInstance) {
  const adminService = new AdminService(fastify.db);

  fastify.addHook('onRoute', (route) => {
    route.schema = route.schema ?? {};
    route.schema.tags = ['admin'];
    route.schema.security = [{ adminApiKey: [] }];
  });

  fastify.addHook('preHandler', adminAuthenticate);

  // ── Challenges ──────────────────────────────────────────────────────────────

  fastify.post<{ Body: CreateChallengeBodyT }>(
    '/challenges',
    { schema: { body: CreateChallengeBody } },
    async (request, reply) => {
      const challenge = await adminService.createChallenge(request.body);
      return reply
        .status(HttpStatus.CREATED)
        .send(ResponseHelper.created(challenge, 'Challenge created successfully'));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateChallengeBodyT }>(
    '/challenges/:id',
    { schema: { body: UpdateChallengeBody } },
    async (request, reply) => {
      if (Object.keys(request.body).length === 0) {
        throw new AppError(HttpStatus.BAD_REQUEST, 'No fields provided to update');
      }
      const challenge = await adminService.updateChallenge(request.params.id, request.body);
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok(challenge, 'Challenge updated successfully'));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/challenges/:id',
    async (request, reply) => {
      const result = await adminService.deactivateChallenge(request.params.id);
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok(result, 'Challenge deactivated successfully'));
    },
  );

  // ── Rewards ─────────────────────────────────────────────────────────────────

  fastify.post<{ Body: CreateRewardBodyT }>(
    '/rewards',
    { schema: { body: CreateRewardBody } },
    async (request, reply) => {
      const reward = await adminService.createReward(request.body);
      return reply
        .status(HttpStatus.CREATED)
        .send(ResponseHelper.created(reward, 'Reward created successfully'));
    },
  );

  fastify.patch<{ Params: { id: string }; Body: UpdateRewardBodyT }>(
    '/rewards/:id',
    { schema: { body: UpdateRewardBody } },
    async (request, reply) => {
      if (Object.keys(request.body).length === 0) {
        throw new AppError(HttpStatus.BAD_REQUEST, 'No fields provided to update');
      }
      const reward = await adminService.updateReward(request.params.id, request.body);
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok(reward, 'Reward updated successfully'));
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/rewards/:id',
    async (request, reply) => {
      const result = await adminService.deactivateReward(request.params.id);
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok(result, 'Reward deactivated successfully'));
    },
  );
}
