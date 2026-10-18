// Routes that exist as real pages (or placeholders) in the public app.
export const ROUTES = {
  home: '/',
  challenges: '/challenges',
  participants: '/participants',
  howItWorks: '/how-it-works',
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
  privacy: '/privacy',
  terms: '/terms',
  contact: '/contact',
}

export const challengePath = (slug) => `${ROUTES.challenges}/${slug}`

// Primary navigation. `hash` entries scroll within the landing page.
export const NAV_LINKS = [
  { label: 'How it works', to: ROUTES.howItWorks },
  { label: 'Challenges', to: ROUTES.challenges },
  { label: 'Participants', to: ROUTES.participants },
  { label: 'FAQ', to: { pathname: ROUTES.home, hash: '#faq' } },
]

// Navigation for signed-in users (replaces the public links in the navbar while signed in).
export const APP_LINKS = [
  { label: 'My Day', to: ROUTES.day },
  { label: 'Week', to: ROUTES.week },
  { label: 'Recurring Tasks', to: ROUTES.recurring },
  { label: 'Reminders', to: ROUTES.reminders },
  { label: 'Settings', to: ROUTES.settings },
]

export const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', to: ROUTES.howItWorks },
      { label: 'Challenges', to: ROUTES.challenges },
      { label: 'Participants', to: ROUTES.participants },
      { label: 'FAQ', to: { pathname: ROUTES.home, hash: '#faq' } },
    ],
  },
  {
    title: 'Company',
    links: [{ label: 'Contact & support', to: ROUTES.contact }],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy (draft)', to: ROUTES.privacy },
      { label: 'Terms of service (draft)', to: ROUTES.terms },
    ],
  },
]
