import { DEMO_CHALLENGES } from './demoChallenges.js'

// Static marketing copy for the landing page.
// DEMO_* and *_CHALLENGE(S) exports are illustrative sample content only. They are
// not real users, real data, or live product features, and must be labelled as
// samples in the UI. Campaign content itself lives in demoChallenges.js.

export const HOW_IT_WORKS = [
  {
    icon: 'sprout',
    title: 'Pick what matters',
    text: 'Create habits and goals in your own words, with a rhythm that fits your week: daily, a few days a week, or a weekly target.',
  },
  {
    icon: 'check',
    title: 'Check in, kindly',
    text: 'Mark what you did. Missed a day? It is just a day. Your arc keeps going, and so can you.',
  },
  {
    icon: 'users',
    title: 'Grow with others',
    text: 'Join a challenge or invite friends into a group. Share only the progress you choose to share.',
  },
]

export const BENEFITS = [
  { icon: 'repeat', title: 'Habits that fit your life', text: 'Flexible schedules and targets for habits and longer-term goals.' },
  { icon: 'calendar', title: 'See the whole picture', text: 'Weekly summaries and a history of check-ins show the trend, not just the last day.' },
  { icon: 'heart', title: 'Streaks without shame', text: 'Progress is measured over time. One missed day is never framed as failure.' },
  { icon: 'shield', title: 'You control visibility', text: 'Choose what friends and groups can see. Private habit names stay private.' },
]

export const GROUP_POINTS = [
  'Create a group for friends, a team, or a study or workout circle.',
  'Invite people with controlled invitations. Private groups stay private.',
  'Shared progress shows what members opt in to, never private habit names.',
  'A simple, transparent score. No punishment for a slow week.',
]

export const FEATURED_CHALLENGE = DEMO_CHALLENGES.find((c) => c.featured)
export const LANDING_SAMPLE_CHALLENGES = DEMO_CHALLENGES.filter((c) => !c.featured).slice(0, 3)

export const DEMO_PREVIEW_HABITS = [
  { name: 'Morning walk', note: 'Daily', done: true },
  { name: 'Read 20 pages', note: 'Daily', done: true },
  { name: 'Strength session', note: '3 days a week', done: false },
  { name: 'Weekly review', note: 'Sundays', done: false },
]
