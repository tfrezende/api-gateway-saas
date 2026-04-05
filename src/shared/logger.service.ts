import { Injectable } from '@nestjs/common';
import pino, { type Logger as PinoLogger } from 'pino';
import { appConfig } from '../config/app.config';

export interface LogContext {
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  latencyMs?: number;
  userId?: string;
  error?: string;
}

@Injectable()
export class LoggerService {
  private readonly logger: PinoLogger;

  constructor() {
    this.logger = pino({
      level: appConfig.logger.level,
      transport: appConfig.logger.pretty
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    });
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(context ?? {}, message);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(context ?? {}, message);
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(context ?? {}, message);
  }

  child(context: LogContext): PinoLogger {
    return this.logger.child(context);
  }
}
