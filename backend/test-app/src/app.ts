import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { randomUUID } from 'crypto';
import { config } from './config';
import dbPlugin from './plugins/db';
import redisPlugin from './plugins/redis';
import bullPlugin from './plugins/bull';
import { AppError } from './errors';
import { HttpStatus } from './utils/HttpStatus';
import { ResponseHelper } from './utils/ResponseHelper';
import authRoutes from './routes/auth';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  });

  // Security headers
  await app.register(helmet, { contentSecurityPolicy: false });

  // CORS
  await app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  // Rate limiting (bonus)
  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.headers['x-forwarded-for'] as string ?? req.ip,
  });

  // Correlation ID forwarded in every response
  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  // Infrastructure plugins
  await app.register(dbPlugin);
  await app.register(redisPlugin);
  await app.register(bullPlugin);

  // Health check — verifies DB + Redis connectivity
  app.get('/health', async (req, reply) => {
    try {
      await app.db.query('SELECT 1');
      await app.redis.ping();
      return reply
        .status(HttpStatus.OK)
        .send(ResponseHelper.ok({ db: 'up', redis: 'up' }, 'Service is healthy'));
    } catch (err) {
      req.log.error(err, 'Health check failed');
      return reply
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .send(ResponseHelper.error(HttpStatus.SERVICE_UNAVAILABLE, 'Service unavailable'));
    }
  });

  // Centralised error handler — always returns the standard response shape
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      return reply
        .status(err.statusCode)
        .send(ResponseHelper.error(err.statusCode, err.message));
    }
    // Fastify built-in validation / not-found errors
    if (err.statusCode && err.statusCode < 500) {
      return reply
        .status(err.statusCode)
        .send(ResponseHelper.error(err.statusCode as never, err.message));
    }
    req.log.error({ err, requestId: req.id }, 'Unhandled error');
    return reply
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .send(ResponseHelper.error(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error'));
  });

  // Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  // TODO: Register user, challenge, reward, leaderboard routes

  return app;
}

async function start(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down gracefully`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
