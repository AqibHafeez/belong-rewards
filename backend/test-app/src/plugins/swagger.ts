import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'FanRewards API',
        description: [
          'Belong Backend Technical Assessment — FanRewards API.',
          '',
          '**Demo credentials** (password: `Test@1234`)',
          '- `alice@belong.com` — 950 pts',
          '- `bob@belong.com`   — 450 pts',
          '- `test@belong.com`  — 0 pts (reviewer account)',
          '',
          '**Auth flow:** `POST /api/auth/login` → copy `accessToken` → click **Authorize** → paste as Bearer token.',
          '',
          '**Admin endpoints** require `X-Admin-Key` header (set `ADMIN_API_KEY` in `.env`).',
        ].join('\n'),
        version: '1.0.0',
      },
      tags: [
        { name: 'health',      description: 'Service health check' },
        { name: 'auth',        description: 'Register, login, token refresh, logout' },
        { name: 'users',       description: 'Profile, stats, history' },
        { name: 'challenges',  description: 'Browse and complete music challenges' },
        { name: 'rewards',     description: 'Redeem rewards with earned points' },
        { name: 'leaderboard', description: 'Ranked fan leaderboard' },
        { name: 'admin',       description: 'Admin CRUD — requires X-Admin-Key header' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Access token from `/api/auth/login`',
          },
          adminApiKey: {
            type: 'apiKey',
            name: 'x-admin-key',
            in: 'header',
            description: 'Admin API key from `ADMIN_API_KEY` env var',
          },
        },
      },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      persistAuthorization: true,
    },
  });
};

export default fp(swaggerPlugin, { name: 'swagger' });
