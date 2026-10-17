import { createBrowserRouter } from 'react-router-dom'
import AppLayout from '../components/layout/AppLayout.jsx'
import PageLoader from '../components/common/PageLoader.jsx'
import { GuestOnly, RequireAuth } from '../components/auth/RouteGuards.jsx'
import HomePage from '../pages/public/HomePage.jsx'
import NotFoundPage from '../pages/public/NotFoundPage.jsx'
import { ROUTES } from '../constants/navigation.js'

// Route-level code splitting: every page except the landing page and 404 is
// loaded on demand.
const lazyPage = (load) => ({
  lazy: async () => ({ Component: (await load()).default }),
})

export const routes = [
  {
    element: <AppLayout />,
    HydrateFallback: PageLoader,
    children: [
      { path: ROUTES.home, element: <HomePage /> },
      { path: ROUTES.challenges, ...lazyPage(() => import('../pages/challenges/ExploreChallengesPage.jsx')) },
      { path: `${ROUTES.challenges}/:slug`, ...lazyPage(() => import('../pages/challenges/ChallengeDetailsPage.jsx')) },
      { path: ROUTES.privacy, ...lazyPage(() => import('../pages/public/PrivacyPage.jsx')) },
      { path: ROUTES.terms, ...lazyPage(() => import('../pages/public/TermsPage.jsx')) },
      { path: ROUTES.contact, ...lazyPage(() => import('../pages/public/ContactPage.jsx')) },
      // Handles its own states: the reset link may be invalid or expired.
      { path: ROUTES.updatePassword, ...lazyPage(() => import('../pages/auth/UpdatePasswordPage.jsx')) },
      {
        element: <GuestOnly />,
        children: [
          { path: ROUTES.login, ...lazyPage(() => import('../pages/auth/LoginPage.jsx')) },
          { path: ROUTES.signup, ...lazyPage(() => import('../pages/auth/SignupPage.jsx')) },
          { path: ROUTES.forgotPassword, ...lazyPage(() => import('../pages/auth/ForgotPasswordPage.jsx')) },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: ROUTES.app, ...lazyPage(() => import('../pages/app/AppHomePage.jsx')) },
          { path: ROUTES.day, ...lazyPage(() => import('../pages/app/MyDayPage.jsx')) },
          { path: ROUTES.settings, ...lazyPage(() => import('../pages/app/SettingsPage.jsx')) },
          { path: ROUTES.recurring, ...lazyPage(() => import('../pages/app/RecurringTasksPage.jsx')) },
          { path: ROUTES.reminders, ...lazyPage(() => import('../pages/app/ReminderSettingsPage.jsx')) },
          { path: ROUTES.week, ...lazyPage(() => import('../pages/app/WeeklyOverviewPage.jsx')) },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
