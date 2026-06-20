"use client";

import { useState } from "react";
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
          <h3>1. Add this secret to your authenticator</h3>
          <p>Scan the otpauth URL with your app, or enter the secret key manually:</p>
          <p>
            Secret: <code>{setup.secret}</code>
          </p>
          <p style={{ wordBreak: "break-all" }}>
            otpauth: <code>{setup.otpauthUrl}</code>
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
