// Questions and answers for the FAQ page (and the short list on the home page), grouped by topic.
// Everything here describes the planned product honestly: features that are not live yet are said to be planned.
export const FAQ_GROUPS = [
  {
    id: 'getting-started',
    title: 'Getting started',
    items: [
      {
        q: 'Is Arcloop available yet?',
        a: 'Arcloop is in early development. This page describes what we are building. Accounts and the core app are being added in stages, so a feature described here may not be live yet, and sample content is always labelled as such.',
      },
      {
        q: 'Is Arcloop only for students or fitness?',
        a: 'No. Arcloop is for any habit or goal: health, learning, creative work, career, or personal growth. Winter Arc 90 is our first campaign, not the whole product.',
      },
      {
        q: 'How do I join a challenge?',
        a: 'Log in, open a challenge and choose how to take part: join solo, or create a group. The How it works page walks through each step. Joining is still a prototype: you can try the flow, but nothing is saved yet.',
      },
      {
        q: 'Can I create my own challenge?',
        a: 'Custom challenges with your own name, duration, rules and visibility are part of the beta plan. They are not available yet.',
      },
      {
        q: 'Will it cost anything?',
        a: 'There are no payments or subscriptions planned for the first beta. If that changes we will say so clearly beforehand.',
      },
    ],
  },
  {
    id: 'groups',
    title: 'Friends and groups',
    items: [
      {
        q: 'How does a group work?',
        a: 'One person creates the group from a challenge page and becomes its organizer. They add each member by name and Arcloop username (2 to 10 members), and each member gets an invite. Once members accept, the group challenge is created and everyone checks in for themselves.',
      },
      {
        q: 'Can I take part without a group?',
        a: 'Yes. Choose “Join solo” on any public challenge. Your progress is private by default, and you choose what to share.',
      },
    ],
  },
  {
    id: 'progress',
    title: 'Progress and reminders',
    items: [
      {
        q: 'What happens if I miss a day?',
        a: 'Nothing bad. Arcloop focuses on consistency over time rather than a perfect chain, and we avoid shaming language by design.',
      },
      {
        q: 'How is my score worked out?',
        a: 'Your score is your consistency: one credit per habit per scheduled day, not perfection. A group’s score is the average of its members’ consistency, so one slow week never sinks anyone.',
      },
      {
        q: 'How do reminders and nudges work?',
        a: 'Automated workflows are planned to send a short reminder each morning for the habits scheduled that day, a kind nudge after a missed day, and a weekly report every Sunday. They are not running yet.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    items: [
      {
        q: 'Who can see my habits?',
        a: 'You decide. The plan is for profile and progress visibility to be controlled by you, enforced in the database, and for private habit names never to appear on shared leaderboards.',
      },
    ],
  },
  {
    id: 'using-the-site',
    title: 'Using this site',
    items: [
      {
        q: 'Can I use Arcloop in Hindi, or with a dark theme?',
        a: 'Yes. Use the language and theme buttons in the top bar. Your choice is remembered on this device.',
      },
      {
        q: 'How can I reach you?',
        a: 'Use the “Get in touch” button at the top of any page, or email arcloopoct@gmail.com.',
      },
    ],
  },
]

export const ALL_FAQS = FAQ_GROUPS.flatMap((g) => g.items)
