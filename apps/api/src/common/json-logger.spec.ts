import { JsonLogger } from './json-logger';

describe('JsonLogger', () => {
  let out: jest.SpyInstance;
  let err: jest.SpyInstance;
  beforeEach(() => {
    out = jest.spyOn(process.stdout, 'write').mockReturnValue(true);
    err = jest.spyOn(process.stderr, 'write').mockReturnValue(true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes a string message with context + details to stdout', () => {
    new JsonLogger().log('hello', { a: 1 }, 'Ctx');
    const entry = JSON.parse(out.mock.calls[0][0] as string);
    expect(entry).toMatchObject({ level: 'log', message: 'hello', context: 'Ctx' });
    expect(entry.details).toBeDefined();
  });

  it('spreads object messages into flat fields', () => {
    new JsonLogger().warn({ requestId: 'r1', statusCode: 200 });
    expect(JSON.parse(out.mock.calls[0][0] as string)).toMatchObject({ level: 'warn', requestId: 'r1', statusCode: 200 });
  });

  it('routes error level to stderr', () => {
    new JsonLogger().error('boom');
    expect(err).toHaveBeenCalled();
    expect(out).not.toHaveBeenCalled();
  });

  it('supports debug and verbose levels', () => {
    const l = new JsonLogger();
    l.debug('d');
    l.verbose('v');
    expect(out).toHaveBeenCalledTimes(2);
  });
});
