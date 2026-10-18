// DEMO DATA. Illustrative community numbers, participants and feedback for previewing the Challenges, Participants and
// How it works pages. None of it is real activity, and every screen that shows it labels it as sample data.
// The automations describe the planned design; they are not running yet.

export const WEEK_LABELS = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8', 'W9', 'W10', 'W11', 'W12']

// Active participants per week across all challenges.
export const COMMUNITY_GROWTH = [120, 168, 240, 310, 395, 470, 560, 640, 735, 820, 910, 1010]

export const COMMUNITY_STATS = [
  { key: 'participants', label: 'Active participants', value: 1010, note: '+11% vs last week' },
  { key: 'checkins', label: 'Check-ins this week', value: 6420, note: 'Across 6 challenges' },
  { key: 'consistency', label: 'Average consistency', value: 74, suffix: '%', note: 'Of scheduled days kept' },
  { key: 'groups', label: 'Groups running', value: 86, note: '2 to 10 members each' },
]

// Average weekly consistency (% of scheduled check-ins kept) for participants with and without the automated nudges.
export const AUTOMATION_WEEKS = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7', 'W8']
export const AUTOMATION_IMPACT = {
  withNudges: [62, 66, 69, 72, 74, 76, 78, 79],
  withoutNudges: [58, 57, 55, 54, 52, 51, 50, 49],
}

export const TOP_PARTICIPANTS = [
  { name: 'Aarav Mehta', username: 'aarav.moves', challenge: 'Winter Arc 90', mode: 'Group · Sunrise Squad', consistency: 98, streak: 41, checkIns: 14 },
  { name: 'Meera Kapoor', username: 'meera.reads', challenge: 'Deep work blocks', mode: 'Solo', consistency: 96, streak: 19, checkIns: 7 },
  { name: 'Kabir Singh', username: 'kabir.lifts', challenge: 'Morning movement', mode: 'Group · Gym Buddies', consistency: 95, streak: 27, checkIns: 7 },
  { name: 'Ananya Rao', username: 'ananya.writes', challenge: 'Creative minutes', mode: 'Solo', consistency: 93, streak: 22, checkIns: 7 },
  { name: 'Rohan Das', username: 'rohan.codes', challenge: 'Deep work blocks', mode: 'Group · Night Owls', consistency: 91, streak: 16, checkIns: 6 },
  { name: 'Ishita Patel', username: 'ishita.calm', challenge: 'Wind-down routine', mode: 'Solo', consistency: 89, streak: 12, checkIns: 6 },
  { name: 'Vihaan Thomas', username: 'vihaan.runs', challenge: 'Winter Arc 90', mode: 'Group · Sunrise Squad', consistency: 88, streak: 33, checkIns: 12 },
  { name: 'Sara Lobo', username: 'sara.plans', challenge: 'Weekly review circle', mode: 'Group · Planners', consistency: 86, streak: 4, checkIns: 1 },
]

export const TOP_FEEDBACK = [
  {
    name: 'Aarav Mehta',
    username: 'aarav.moves',
    challenge: 'Winter Arc 90',
    quote:
      'The morning reminder lands right when I wake up, and the group digest on Sunday keeps all five of us honest. I have not missed a scheduled day in six weeks.',
  },
  {
    name: 'Meera Kapoor',
    username: 'meera.reads',
    challenge: 'Deep work blocks',
    quote:
      'I missed two days in week two and got a kind nudge instead of a guilt trip. That one message is why I came back the next morning.',
  },
  {
    name: 'Kabir Singh',
    username: 'kabir.lifts',
    challenge: 'Morning movement',
    quote: 'Seeing the weekly report next to my friends’ progress turned a solo habit into something we do together.',
  },
]

// Planned automation workflows. `trigger` is what starts the workflow; `action` is what the participant receives.
export const AUTOMATIONS = [
  {
    key: 'welcome',
    title: 'Welcome & rules',
    trigger: 'Webhook: you join a challenge',
    action: 'A welcome email with the rules, your schedule and the start date.',
  },
  {
    key: 'reminder',
    title: 'Daily check-in reminder',
    trigger: 'Schedule: each morning in your time zone',
    action: 'A short reminder for the habits scheduled today that you have not checked in yet.',
  },
  {
    key: 'nudge',
    title: 'Gentle missed-day nudge',
    trigger: 'Schedule: evening, when a scheduled day has no check-in',
    action: 'A kind note: a missed day is just a day. No streak shaming, no penalty.',
  },
  {
    key: 'group',
    title: 'Group invites & digest',
    trigger: 'Webhook: a group is created; Schedule: every Sunday',
    action: 'Invites to each member by username, then a weekly digest of what members chose to share.',
  },
  {
    key: 'report',
    title: 'Weekly report & leaderboard',
    trigger: 'Schedule: every Sunday evening',
    action: 'Your consistency for the week, and a refresh of the top participants list.',
  },
]

export const JOIN_STEPS = [
  { title: 'Log in', text: 'Sign in with your Arcloop account (or create one with an email and a password).' },
  { title: 'Pick a challenge', text: 'Browse the challenges and open the one you want, for example Winter Arc 90.' },
  { title: 'Choose how to join', text: 'You are asked one question: join solo, or create a group for this challenge.' },
]

export const JOIN_RULES = [
  {
    key: 'individual',
    title: 'As an individual',
    subtitle: 'Solo track, your pace',
    rules: [
      'Choose “Join solo” on any public challenge. Your own track starts the day you join, or on the campaign’s start date.',
      'Check in on your scheduled days: one credit per habit per scheduled day.',
      'Your score is your consistency across the challenge, not perfection.',
      'Your progress is private by default. You choose what to share.',
      'You can leave at any time, and your history stays yours.',
    ],
  },
  {
    key: 'friend',
    title: 'As a friend',
    subtitle: 'Join someone’s group',
    rules: [
      'A friend adds you to their group with your name and username.',
      'You get an invite and decide whether to accept it. Nothing is shared before you do.',
      'Once you accept, you follow the same challenge rules as the group.',
      'You can leave the group without leaving Arcloop or losing your history.',
    ],
  },
  {
    key: 'group',
    title: 'As a group',
    subtitle: 'Create it, invite, grow together',
    rules: [
      'Choose “Create a group” on a challenge page. You become the organizer.',
      'Name the group, then add each member with their name and Arcloop username. A group has 2 to 10 members.',
      'Each member gets an invite (sent automatically) and must accept it.',
      'Once members accept, the group challenge is created.',
      'Everyone checks in for themselves. The group sees only what each member opts in to share.',
      'The group score is the members’ average consistency, so one slow week never sinks anyone.',
    ],
  },
]
