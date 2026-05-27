// ─── HTTP headers ─────────────────────────────────────────────────────────────

export const HTTP_HEADER_CORRELATION_ID = 'x-correlation-id';
export const HTTP_HEADER_REQUEST_ID = 'x-request-id';
export const HTTP_HEADER_FORWARDED_FOR = 'x-forwarded-for';
export const HTTP_HEADER_ADMIN_API_KEY = 'x-admin-key';
export const HTTP_HEADER_AUTHORIZATION = 'authorization';

export const AUTH_BEARER_PREFIX = 'Bearer ';

// ─── Redis ────────────────────────────────────────────────────────────────────

export const REDIS_LEADERBOARD_KEY = 'leaderboard';

// ─── Bull queue ───────────────────────────────────────────────────────────────

export const BULL_QUEUE_CHALLENGE_COMPLETIONS = 'challenge-completions';
export const BULL_JOB_ATTEMPTS = 3;
export const BULL_JOB_BACKOFF_DELAY_MS = 1_000;
export const BULL_REMOVE_ON_COMPLETE_COUNT = 100;
export const BULL_REMOVE_ON_FAIL_COUNT = 50;

// ─── Business rules ───────────────────────────────────────────────────────────

/** Listen percentage at or above this value earns full challenge points */
export const CHALLENGE_FULL_POINTS_THRESHOLD_PERCENT = 80;
export const LISTEN_PERCENTAGE_MAX = 100;
export const LISTEN_PERCENTAGE_MIN = 0;

// ─── Pagination ───────────────────────────────────────────────────────────────

export const PAGINATION_DEFAULT_PAGE = 1;
export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;
export const PAGINATION_MIN_PAGE = 1;
export const PAGINATION_MIN_LIMIT = 1;

// ─── Validation ─────────────────────────────────────────────────────────────────

export const DISPLAY_NAME_MAX_LENGTH = 100;
export const DISPLAY_NAME_MIN_LENGTH = 1;
export const PASSWORD_MIN_LENGTH = 8;

// ─── DB connection pool ─────────────────────────────────────────────────────────

export const DB_POOL_IDLE_TIMEOUT_MS = 30_000;
export const DB_POOL_CONNECTION_TIMEOUT_MS = 2_000;
export const DB_POOL_SIZE_DEFAULT = 10;
export const DB_POOL_MIN_DEFAULT = 2;

// ─── Rate limiting defaults (overridable via env) ───────────────────────────────

export const RATE_LIMIT_GLOBAL_MAX_DEFAULT = 100;
export const RATE_LIMIT_AUTH_MAX_DEFAULT = 10;
export const RATE_LIMIT_WINDOW_DEFAULT = '1 minute';

// ─── Audit logging ──────────────────────────────────────────────────────────────

export const AUDIT_REDACTED_VALUE = '[REDACTED]';
export const AUDIT_SKIP_PATH_HEALTH = '/health';
export const AUDIT_SKIP_PATH_DOCS = '/docs';
export const AUDIT_MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

export const AUDIT_SENSITIVE_FIELD_KEYS = [
  'password',
  'passwordhash',
  'refreshtoken',
  'accesstoken',
  'token',
  'authorization',
  HTTP_HEADER_ADMIN_API_KEY,
] as const;
