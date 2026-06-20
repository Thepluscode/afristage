import { LoggerService, LogLevel } from '@nestjs/common';

// Minimal structured logger: one JSON object per line to stdout/stderr.
// No external logging dep — Nest's own logs flow through this too.
export class JsonLogger implements LoggerService {
  private write(level: LogLevel, message: unknown, params: unknown[]) {
    // Nest passes the context (e.g. "RouterExplorer") as the last string param.
    const context = params.length && typeof params[params.length - 1] === 'string' ? (params.pop() as string) : undefined;
    const base = { time: new Date().toISOString(), level, context };
    // Object messages are spread into flat, queryable fields; strings stay as `message`.
    const entry =
      message && typeof message === 'object'
        ? { ...base, ...(message as Record<string, unknown>) }
        : { ...base, message: String(message), ...(params.length ? { details: params } : {}) };
    const line = JSON.stringify(entry);
    if (level === 'error') process.stderr.write(line + '\n');
    else process.stdout.write(line + '\n');
  }

  log(message: unknown, ...params: unknown[]) { this.write('log', message, params); }
  error(message: unknown, ...params: unknown[]) { this.write('error', message, params); }
  warn(message: unknown, ...params: unknown[]) { this.write('warn', message, params); }
  debug(message: unknown, ...params: unknown[]) { this.write('debug', message, params); }
  verbose(message: unknown, ...params: unknown[]) { this.write('verbose', message, params); }
}
