import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { UserService } from '../services/UserService';
import { authenticate } from '../middleware/auth';
import { ResponseHelper } from '../utils/ResponseHelper';
import { HttpStatus } from '../utils/HttpStatus';
import { AppError } from '../errors';

// ─── schemas ──────────────────────────────────────────────────────────────────

const UpdateProfileBody = Type.Object({
  displayName: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
});

const PaginationQuery = Type.Object({
  page:  Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
});

type UpdateProfileBodyT = Static<typeof UpdateProfileBody>;
type PaginationQueryT   = Static<typeof PaginationQuery>;

// ─── routes ───────────────────────────────────────────────────────────────────

export default async function userRoutes(fastify: FastifyInstance) {
  const userService = new UserService(fastify.db);

  fastify.addHook('onRoute', (route) => {
    route.schema = route.schema ?? {};
    route.schema.tags = ['users'];
    route.schema.security = [{ bearerAuth: [] }];
  });

  fastify.addHook('preHandler', authenticate);

  // GET /api/users/me
  fastify.get('/me', async (request, reply) => {
    const profile = await userService.getProfile(request.user!.userId);
    return reply
      .status(HttpStatus.OK)
      .send(ResponseHelper.ok(profile, 'Profile retrieved successfully'));
  });

  // PATCH /api/users/me
  fastify.patch<{ Body: UpdateProfileBodyT }>(
    '/me',
    { schema: { body: UpdateProfileBody } },
    async (request, reply) => {
      if (Object.keys(request.body).length === 0) {
        throw new AppError(HttpStatus.BAD_REQUEST, 'No fields provided to update');
      }
      const profile = await userService.updateProfile(
        request.user!.userId,
        request.body,
      );
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok(profile, 'Profile updated successfully'));
    },
  );

  // GET /api/users/me/stats
  fastify.get('/me/stats', async (request, reply) => {
    const stats = await userService.getStats(request.user!.userId);
    return reply
      .status(HttpStatus.OK)
      .send(ResponseHelper.ok(stats, 'Stats retrieved successfully'));
  });

  // GET /api/users/me/completions?page=1&limit=20
  fastify.get<{ Querystring: PaginationQueryT }>(
    '/me/completions',
    { schema: { querystring: PaginationQuery } },
    async (request, reply) => {
      const page  = request.query.page  ?? 1;
      const limit = request.query.limit ?? 20;

      const { data, total } = await userService.getCompletions(
        request.user!.userId,
        { page, limit },
      );

      return reply.status(HttpStatus.OK).send(
        ResponseHelper.paginated(data, {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }, 'Completions retrieved successfully'),
      );
    },
  );

  // GET /api/users/me/redemptions?page=1&limit=20
  fastify.get<{ Querystring: PaginationQueryT }>(
    '/me/redemptions',
    { schema: { querystring: PaginationQuery } },
    async (request, reply) => {
      const page  = request.query.page  ?? 1;
      const limit = request.query.limit ?? 20;

      const { data, total } = await userService.getRedemptions(
        request.user!.userId,
        { page, limit },
      );

      return reply.status(HttpStatus.OK).send(
        ResponseHelper.paginated(data, {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        }, 'Redemptions retrieved successfully'),
      );
    },
  );
}
