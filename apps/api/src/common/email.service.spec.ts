import { Logger } from '@nestjs/common';
import { EmailService } from './email.service';

// Build a service with a controlled env; RESEND_API_KEY is read at construction.
function build(key?: string) {
  const prev = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
  if (key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = key;
  const svc = new EmailService();
  process.env.RESEND_API_KEY = prev.key as any;
  if (prev.key === undefined) delete process.env.RESEND_API_KEY;
  return svc;
}

describe('EmailService', () => {
  const realFetch = global.fetch;
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  it('is not configured without a key or with the placeholder', () => {
    expect(build(undefined).isConfigured()).toBe(false);
    expect(build('replace_me').isConfigured()).toBe(false);
    expect(build('re_live_x').isConfigured()).toBe(true);
  });

  it('skips (returns false) when dark — no network call', async () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy as any;
    expect(await build(undefined).send('a@b.c', 'S', 'T')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs to Resend with auth header and returns true on 200', async () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy as any;
    expect(await build('re_key').send('a@b.c', 'Subject', 'Body')).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_key');
    expect(JSON.parse(init.body)).toMatchObject({ to: 'a@b.c', subject: 'Subject', text: 'Body' });
  });

  it('returns false on a non-2xx response', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 422 }) as any;
    expect(await build('re_key').send('a@b.c', 'S', 'T')).toBe(false);
  });

  it('returns false on a network error (never throws)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as any;
    await expect(build('re_key').send('a@b.c', 'S', 'T')).resolves.toBe(false);
  });
});
