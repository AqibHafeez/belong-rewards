import { HttpStatus, HttpStatusCode } from './HttpStatus';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  statusCode: HttpStatusCode;
  message: string;
  data: T;
  metadata?: {
    pagination?: PaginationMeta;
    [key: string]: unknown;
  };
}

export class ResponseHelper {
  /** 200 — generic success with data */
  static ok<T>(data: T, message = 'Operation completed successfully'): ApiResponse<T> {
    return { statusCode: HttpStatus.OK, message, data };
  }

  /** 201 — resource created */
  static created<T>(data: T, message = 'Resource created successfully'): ApiResponse<T> {
    return { statusCode: HttpStatus.CREATED, message, data };
  }

  /** 200 — paginated list */
  static paginated<T>(
    data: T[],
    pagination: PaginationMeta,
    message = 'Data retrieved successfully',
  ): ApiResponse<T[]> {
    return {
      statusCode: HttpStatus.OK,
      message,
      data,
      metadata: { pagination },
    };
  }

  /** 204 — success with no body (use with reply.status(204).send()) */
  static noContent(message = 'Operation completed successfully'): ApiResponse<null> {
    return { statusCode: HttpStatus.NO_CONTENT, message, data: null };
  }

  /** Error shape — used by the central Fastify error handler */
  static error(
    statusCode: HttpStatusCode,
    message: string,
  ): Omit<ApiResponse<null>, 'data'> & { data: null } {
    return { statusCode, message, data: null };
  }
}
