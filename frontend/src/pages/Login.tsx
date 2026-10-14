import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { AuthHeading, AuthLayout } from '../components/authLayout'
import { IconArrowRight } from '../components/icons'
import { Button, Callout, Field, inputClass } from '../components/ui'

const DEMO_LOGINS = [
  { role: 'Administrator', email: 'admin@fleetops.in', password: 'admin123' },
  { role: 'Driver', email: 'driver@fleetops.in', password: 'driver123' },
]

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@fleetops.in')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      caption="Control room"
      headline="Every truck, every order, every stop — on one screen."
      points={[
        'Assign orders to trucks with the capacity checked for you',
        'Plan and re-order stops, pickup always before delivery',
        'Follow every trip as drivers close their stops',
      ]}
    >
      <form onSubmit={submit} className="animate-fade-up">
        <AuthHeading title="Sign in">Use your control room credentials.</AuthHeading>

        <div className="space-y-5">
          <Field label="Email">
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={`${inputClass} h-12 sm:h-11`}
              required
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`${inputClass} h-12 sm:h-11`}
              required
            />
          </Field>

          {error && <Callout tone="danger">{error}</Callout>}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <IconArrowRight size={17} />}
          </Button>
        </div>
      </form>

      <div className="mt-10">
        <p className="mb-2.5 text-xs font-medium text-ink-dim">Demo accounts — tap to fill</p>
        <div className="divide-y divide-line overflow-hidden rounded-xl ring-1 ring-line">
          {DEMO_LOGINS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email)
                setPassword(account.password)
              }}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <span className="text-sm font-medium text-ink">{account.role}</span>
              <span className="truncate font-mono text-xs text-ink-dim">
                {account.email} · {account.password}
              </span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  )
}
