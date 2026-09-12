import { Request, Response, NextFunction } from 'express';
import { IS_PRODUCTION } from './config';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const CURRENT_LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL?.toLowerCase() as LogLevel) || (IS_PRODUCTION ? 'info' : 'debug');

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LOG_LEVEL];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

export const logger = {
  debug(message: string, meta?: Record<string, any>) {
    if (!shouldLog('debug')) return;
    if (IS_PRODUCTION) {
      console.log(JSON.stringify({ timestamp: formatTimestamp(), level: 'DEBUG', message, ...meta }));
    } else {
      console.log(`${COLORS.dim}[${formatTimestamp()}]${COLORS.reset} ${COLORS.cyan}[DEBUG]${COLORS.reset} ${message}`, meta ? meta : '');
    }
  },

  info(message: string, meta?: Record<string, any>) {
    if (!shouldLog('info')) return;
    if (IS_PRODUCTION) {
      console.log(JSON.stringify({ timestamp: formatTimestamp(), level: 'INFO', message, ...meta }));
    } else {
      console.log(`${COLORS.dim}[${formatTimestamp()}]${COLORS.reset} ${COLORS.green}[INFO]${COLORS.reset}  ${message}`, meta ? meta : '');
    }
  },

  warn(message: string, meta?: Record<string, any>) {
    if (!shouldLog('warn')) return;
    if (IS_PRODUCTION) {
      console.warn(JSON.stringify({ timestamp: formatTimestamp(), level: 'WARN', message, ...meta }));
    } else {
      console.warn(`${COLORS.dim}[${formatTimestamp()}]${COLORS.reset} ${COLORS.yellow}[WARN]${COLORS.reset}  ${message}`, meta ? meta : '');
    }
  },

  error(message: string, error?: any, meta?: Record<string, any>) {
    if (!shouldLog('error')) return;
    const errObj = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error ? { error } : {};

    if (IS_PRODUCTION) {
      console.error(JSON.stringify({ timestamp: formatTimestamp(), level: 'ERROR', message, ...errObj, ...meta }));
    } else {
      console.error(`${COLORS.dim}[${formatTimestamp()}]${COLORS.reset} ${COLORS.red}[ERROR]${COLORS.reset} ${message}`, error ? error : '', meta ? meta : '');
    }
  },
};

/**
 * Express HTTP İstek Kaydedici Middleware
 * Her HTTP isteğinin metodunu, yolunu, durum kodunu ve süresini kaydeder.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Statik dosya ve vite asset isteklerini atla
  if (req.path.startsWith('/@') || req.path.startsWith('/src/') || req.path.startsWith('/node_modules/') || req.path.match(/\.(js|css|png|jpg|svg|ico|woff2?)$/)) {
    return next();
  }

  const start = Date.now();
  const { method, originalUrl, ip } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;

    // Yalnızca /api rotalarını veya hata durumlarını logla
    if (originalUrl.startsWith('/api')) {
      const meta = { method, url: originalUrl, statusCode, durationMs: duration, ip };
      if (statusCode >= 500) {
        logger.error(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, undefined, meta);
      } else if (statusCode >= 400) {
        logger.warn(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, meta);
      } else {
        logger.info(`HTTP ${method} ${originalUrl} ${statusCode} - ${duration}ms`, meta);
      }
    }
  });

  next();
}
