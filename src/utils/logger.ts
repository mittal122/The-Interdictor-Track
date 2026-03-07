/**
 * Structured Logger — Industry-grade logging with Pino
 * 
 * Features:
 * - JSON output in production for log aggregation (ELK, Datadog, CloudWatch)
 * - Pretty-printed output in development for readability
 * - Child loggers scoped to modules (aws, auth, infra, ai, telemetry)
 * - ISO timestamps + log levels (debug/info/warn/error/fatal)
 */
import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        },
    }),
});

// Pre-built child loggers for each module
export const log = {
    server: logger.child({ module: 'server' }),
    auth: logger.child({ module: 'auth' }),
    aws: logger.child({ module: 'aws' }),
    infra: logger.child({ module: 'infra' }),
    ai: logger.child({ module: 'ai' }),
    telemetry: logger.child({ module: 'telemetry' }),
    vault: logger.child({ module: 'vault' }),
    terraform: logger.child({ module: 'terraform' }),
    alert: logger.child({ module: 'alert' }),
};

export default logger;
