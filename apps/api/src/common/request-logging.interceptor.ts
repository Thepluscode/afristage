import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuid } from 'uuid';

// Tags every HTTP request with a correlation id (also returned as x-request-id)
// and logs a structured completion line: requestId, method, path, status, latency, user.
@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const requestId = req.headers['x-request-id'] || uuid();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.done(req, res, requestId, start),
        error: (err) => this.done(req, res, requestId, start, err)
      })
    );
  }

  // On the error path res.statusCode is still the pre-filter default (201 for
  // POSTs), so a rejected login used to log as a fake 201 — take the real
  // status from the exception instead. Cost a live debugging session (a 401
  // that logged as 201); never trust res.statusCode before the filter runs.
  private done(req: any, res: any, requestId: string, start: number, err?: unknown) {
    const statusCode = err ? (err instanceof HttpException ? err.getStatus() : 500) : res.statusCode;
    this.logger.log({
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      latencyMs: Date.now() - start,
      userId: req.user?.sub ?? null
    });
  }
}
