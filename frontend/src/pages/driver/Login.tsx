import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { Button, Callout, Field, inputClass } from '../../components/ui'

/**
 * Driver sign-in: mobile number, then the code.
 *
 * A driver account is created by the control room, so an unknown number is
 * told so plainly rather than being silently registered.
 */
export default function DriverLogin() {
  const { driverLogin } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [hint, setHint] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sendCode = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api.driverApp.requestOtp(phone)
      setHint(result.development_hint)
      setStep('otp')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a code')
    } finally {
      setBusy(false)
    }
  }

  const verify = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await driverLogin(phone, otp)
      navigate('/driver', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-full place-items-center bg-surface-0 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-brand text-base font-bold text-on-brand">
            F
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">FleetOps</h1>
            <p className="text-sm text-ink-dim">Driver app</p>
          </div>
        </div>

        {step === 'phone' ? (
          <form onSubmit={sendCode} className="card space-y-4 p-6">
            <div>
              <h2 className="text-base font-semibold text-ink">Sign in</h2>
              <p className="mt-0.5 text-sm text-ink-dim">
                Use the mobile number the control room has on file for you.
              </p>
            </div>

            <Field label="Mobile number" hint="10 digits, with or without +91.">
              <input
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="98765 43210"
                className={inputClass}
                required
              />
            </Field>

            {error && <Callout tone="danger">{error}</Callout>}

            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="card space-y-4 p-6">
            <div>
              <h2 className="text-base font-semibold text-ink">Enter the code</h2>
              <p className="mt-0.5 text-sm text-ink-dim">
                Sent to {phone}.{' '}
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone')
                    setOtp('')
                    setError(null)
                  }}
                  className="font-medium text-brand hover:underline"
                >
                  Change
                </button>
              </p>
            </div>

            {hint && <Callout tone="warning">{hint}</Callout>}

            <Field label="One-time code">
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                value={otp}
                onChange={(event) => setOtp(event.target.value)}
                placeholder="12345"
                className={`${inputClass} text-center font-mono text-base tracking-[0.3em]`}
                required
              />
            </Field>

            {error && <Callout tone="danger">{error}</Callout>}

            <Button type="submit" variant="primary" className="w-full" disabled={busy}>
              {busy ? 'Verifying…' : 'Sign in'}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-ink-dim">
          Not a driver?{' '}
          <Link to="/login" className="font-medium text-brand hover:underline">
            Control room
          </Link>
          {' · '}
          <Link to="/portal/login" className="font-medium text-brand hover:underline">
            Customer portal
          </Link>
        </p>
      </div>
    </div>
  )
}
