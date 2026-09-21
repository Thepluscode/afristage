import { resetPasswordEmail } from './reset-email.template';

// Synthetic, and deliberately not a plausible-looking random hex string: a real
// token pasted in here once, straight off a screenshot of a live reset email,
// and the secret scanner was right to stop it.
const TOKEN = 'deadbeef'.repeat(8); // 64 chars, same shape as the real thing
const URL = 'https://web-production-4ee7e.up.railway.app/reset-password?token=' + TOKEN;

describe('resetPasswordEmail', () => {
  it('gives the reader something to CLICK — the whole point of the rewrite', () => {
    const { html, text } = resetPasswordEmail(TOKEN, URL);
    expect(html).toContain(`href="${URL}"`);
    expect(html).toMatch(/Set a new password/);
    expect(text).toContain(URL); // the text part must carry the link too
  });

  it('keeps the code as a fallback in both parts', () => {
    const { html, text } = resetPasswordEmail(TOKEN, URL);
    expect(html).toContain(TOKEN);
    expect(text).toContain(TOKEN);
  });

  it('is branded rather than four lines of bare text', () => {
    const { html } = resetPasswordEmail(TOKEN, URL);
    expect(html).toContain('AFRISTAGE');
    expect(html).toContain('#e9b44c');
  });

  it('carries no remote images — a blocked logo is worse than none', () => {
    const { html } = resetPasswordEmail(TOKEN, URL);
    expect(html).not.toMatch(/<img/i);
  });

  it('escapes what it interpolates', () => {
    const { html } = resetPasswordEmail('<script>x</script>', 'https://e.test/?a=1&b="2"');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;b=&quot;2&quot;');
  });

  it('still says what to do if you did not ask for it', () => {
    const { html, text } = resetPasswordEmail(TOKEN, URL);
    expect(html).toMatch(/password is unchanged/);
    expect(text).toMatch(/password is unchanged/);
  });
});

describe('AuthService.webBaseUrl', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AuthService } = require('./auth.service');
  const saved = process.env.WEB_BASE_URL;
  afterEach(() => {
    saved === undefined ? delete process.env.WEB_BASE_URL : (process.env.WEB_BASE_URL = saved);
  });

  it('strips a trailing slash, so the link is not a 404', () => {
    process.env.WEB_BASE_URL = 'https://afristage.example/';
    expect(AuthService.webBaseUrl()).toBe('https://afristage.example');
  });

  it('falls back to the deployed web client when unset', () => {
    delete process.env.WEB_BASE_URL;
    expect(AuthService.webBaseUrl()).toMatch(/^https:\/\/\S+[^/]$/);
  });
});
