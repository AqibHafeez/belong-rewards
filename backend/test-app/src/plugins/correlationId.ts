import fp from 'fastify-plugin';
import { FastifyPluginAsync } from 'fastify';
import {
  HTTP_HEADER_CORRELATION_ID,
  HTTP_HEADER_REQUEST_ID,
} from '../utils/constants';

const correlationIdPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request) => {
    request.log = request.log.child({ correlationId: request.id });
  });

  fastify.addHook('onSend', async (request, reply) => {
    reply.header(HTTP_HEADER_CORRELATION_ID, request.id);
    reply.header(HTTP_HEADER_REQUEST_ID, request.id);
  });
};

export default fp(correlationIdPlugin, { name: 'correlation-id' });
