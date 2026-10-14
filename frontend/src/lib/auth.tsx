import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  api,
  loadDriverSession,
  loadPartySession,
  loadSession,
  saveDriverSession,
  savePartySession,
  saveSession,
} from './api'
import type { DriverSession, PartySession, Session } from './types'

interface AuthState {
  /** The staff session: control-room operators and drivers. */
  session: Session | null
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void

  /** The billing-party session, held separately from the staff one. */
  party: PartySession | null
  partyLogin: (phone: string, otp: string) => Promise<PartySession>
  partyLogout: () => void
  refreshParty: (next: PartySession) => void

  /** The driver app's session, held separately again. */
  driver: DriverSession | null
  driverLogin: (phone: string, otp: string) => Promise<DriverSession>
  driverLogout: () => void
}

const AuthContext = createContext<AuthState>({
  session: null,
  isAdmin: false,
  login: async () => {},
  logout: () => {},
  party: null,
  partyLogin: async () => {
    throw new Error('No auth provider')
  },
  partyLogout: () => {},
  refreshParty: () => {},
  driver: null,
  driverLogin: async () => {
    throw new Error('No auth provider')
  },
  driverLogout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession())
  const [party, setParty] = useState<PartySession | null>(() => loadPartySession())
  const [driver, setDriver] = useState<DriverSession | null>(() => loadDriverSession())

  const login = useCallback(async (email: string, password: string) => {
    const next = await api.login(email, password)
    saveSession(next)
    setSession(next)
  }, [])

  const logout = useCallback(() => {
    saveSession(null)
    setSession(null)
  }, [])

  const partyLogin = useCallback(async (phone: string, otp: string) => {
    const next = await api.portal.verifyOtp(phone, otp)
    savePartySession(next)
    setParty(next)
    return next
  }, [])

  const partyLogout = useCallback(() => {
    savePartySession(null)
    setParty(null)
  }, [])

  /** Keep the cached company count in step after adding or removing one. */
  const refreshParty = useCallback((next: PartySession) => {
    savePartySession(next)
    setParty(next)
  }, [])

  const driverLogin = useCallback(async (phone: string, otp: string) => {
    const next = await api.driverApp.verifyOtp(phone, otp)
    saveDriverSession(next)
    setDriver(next)
    return next
  }, [])

  const driverLogout = useCallback(() => {
    saveDriverSession(null)
    setDriver(null)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      session,
      isAdmin: session?.role === 'admin',
      login,
      logout,
      party,
      partyLogin,
      partyLogout,
      refreshParty,
      driver,
      driverLogin,
      driverLogout,
    }),
    [
      session,
      login,
      logout,
      party,
      partyLogin,
      partyLogout,
      refreshParty,
      driver,
      driverLogin,
      driverLogout,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  return useContext(AuthContext)
}
