import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { AppShell } from './components/shell'
import { PortalShell } from './components/portalShell'
import { DriverShell } from './components/driverShell'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Assign from './pages/Assign'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Trips from './pages/Trips'
import TripDetail from './pages/TripDetail'
import Trucks from './pages/Trucks'
import TruckDetail from './pages/TruckDetail'
import Drivers from './pages/Drivers'
import DriverDetail from './pages/DriverDetail'
import Alerts from './pages/Alerts'
import Places from './pages/Places'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import PortalLogin from './pages/portal/Login'
import PortalOrders from './pages/portal/Orders'
import PortalNewOrder from './pages/portal/NewOrder'
import PortalOrderDetail from './pages/portal/OrderDetail'
import PortalCompanies from './pages/portal/Companies'
import PortalAddresses from './pages/portal/Addresses'
import DriverLogin from './pages/driver/Login'
import DriverToday from './pages/driver/Today'
import DriverHistory from './pages/driver/History'
import { EmptyState } from './components/ui'

/**
 * Control-room pages. A billing party has no staff session, so it is sent to
 * the portal rather than to the staff sign-in.
 */
function RequireStaff({ children }: { children: React.ReactNode }) {
  const { session, party, driver } = useAuth()
  const location = useLocation()

  if (!session) {
    // Send a signed-in party or driver to their own app rather than to a
    // staff sign-in they cannot use.
    if (party) return <Navigate to="/portal" replace />
    if (driver) return <Navigate to="/driver" replace />
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <AppShell>{children}</AppShell>
}

/** Portal pages, for a signed-in billing party. */
function RequireParty({ children }: { children: React.ReactNode }) {
  const { party } = useAuth()
  if (!party) return <Navigate to="/portal/login" replace />
  return <PortalShell>{children}</PortalShell>
}

/** Driver app pages, for a signed-in driver. */
function RequireDriver({ children }: { children: React.ReactNode }) {
  const { driver } = useAuth()
  if (!driver) return <Navigate to="/driver/login" replace />
  return <DriverShell>{children}</DriverShell>
}

export default function App() {
  const { session, party, driver } = useAuth()

  return (
    <Routes>
      {/* ----------------------------- sign-in ---------------------------- */}
      <Route
        path="/login"
        element={
          session ? (
            <Navigate to="/" replace />
          ) : party ? (
            <Navigate to="/portal" replace />
          ) : driver ? (
            <Navigate to="/driver" replace />
          ) : (
            <Login />
          )
        }
      />
      <Route
        path="/portal/login"
        element={party ? <Navigate to="/portal" replace /> : <PortalLogin />}
      />
      <Route
        path="/driver/login"
        element={driver ? <Navigate to="/driver" replace /> : <DriverLogin />}
      />

      {/* ------------------------ billing-party portal -------------------- */}
      <Route
        path="/portal"
        element={
          <RequireParty>
            <PortalOrders />
          </RequireParty>
        }
      />
      <Route
        path="/portal/new"
        element={
          <RequireParty>
            <PortalNewOrder />
          </RequireParty>
        }
      />
      <Route
        path="/portal/orders/:id"
        element={
          <RequireParty>
            <PortalOrderDetail />
          </RequireParty>
        }
      />
      <Route
        path="/portal/addresses"
        element={
          <RequireParty>
            <PortalAddresses />
          </RequireParty>
        }
      />
      <Route
        path="/portal/companies"
        element={
          <RequireParty>
            <PortalCompanies />
          </RequireParty>
        }
      />

      {/* ----------------------------- driver app ------------------------- */}
      <Route
        path="/driver"
        element={
          <RequireDriver>
            <DriverToday />
          </RequireDriver>
        }
      />
      <Route
        path="/driver/history"
        element={
          <RequireDriver>
            <DriverHistory />
          </RequireDriver>
        }
      />

      {/* --------------------------- control room ------------------------- */}
      <Route
        path="/"
        element={
          <RequireStaff>
            <Dashboard />
          </RequireStaff>
        }
      />
      <Route
        path="/assign"
        element={
          <RequireStaff>
            <Assign />
          </RequireStaff>
        }
      />
      <Route
        path="/orders"
        element={
          <RequireStaff>
            <Orders />
          </RequireStaff>
        }
      />
      <Route
        path="/orders/:id"
        element={
          <RequireStaff>
            <OrderDetail />
          </RequireStaff>
        }
      />
      <Route
        path="/trips"
        element={
          <RequireStaff>
            <Trips />
          </RequireStaff>
        }
      />
      <Route
        path="/trips/:id"
        element={
          <RequireStaff>
            <TripDetail />
          </RequireStaff>
        }
      />
      <Route
        path="/trucks"
        element={
          <RequireStaff>
            <Trucks />
          </RequireStaff>
        }
      />
      <Route
        path="/trucks/:id"
        element={
          <RequireStaff>
            <TruckDetail />
          </RequireStaff>
        }
      />
      <Route
        path="/drivers"
        element={
          <RequireStaff>
            <Drivers />
          </RequireStaff>
        }
      />
      <Route
        path="/drivers/:id"
        element={
          <RequireStaff>
            <DriverDetail />
          </RequireStaff>
        }
      />
      <Route
        path="/customers"
        element={
          <RequireStaff>
            <Customers />
          </RequireStaff>
        }
      />
      <Route
        path="/customers/:id"
        element={
          <RequireStaff>
            <CustomerDetail />
          </RequireStaff>
        }
      />
      <Route
        path="/places"
        element={
          <RequireStaff>
            <Places />
          </RequireStaff>
        }
      />
      <Route
        path="/alerts"
        element={
          <RequireStaff>
            <Alerts />
          </RequireStaff>
        }
      />

      <Route
        path="*"
        element={
          party ? (
            <PortalShell>
              <EmptyState
                title="Page not found"
                hint="Use the menu to get back to your orders."
              />
            </PortalShell>
          ) : driver ? (
            <DriverShell>
              <EmptyState
                title="Page not found"
                hint="Use the menu to get back to your trip."
              />
            </DriverShell>
          ) : (
            <RequireStaff>
              <EmptyState title="Page not found" hint="Use the navigation to get back on track." />
            </RequireStaff>
          )
        }
      />
    </Routes>
  )
}
