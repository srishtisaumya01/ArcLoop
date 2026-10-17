// Routes that exist as real pages (or placeholders) in the public app.
export const ROUTES = {
  home: '/',
  challenges: '/challenges',
  login: '/login',
  signup: '/signup',
  forgotPassword: '/forgot-password',
  updatePassword: '/update-password',
  app: '/app',
  privacy: '/privacy',
  terms: '/terms',
  contact: '/contact',
}

export const challengePath = (slug) => `${ROUTES.challenges}/${slug}`

// Primary navigation. `hash` entries scroll within the landing page.
export const NAV_LINKS = [
  { label: 'How it works', to: { pathname: ROUTES.home, hash: '#how-it-works' } },
  { label: 'Groups', to: { pathname: ROUTES.home, hash: '#groups' } },
  { label: 'Challenges', to: ROUTES.challenges },
  { label: 'FAQ', to: { pathname: ROUTES.home, hash: '#faq' } },
]

export const FOOTER_GROUPS = [
  {
    title: 'Product',
    links: [
      { label: 'How it works', to: { pathname: ROUTES.home, hash: '#how-it-works' } },
      { label: 'Challenges', to: ROUTES.challenges },
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
