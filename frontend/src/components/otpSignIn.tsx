import { useState } from 'react'
import { ApiError } from '../lib/api'
import { AuthHeading } from './authLayout'
import { IconArrowRight } from './icons'
import { Button, Callout, Field, inputClass } from './ui'

/**
 * Two steps: the mobile number, then the code. Shared by the customer portal
 * and the driver app, which differ only in what happens after.
 *
 * The code is a fixed development value on this build, which the server says
 * out loud in `development_hint`. That is shown rather than hidden, so nobody
 * mistakes this for a real OTP flow.
 */
export function OtpSignIn({
  intro,
  requestOtp,
  verify,
}: {
  intro: string
  requestOtp: (phone: string) => Promise<{ development_hint: string | null }>
  verify: (phone: string, otp: string) => Promise<void>
}) {
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
      const result = await requestOtp(phone)
      setHint(result.development_hint)
      setStep('otp')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send a code')
    } finally {
      setBusy(false)
    }
  }

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await verify(phone, otp)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'phone') {
    return (
      <form onSubmit={sendCode} className="animate-fade-up">
        <AuthHeading title="Sign in">{intro}</AuthHeading>
        <div className="space-y-5">
          <Field label="Mobile number" hint="10 digits, with or without +91.">
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-base text-ink-dim sm:text-sm">
                +91
              </span>
              <input
                type="tel"
                autoComplete="tel"
                inputMode="numeric"
                autoFocus
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="98765 43210"
                className={`${inputClass} h-12 pl-12 font-mono tracking-wide sm:h-11`}
                required
              />
            </div>
          </Field>

          {error && <Callout tone="danger">{error}</Callout>}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
            {!busy && <IconArrowRight size={17} />}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={submitCode} className="animate-fade-up">
      <AuthHeading title="Enter the code">
        Sent to <span className="font-mono font-medium text-ink">{phone}</span>.{' '}
        <button
          type="button"
          onClick={() => {
            setStep('phone')
            setOtp('')
            setError(null)
          }}
          className="font-medium text-brand hover:underline"
        >
          Change number
        </button>
      </AuthHeading>
      <div className="space-y-5">
        {hint && <Callout tone="warning">{hint}</Callout>}

        <Field label="One-time code">
          <input
            autoComplete="one-time-code"
            inputMode="numeric"
            autoFocus
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
            placeholder="• • • • •"
            className={`${inputClass} h-14 text-center font-mono text-2xl tracking-[0.5em] sm:h-14 sm:text-2xl`}
            required
          />
        </Field>

        {error && <Callout tone="danger">{error}</Callout>}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? 'Verifying…' : 'Sign in'}
        </Button>
      </div>
    </form>
  )
}
