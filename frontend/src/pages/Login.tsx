import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
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
    <div className="grid min-h-full place-items-center bg-surface-0 p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-brand text-base font-bold text-on-brand">
            F
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">FleetOps</h1>
            <p className="text-sm text-ink-dim">Transport order control</p>
          </div>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <h2 className="text-base font-semibold text-ink">Sign in</h2>
            <p className="mt-0.5 text-sm text-ink-dim">
              Use your control room credentials.
            </p>
          </div>

          <Field label="Email">
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
              required
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
              required
            />
          </Field>

          {error && <Callout tone="danger">{error}</Callout>}

          <Button type="submit" variant="primary" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-dim">
          <Link to="/portal/login" className="font-medium text-brand hover:underline">
            Customer portal
          </Link>
          {' · '}
          <Link to="/driver/login" className="font-medium text-brand hover:underline">
            Driver app
          </Link>
        </p>

        <div className="mt-6">
          <p className="label mb-2">Demo accounts</p>
          <div className="card divide-y divide-line overflow-hidden">
            {DEMO_LOGINS.map((account) => (
              <button
                key={account.email}
                onClick={() => {
                  setEmail(account.email)
                  setPassword(account.password)
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-2"
              >
                <span className="text-sm font-medium text-ink">{account.role}</span>
                <span className="font-mono text-xs text-ink-dim">
                  {account.email} · {account.password}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
