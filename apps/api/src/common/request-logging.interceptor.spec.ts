import { Logger, UnauthorizedException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor';

const ctx = (req: any, res: any, type = 'http') => ({
  getType: () => type,
  switchToHttp: () => ({ getRequest: () => req, getResponse: () => res })
}) as any;

describe('RequestLoggingInterceptor', () => {
  it('passes non-http contexts straight through', (done) => {
    const i = new RequestLoggingInterceptor();
    i.intercept(ctx({}, {}, 'ws'), { handle: () => of('x') } as any).subscribe((v) => {
      expect(v).toBe('x');
      done();
    });
  });

  it('reuses an incoming x-request-id and logs on success', (done) => {
    const req: any = { headers: { 'x-request-id': 'rid' }, method: 'GET', url: '/x', user: { sub: 'u1' } };
    const res: any = { setHeader: jest.fn(), statusCode: 200 };
    new RequestLoggingInterceptor().intercept(ctx(req, res), { handle: () => of('ok') } as any).subscribe(() => {
      expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'rid');
      expect(req.requestId).toBe('rid');
      done();
    });
  });

  it('generates a request id and still logs on error (anonymous user)', (done) => {
    const req: any = { headers: {}, method: 'POST', originalUrl: '/y' };
    const res: any = { setHeader: jest.fn(), statusCode: 500 };
    new RequestLoggingInterceptor().intercept(ctx(req, res), { handle: () => throwError(() => new Error('boom')) } as any).subscribe({
      error: () => {
        expect(req.requestId).toBeDefined();
        expect(res.setHeader).toHaveBeenCalled();
        done();
      }
    });
  });

  // Regression (2026-07-14): a rejected login logged as statusCode 201 because
  // res.statusCode is the pre-filter default on the error path — the status
  // must come from the thrown exception, not the response object.
  it('logs the EXCEPTION status on HttpException errors, not the stale res.statusCode', (done) => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const req: any = { headers: {}, method: 'POST', originalUrl: '/api/auth/login' };
    const res: any = { setHeader: jest.fn(), statusCode: 201 }; // Nest's POST default, pre-filter
    new RequestLoggingInterceptor()
      .intercept(ctx(req, res), { handle: () => throwError(() => new UnauthorizedException('Invalid credentials')) } as any)
      .subscribe({
        error: () => {
          expect(log).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
          log.mockRestore();
          done();
        }
      });
  });

  it('logs 500 for non-HttpException errors', (done) => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const req: any = { headers: {}, method: 'GET', originalUrl: '/z' };
    const res: any = { setHeader: jest.fn(), statusCode: 200 };
    new RequestLoggingInterceptor()
      .intercept(ctx(req, res), { handle: () => throwError(() => new Error('boom')) } as any)
      .subscribe({
        error: () => {
          expect(log).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 500 }));
          log.mockRestore();
          done();
        }
      });
  });
});
