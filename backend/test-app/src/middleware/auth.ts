import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError, HttpStatus } from '../errors';

/**
 * Fastify preHandler that verifies the Bearer access token and
 * attaches `request.user` for downstream route handlers.
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(HttpStatus.UNAUTHORIZED, 'Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret) as { userId: string };
    request.user = { userId: payload.userId };
  } catch {
    throw new AppError(HttpStatus.UNAUTHORIZED, 'Invalid or expired access token');
  }
}
