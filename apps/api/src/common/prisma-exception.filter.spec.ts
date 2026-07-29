import { HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

const hostFor = (res: any, req: any = { method: 'POST', url: '/api/x' }) =>
  ({ switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }) }) as any;

const fakeRes = () => {
  const r: any = { statusCode: 0, body: null };
  r.status = (s: number) => {
    r.statusCode = s;
    return r;
  };
  r.json = (b: any) => {
    r.body = b;
    return r;
  };
  return r;
};

const err = (code: string) => new Prisma.PrismaClientKnownRequestError('boom\ndetail line', { code, clientVersion: '5' });

describe('PrismaExceptionFilter', () => {
  it.each([
    ['P2002', HttpStatus.CONFLICT],
    ['P2025', HttpStatus.NOT_FOUND],
    ['P2003', HttpStatus.CONFLICT],
    ['P2014', HttpStatus.CONFLICT],
    ['P2000', HttpStatus.BAD_REQUEST],
    ['P2005', HttpStatus.BAD_REQUEST],
    ['P2006', HttpStatus.BAD_REQUEST],
    ['P2011', HttpStatus.BAD_REQUEST]
  ])('maps %s to %i instead of a 500', (code, expected) => {
    const res = fakeRes();
    new PrismaExceptionFilter().catch(err(code), hostFor(res));
    expect(res.statusCode).toBe(expected);
  });

  // A genuine server fault must not be dressed up as the user's mistake, or a
  // real outage hides behind a friendly 4xx.
  it('leaves an unmapped Prisma code as a 500', () => {
    const res = fakeRes();
    new PrismaExceptionFilter().catch(err('P9999'), hostFor(res));
    expect(res.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.body.message).toBe('Internal server error');
  });

  // Prisma's message names tables, columns and constraints.
  it('never leaks the database detail to the client', () => {
    const res = fakeRes();
    new PrismaExceptionFilter().catch(err('P2002'), hostFor(res));
    expect(JSON.stringify(res.body)).not.toMatch(/boom|detail line|constraint/i);
    expect(res.body).toEqual({ statusCode: 409, message: 'Those details are already in use.', error: 'Conflict' });
  });

  it('labels each status correctly for the client', () => {
    const notFound = fakeRes();
    new PrismaExceptionFilter().catch(err('P2025'), hostFor(notFound));
    expect(notFound.body.error).toBe('Not Found');
    const bad = fakeRes();
    new PrismaExceptionFilter().catch(err('P2000'), hostFor(bad));
    expect(bad.body.error).toBe('Bad Request');
  });

  it('survives a request object with nothing on it', () => {
    const res = fakeRes();
    expect(() => new PrismaExceptionFilter().catch(err('P2002'), hostFor(res, {}))).not.toThrow();
    expect(res.statusCode).toBe(HttpStatus.CONFLICT);
  });
});
