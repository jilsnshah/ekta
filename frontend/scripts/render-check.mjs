/**
 * Renders every page through react-dom/server in a jsdom environment.
 * Catches runtime errors that tsc and the bundler cannot see: bad hook order,
 * missing exports, null dereferences while rendering real data.
 *
 * The React Query cache is seeded with fixtures before each render, so pages
 * render their loaded state rather than a spinner. Each page also asserts a
 * marker string from its fixtures -- without that, a page that silently fell
 * back to a spinner would still "pass".
 *
 *   node scripts/render-check.mjs
 */
import { createRequire } from 'node:module'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'
import { DRIVER_SESSION, PARTY_SESSION, seedEntries } from './fixtures.mjs'

const require = createRequire(import.meta.url)

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})

// Some globals are getter-only on modern Node, so define rather than assign.
const expose = (name, value) => {
  try {
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
  } catch {
    /* already provided by the runtime */
  }
}
for (const name of [
  'window', 'document', 'navigator', 'location', 'HTMLElement', 'Element',
  'Node', 'localStorage', 'sessionStorage', 'getComputedStyle',
]) {
  expose(name, name === 'window' ? dom.window : dom.window[name])
}
expose('requestAnimationFrame', (cb) => setTimeout(cb, 0))
expose('cancelAnimationFrame', clearTimeout)
expose('matchMedia', () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
}))

class FakeSocket {
  constructor() { this.readyState = 0 }
  send() {}
  close() {}
}
FakeSocket.OPEN = 1
expose('WebSocket', FakeSocket)
dom.window.WebSocket = FakeSocket
expose('fetch', async () => new Response('{}', { headers: { 'content-type': 'application/json' } }))

// The server renderer refuses portals; the browser render is fine, so swap in
// a passthrough to exercise modal and toast hosts.
require('react-dom').createPortal = (children) => children

// useLayoutEffect warnings are inherent to server-rendering a client-only app.
const realError = console.error
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing')) return
  realError(...args)
}

const server = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
})

const failures = []
try {
  // Third-party packages load normally; only project sources go through
  // Vite's SSR transform.
  const React = (await import('react')).default
  const { renderToString } = await import('react-dom/server')
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
  const { MemoryRouter } = await import('react-router-dom')
  const { AuthProvider } = await server.ssrLoadModule('/src/lib/auth.tsx')
  const { LiveProvider } = await server.ssrLoadModule('/src/lib/live.tsx')
  const { ToastProvider } = await server.ssrLoadModule('/src/components/toast.tsx')
  const { AppShell } = await server.ssrLoadModule('/src/components/shell.tsx')

  // Pretend an admin is signed in so authenticated pages render.
  const staffSession = JSON.stringify({
    access_token: 'x', token_type: 'bearer', role: 'admin',
    full_name: 'Test Operator', email: 't@e.in', driver_id: null,
  })
  const partySession = JSON.stringify(PARTY_SESSION)
  const driverSession = JSON.stringify(DRIVER_SESSION)

  /** Only one audience is signed in at a time, as in the browser. */
  const signInAs = (who) => {
    dom.window.localStorage.removeItem('fleetops.session')
    dom.window.localStorage.removeItem('fleetops.party-session')
    dom.window.localStorage.removeItem('fleetops.driver-session')
    if (who === 'staff') dom.window.localStorage.setItem('fleetops.session', staffSession)
    if (who === 'party') dom.window.localStorage.setItem('fleetops.party-session', partySession)
    if (who === 'driver') dom.window.localStorage.setItem('fleetops.driver-session', driverSession)
  }
  signInAs('staff')

  // Detail pages read their id from the router, so everything except the
  // login screen is rendered through App at a real route -- the same way it
  // mounts in the browser.
  const routes = [
    ['Dashboard', '/', 'GJ01TEST'],
    ['Assign', '/assign', 'TO-9002'],
    ['Orders', '/orders', 'TO-9001'],
    ['OrderDetail', '/orders/1', 'Survey 44, Kadi Highway'],
    ['Trips', '/trips', 'TRIP-TEST-1'],
    ['TripDetail', '/trips/1', 'Sanand Plant Gate 3'],
    ['Trucks', '/trucks', 'GJ01TEST'],
    ['TruckDetail', '/trucks/1', 'Signa 4825'],
    ['Drivers', '/drivers', 'Test Driver'],
    ['DriverDetail', '/drivers/1', 'DRV-0001'],
    ['Alerts', '/alerts', 'Test alert title'],
    ['Places', '/places', 'Kadi Godown'],
    ['Customers', '/customers', 'Hemant Sutaria'],
    ['CustomerDetail', '/customers/7', 'Shakti Steel Works'],
  ]

  // The billing-party portal, signed in as a party.
  const portalRoutes = [
    ['PortalOrders', '/portal', 'TO-9001'],
    ['PortalNewOrder', '/portal/new', 'Who should this be billed to?'],
    ['PortalOrderDetail', '/portal/orders/1', 'Sanand Plant Gate 3'],
    ['PortalCompanies', '/portal/companies', '24AAACA1234A1Z5'],
    ['PortalAddresses', '/portal/addresses', 'Kadi Godown'],
  ]

  // The driver app, signed in as a driver.
  const driverRoutes = [
    ['DriverToday', '/driver', 'Kadi Godown'],
    ['DriverHistory', '/driver/history', 'TRIP-TEST-0'],
  ]

  const wrap = (node, route) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    // Seeding the cache is what makes pages render loaded state synchronously.
    for (const [key, value] of seedEntries()) client.setQueryData(key, value)

    return React.createElement(
      QueryClientProvider, { client },
      React.createElement(AuthProvider, null,
        React.createElement(ToastProvider, null,
          React.createElement(LiveProvider, null,
            React.createElement(MemoryRouter, { initialEntries: [route] }, node),
          ),
        ),
      ),
    )
  }

  const report = (name, html, marker) => {
    name = name.padEnd(18).trimEnd()
    if (marker && !html.includes(marker)) {
      const error = new Error(
        `rendered ${html.length} chars but not "${marker}" -- the page probably ` +
          `fell back to a spinner or an empty state, so nothing real was exercised`,
      )
      failures.push([name, error])
      console.log(`  FAIL ${name.padEnd(18)} ${error.message}`)
      return
    }
    console.log(`  ok   ${name.padEnd(18)} ${String(html.length).padStart(6)} chars`)
  }

  // Login never renders through App while a session exists, because App
  // redirects away from it.
  try {
    const Login = (await server.ssrLoadModule('/src/pages/Login.tsx')).default
    report('Login', renderToString(wrap(React.createElement(Login), '/login')), 'Sign in')
  } catch (error) {
    failures.push(['Login', error])
    console.log(`  FAIL ${'Login'.padEnd(12)} ${error.message}`)
  }

  const App = (await server.ssrLoadModule('/src/App.tsx')).default
  for (const [name, route, marker] of routes) {
    try {
      report(name, renderToString(wrap(React.createElement(App), route)), marker)
    } catch (error) {
      failures.push([name, error])
      console.log(`  FAIL ${name.padEnd(12)} ${error.message}`)
    }
  }

  // The portal login screen, with nobody signed in.
  signInAs('none')
  try {
    const PortalLogin = (await server.ssrLoadModule('/src/pages/portal/Login.tsx')).default
    report(
      'PortalLogin',
      renderToString(wrap(React.createElement(PortalLogin), '/portal/login')),
      'Send code',
    )
  } catch (error) {
    failures.push(['PortalLogin', error])
    console.log(`  FAIL ${'PortalLogin'.padEnd(12)} ${error.message}`)
  }

  signInAs('party')
  for (const [name, route, marker] of portalRoutes) {
    try {
      report(name, renderToString(wrap(React.createElement(App), route)), marker)
    } catch (error) {
      failures.push([name, error])
      console.log(`  FAIL ${name.padEnd(18)} ${error.message}`)
    }
  }

  signInAs('none')
  try {
    const DriverLogin = (await server.ssrLoadModule('/src/pages/driver/Login.tsx')).default
    report(
      'DriverLogin',
      renderToString(wrap(React.createElement(DriverLogin), '/driver/login')),
      'Send code',
    )
  } catch (error) {
    failures.push(['DriverLogin', error])
    console.log(`  FAIL ${'DriverLogin'.padEnd(18)} ${error.message}`)
  }

  signInAs('driver')
  for (const [name, route, marker] of driverRoutes) {
    try {
      report(name, renderToString(wrap(React.createElement(App), route)), marker)
    } catch (error) {
      failures.push([name, error])
      console.log(`  FAIL ${name.padEnd(18)} ${error.message}`)
    }
  }

  /*
   * Which session signs which request.
   *
   * This is asserted because getting it wrong is invisible until someone
   * clicks: `/api/drivers` once matched the driver app's `/api/driver` prefix,
   * so the control room's driver screens were signed with the driver app's
   * token, 401'd, and threw the operator out to the driver sign-in.
   */
  const { audienceFor } = await server.ssrLoadModule('/src/lib/api.ts')
  const expected = [
    // Control room -- note the plural, and that it must stay 'staff'.
    ['/api/drivers', 'staff'],
    ['/api/drivers/stats', 'staff'],
    ['/api/drivers/42', 'staff'],
    ['/api/drivers/42/trips', 'staff'],
    ['/api/drivers/42/assign-truck/7', 'staff'],
    ['/api/trucks', 'staff'],
    ['/api/orders/places', 'staff'],
    ['/api/dashboard', 'staff'],
    ['/api/auth/login', 'staff'],
    // Driver app -- always a path segment under /api/driver.
    ['/api/driver/me', 'driver'],
    ['/api/driver/trips', 'driver'],
    ['/api/driver/trips/stats', 'driver'],
    ['/api/driver/auth/verify', 'driver'],
    // Customer portal.
    ['/api/portal/orders', 'party'],
    ['/api/portal/places', 'party'],
    ['/api/portal/auth/verify', 'party'],
  ]
  let wrong = 0
  for (const [path, want] of expected) {
    const got = audienceFor(path)
    if (got !== want) {
      wrong += 1
      console.log(`  FAIL audience  ${path} -> ${got}, expected ${want}`)
    }
  }
  if (wrong) failures.push(['audience', new Error(`${wrong} path(s) signed by the wrong session`)])
  else console.log(`  ok   audience  ${expected.length} paths signed by the right session`)
} finally {
  await server.close()
}

if (failures.length) {
  console.error(`\n${failures.length} page(s) failed to render`)
  for (const [name, error] of failures) console.error(`\n[${name}]\n${error.stack}`)
  process.exit(1)
}
console.log('\nAll pages rendered without runtime errors.')
