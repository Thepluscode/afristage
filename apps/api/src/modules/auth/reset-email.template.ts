// The password-reset email.
//
// It used to be four lines of plain text containing a bare 64-character hex
// string and a deadline — which is, feature for feature, what a phishing mail
// looks like. There was also nothing to click, because no reset page existed:
// the "one-time code" had no form to go in.
//
// Kept deliberately simple in HTML terms: tables, inline styles, no external
// images. Mail clients strip <style> blocks, block remote images by default,
// and a logo that does not load leaves a broken box where the brand should be.
// The wordmark is text, so it renders everywhere, including in the plain-text
// part for clients that refuse HTML entirely.

const GOLD = '#e9b44c';
const INK = '#0a0807';

// Belt and braces: the token is hex from randomBytes, but it is interpolated
// into markup, and a template that only escapes "sometimes" is the one that
// eventually does not.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ResetEmail {
  subject: string;
  text: string;
  html: string;
}

export function resetPasswordEmail(token: string, resetUrl: string): ResetEmail {
  const safeToken = escapeHtml(token);
  const safeUrl = escapeHtml(resetUrl);

  const text = [
    'Reset your AfriStage password',
    '',
    'Open this link within 15 minutes to choose a new password:',
    resetUrl,
    '',
    'If the link does not work, paste this one-time code into the reset page:',
    token,
    '',
    "If you didn't ask for this, ignore this email — your password is unchanged.",
    '',
    'AfriStage'
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:${INK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#141110;border:1px solid rgba(233,180,76,0.35);border-radius:14px;">
        <tr><td style="padding:28px 32px 8px 32px;font-family:Helvetica,Arial,sans-serif;">
          <div style="font-size:20px;letter-spacing:0.08em;color:${GOLD};font-weight:700;">AFRISTAGE</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0 32px;font-family:Helvetica,Arial,sans-serif;color:#f5efe6;">
          <h1 style="margin:16px 0 8px 0;font-size:22px;font-weight:600;color:#f5efe6;">Reset your password</h1>
          <p style="margin:0 0 20px 0;font-size:15px;line-height:1.6;color:#cfc6b8;">
            Choose a new password using the button below. This link expires in 15 minutes.
          </p>
        </td></tr>
        <tr><td style="padding:4px 32px 8px 32px;" align="left">
          <a href="${safeUrl}" style="display:inline-block;background:${GOLD};color:${INK};text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;padding:13px 26px;border-radius:9px;">Set a new password</a>
        </td></tr>
        <tr><td style="padding:16px 32px 0 32px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 6px 0;font-size:13px;color:#9b9186;">Button not working? Paste this code into the reset page:</p>
          <p style="margin:0;font-family:'SF Mono',Menlo,Consolas,monospace;font-size:12px;line-height:1.5;color:${GOLD};word-break:break-all;">${safeToken}</p>
        </td></tr>
        <tr><td style="padding:22px 32px 28px 32px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0;font-size:13px;line-height:1.6;color:#9b9186;border-top:1px solid rgba(233,180,76,0.18);padding-top:16px;">
            If you didn't ask for this, ignore this email — your password is unchanged.
          </p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0 0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6f675d;">AfriStage · live stages, African creators</p>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: 'Reset your AfriStage password', text, html };
}
