import { FastifyInstance } from 'fastify';
import { Type, Static } from '@sinclair/typebox';
import { UserService } from '../services/UserService';
import { authenticate } from '../middleware/auth';
import { ResponseHelper } from '../utils/ResponseHelper';
import { HttpStatus } from '../utils/HttpStatus';
import { AppError } from '../errors';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
  PAGINATION_MAX_LIMIT,
  PAGINATION_MIN_LIMIT,
  PAGINATION_MIN_PAGE,
} from '../utils/constants';

// ─── schemas ──────────────────────────────────────────────────────────────────

const UpdateProfileBody = Type.Object({
  displayName: Type.Optional(Type.String({ minLength: DISPLAY_NAME_MIN_LENGTH, maxLength: DISPLAY_NAME_MAX_LENGTH })),
});

const PaginationQuery = Type.Object({
  page:  Type.Optional(Type.Integer({ minimum: PAGINATION_MIN_PAGE, default: PAGINATION_DEFAULT_PAGE })),
  limit: Type.Optional(Type.Integer({ minimum: PAGINATION_MIN_LIMIT, maximum: PAGINATION_MAX_LIMIT, default: PAGINATION_DEFAULT_LIMIT })),
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
      const page  = request.query.page  ?? PAGINATION_DEFAULT_PAGE;
      const limit = request.query.limit ?? PAGINATION_DEFAULT_LIMIT;

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
      const page  = request.query.page  ?? PAGINATION_DEFAULT_PAGE;
      const limit = request.query.limit ?? PAGINATION_DEFAULT_LIMIT;

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
