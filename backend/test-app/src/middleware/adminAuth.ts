import { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { AppError, HttpStatus } from '../errors';

/**
 * Fastify preHandler that validates the X-Admin-Key header.
 * Used to protect admin-only endpoints.
 */
export async function adminAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  if (!config.adminApiKey) {
    throw new AppError(HttpStatus.INTERNAL_SERVER_ERROR, 'Admin API key is not configured');
  }

  const key = request.headers['x-admin-key'];
  if (!key || key !== config.adminApiKey) {
    throw new AppError(HttpStatus.FORBIDDEN, 'Invalid or missing admin API key');
  }
}
