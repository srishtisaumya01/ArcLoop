// Routes that exist as real pages (or placeholders) in the public app.
export const ROUTES = {
  home: '/',
  challenges: '/challenges',
  participants: '/participants',
  howItWorks: '/how-it-works',
  faq: '/faq',
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  updatePassword: '/update-password',
  app: '/app',
  week: '/app/week',
  day: '/app/day',
  reminders: '/app/reminders',
  recurring: '/app/recurring',
  progress: '/app/progress',
  settings: '/app/settings',
  profile: '/app/profile',
  appChallenges: '/app/challenges',
  attendance: '/app/attendance',
  privacy: '/privacy',
  terms: '/terms',
  contact: '/contact',
}

export const appChallengePath = (slug) => `${ROUTES.appChallenges}/${slug}`
export const challengePath = (slug) => `${ROUTES.challenges}/${slug}`

// Primary navigation. `hash` entries scroll within the landing page.
export const NAV_LINKS = [
  { label: 'How it works', to: ROUTES.howItWorks },
  { label: 'Challenges', to: ROUTES.challenges },
  { label: 'Participants', to: ROUTES.participants },
  { label: 'FAQ', to: ROUTES.faq },
]

// The tab bar at the bottom of a phone, like the ones in the apps people already use: few, always visible, one tap. `icon` names an icon in
// components/layout/BottomNav.jsx. The rest of the app stays one tap away in the menu.
export const SITE_TABS = [
  { label: 'Home', to: ROUTES.home, icon: 'home', end: true },
  { label: 'How to join', to: ROUTES.howItWorks, icon: 'join' },
  { label: 'Challenges', to: ROUTES.challenges, icon: 'challenges' },
]
// The last tab is the way in: Log in for a visitor, the app for someone already signed in.
export const SITE_TAB_LOGIN = { label: 'Log in', to: ROUTES.login, icon: 'login' }
export const SITE_TAB_APP = { label: 'Dashboard', to: ROUTES.app, icon: 'dashboard' }

export const APP_TABS = [
  { label: 'Home', to: ROUTES.app, icon: 'home', end: true },
  { label: 'My Day', to: ROUTES.day, icon: 'day' },
  { label: 'Week', to: ROUTES.week, icon: 'week' },
  { label: 'Challenges', to: ROUTES.appChallenges, icon: 'challenges' },
  { label: 'Profile', to: ROUTES.profile, icon: 'profile' },
]

// The signed-in sidebar. `icon` names an icon in components/app/Sidebar.jsx; `end` matches only the exact path.
export const APP_NAV = [
  { label: 'Dashboard', to: ROUTES.app, icon: 'dashboard', end: true },
  { label: 'My Day', to: ROUTES.day, icon: 'day' },
  { label: 'Mark Attendance', to: ROUTES.attendance, icon: 'attendance' },
  { label: 'Week', to: ROUTES.week, icon: 'week' },
  { label: 'Progress', to: ROUTES.progress, icon: 'progress' },
  { label: 'Challenges', to: ROUTES.appChallenges, icon: 'challenges' },
  { label: 'Recurring Tasks', to: ROUTES.recurring, icon: 'recurring' },
  { label: 'Reminders', to: ROUTES.reminders, icon: 'reminders' },
  { label: 'Profile', to: ROUTES.profile, icon: 'profile' },
  { label: 'Settings', to: ROUTES.settings, icon: 'settings' },
]

// Public pages worth a shortcut from the sidebar.
export const EXPLORE_NAV = [
  { label: 'Participants', to: ROUTES.participants, icon: 'participants' },
]

export const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', to: ROUTES.howItWorks },
      { label: 'Challenges', to: ROUTES.challenges },
      { label: 'Participants', to: ROUTES.participants },
      { label: 'FAQ', to: ROUTES.faq },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'Contact & support', to: ROUTES.contact },
      { label: 'Log in', to: ROUTES.login },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy (draft)', to: ROUTES.privacy },
      { label: 'Terms of service (draft)', to: ROUTES.terms },
    ],
  },
]
