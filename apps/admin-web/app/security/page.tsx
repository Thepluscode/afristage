"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { adminPost } from "../../lib/api";
import { ErrorState, PageHeader, SuccessBanner } from "../admin-ui";

type Setup = { secret: string; otpauthUrl: string };
type Enabled = { mfaEnabled: boolean; recoveryCodes: string[] };

export default function SecurityPage() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rendered IN THE BROWSER from the otpauth URL. Never send this to an
  // external QR service: the URL contains the TOTP secret, and handing it to a
  // third party gives them a permanent second factor for this account.
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!setup) return setQr(null);
    let cancelled = false;
    QRCode.toDataURL(setup.otpauthUrl, { margin: 1, width: 200 })
      .then((url) => { if (!cancelled) setQr(url); })
      .catch(() => { if (!cancelled) setQr(null); }); // the secret below still works
    return () => { cancelled = true; };
  }, [setup]);

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      setSetup(await adminPost<Setup>("/auth/mfa/setup"));
      setRecovery(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const res = await adminPost<Enabled>("/auth/mfa/enable", { token: code.trim() });
      setRecovery(res.recoveryCodes);
      setSetup(null);
      setCode("");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState error={error} />;

  return (
    <>
      <PageHeader title="Security" kicker="Protect your admin account with two-factor authentication (TOTP)." />

      {recovery ? (
        <SuccessBanner>
          MFA enabled. Save these one-time recovery codes now — they're shown once:
          <code style={{ display: "block", marginTop: 8, lineHeight: 1.9 }}>{recovery.join("   ")}</code>
        </SuccessBanner>
      ) : null}

      {!setup && !recovery ? (
        <div className="card">
          <p>Add an authenticator app (Google Authenticator, 1Password, Authy) for a second login factor.</p>
          <button className="button" disabled={busy} onClick={startSetup}>
            {busy ? "Starting…" : "Set up two-factor auth"}
          </button>
        </div>
      ) : null}

      {setup ? (
        <div className="card">
          <h3>1. Add this to your authenticator</h3>
          {/* The page used to say "scan the otpauth URL" and then print it as
              text. You cannot scan text — every operator had to type a 32-char
              secret by hand, and a typo reads as "wrong code" at step 2. */}
          {qr ? (
            <>
              <p>Scan this with Google Authenticator, 1Password or Authy:</p>
              <img src={qr} alt="QR code for your authenticator app" width={200} height={200} style={{ background: "#fff", padding: 8, borderRadius: 8 }} />
              <p style={{ marginTop: 12 }}>Can&apos;t scan? Enter this key manually:</p>
            </>
          ) : (
            <p>Enter this key in your authenticator app:</p>
          )}
          <p>
            Secret: <code>{setup.secret}</code>
          </p>
          <h3 style={{ marginTop: 16 }}>2. Enter the 6-digit code to confirm</h3>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <button className="button" disabled={busy || code.trim().length < 6} onClick={enable}>
              {busy ? "Enabling…" : "Enable MFA"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
