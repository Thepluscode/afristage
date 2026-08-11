import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

// Logs one structured completion line per request: method, path, status,
// latency, user. The correlation id is NOT set here — requestContextMiddleware
// owns it, because an interceptor only runs once guards have passed, which left
// every 401 and 429 with no id on the response and no id in the log.
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.done(req, res, start),
        error: (err) => this.done(req, res, start, err)
      })
    );
  }

  // On the error path res.statusCode is still the pre-filter default (201 for
  // POSTs), so a rejected login used to log as a fake 201 — take the real
  // status from the exception instead. Cost a live debugging session (a 401
  // that logged as 201); never trust res.statusCode before the filter runs.
  private done(req: any, res: any, start: number, err?: unknown) {
    const statusCode = err ? (err instanceof HttpException ? err.getStatus() : 500) : res.statusCode;
    this.logger.log({
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      latencyMs: Date.now() - start,
      userId: req.user?.sub ?? null
    });
  }
}
