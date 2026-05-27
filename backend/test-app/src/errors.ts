import { HttpStatus, HttpStatusCode } from './utils/HttpStatus';

export class AppError extends Error {
  constructor(
    public readonly statusCode: HttpStatusCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }
}

// Re-export for convenience so callers only need one import
export { HttpStatus };
