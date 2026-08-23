const LOG_LEVELS = Object.freeze({
  none: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
});

const TOKENISH_KEYS = new Set([
  "access_token",
  "refresh_token",
  "id_token",
  "token",
  "authorization",
]);

const moduleLevels = new Map();

/**
 * Set the active log level for one module.
 *
 * @param {string} moduleName
 * @param {"none"|"error"|"warn"|"info"|"debug"} levelName
 */
export function setModuleLogLevel(moduleName, levelName) {
  moduleLevels.set(moduleName, LOG_LEVELS[levelName] ?? LOG_LEVELS.info);
}

/**
 * Choose a log level based on whether the app is running on localhost.
 *
 * @param {string} localLevel
 * @param {string} prodLevel
 * @param {{hostname?: string}} locationLike
 * @returns {string}
 */
export function envLogLevel(localLevel = "debug", prodLevel = "info", locationLike = globalThis.location) {
  const hostname = locationLike?.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" ? localLevel : prodLevel;
}

/**
 * Recursively redact token-like fields before anything reaches console output.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactTokens(value) {
  if (Array.isArray(value)) {
    return value.map(redactTokens);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => [
        key,
        TOKENISH_KEYS.has(key.toLowerCase()) ? "[REDACTED]" : redactTokens(childValue),
      ]),
    );
  }

  if (typeof value === "string" && /^Bearer\s+\S+/i.test(value)) {
    return "Bearer [REDACTED]";
  }

  return value;
}

function shouldLog(moduleName, level) {
  const moduleLevel = moduleLevels.get(moduleName);
  return moduleLevel != null && level <= moduleLevel;
}

/**
 * Create a module-scoped logger that honors configured log levels.
 *
 * @param {string} moduleName
 * @param {Console} consoleLike
 * @returns {{debug: Function, info: Function, warn: Function, error: Function}}
 */
export function getLogger(moduleName, consoleLike = console) {
  return {
    debug: (...args) => {
      if (shouldLog(moduleName, LOG_LEVELS.debug)) {
        consoleLike.debug(`[${moduleName}] [DEBUG]`, ...args.map(redactTokens));
      }
    },
    info: (...args) => {
      if (shouldLog(moduleName, LOG_LEVELS.info)) {
        consoleLike.info(`[${moduleName}] [INFO]`, ...args.map(redactTokens));
      }
    },
    warn: (...args) => {
      if (shouldLog(moduleName, LOG_LEVELS.warn)) {
        consoleLike.warn(`[${moduleName}] [WARN]`, ...args.map(redactTokens));
      }
    },
    error: (...args) => {
      if (shouldLog(moduleName, LOG_LEVELS.error)) {
        consoleLike.error(`[${moduleName}] [ERROR]`, ...args.map(redactTokens));
      }
    },
  };
}
