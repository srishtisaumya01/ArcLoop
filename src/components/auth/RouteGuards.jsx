import { lazy, Suspense } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import PageLoader from '../common/PageLoader.jsx'
import { useAuth } from '../../hooks/useAuth.js'
import { ROUTES } from '../../constants/navigation.js'

// Reminder delivery for signed-in users; loaded on demand so it never weighs on public pages.
const ReminderNotifier = lazy(() => import('../reminders/ReminderNotifier.jsx'))
const TimezonePrompt = lazy(() => import('../profile/TimezonePrompt.jsx'))

// These guards only decide what the UI shows. Real protection is Row Level
// Security in the database; never rely on a route guard for data security.

// Signed-in users only. Others go to /login and come back afterwards.
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoader />
  if (status === 'authenticated') {
    return (
      <>
        <Suspense fallback={null}>
          <TimezonePrompt />
          <ReminderNotifier />
        </Suspense>
        <Outlet />
      </>
    )
  }
  return <Navigate to={ROUTES.login} replace state={{ from: location }} />
}

// Login / sign-up pages: signed-in users are sent on to where they were headed.
export function GuestOnly() {
  const { status } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <PageLoader />
  if (status === 'authenticated') {
    const from = location.state?.from
    const target = from?.pathname ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}` : ROUTES.app
    return <Navigate to={target} replace />
  }
  return <Outlet />
}
