import { describe, expect, it } from 'vitest'
import { CHALLENGE_CATEGORIES, DEMO_CHALLENGES, VISIBILITY_OPTIONS } from '../../src/constants/demoChallenges.js'
import { COMMUNITY_STATS } from '../../src/constants/communityDemo.js'
import { FEATURED_CHALLENGE, LANDING_SAMPLE_CHALLENGES } from '../../src/constants/landingContent.js'
import { hi } from '../../src/i18n/hi.js'
import { filterChallenges } from '../../src/utils/challengeFilters.js'
import { getChallenge, listChallenges } from '../../src/services/challengeService.js'

// The challenge library (sample content, held as plain data): its size, identity, metadata, writing standards and Hindi labels.

const EXISTING = {
  'winter-arc-90': { title: 'Winter Arc 90', category: 'Personal growth', durationDays: 90, visibility: 'public', featured: true },
  'morning-movement': { title: 'Morning movement', category: 'Fitness', durationDays: 30, visibility: 'public', featured: false },
  'deep-work-blocks': { title: 'Deep work blocks', category: 'Learning', durationDays: 21, visibility: 'public', featured: false },
  'wind-down-routine': { title: 'Wind-down routine', category: 'Wellness', durationDays: 14, visibility: 'public', featured: false },
  'creative-minutes': { title: 'Creative minutes', category: 'Creative', durationDays: 30, visibility: 'public', featured: false },
  'weekly-review-circle': { title: 'Weekly review circle', category: 'Professional', durationDays: 28, visibility: 'invite-only', featured: false },
}

// slug -> [title, category, days] for the 20 added challenges
const ADDED = {
  'coding-consistency-7': ['7-Day Coding Consistency', 'Developers & tech', 7],
  'build-something-14': ['Build Something in 14 Days', 'Developers & tech', 14],
  'github-green-week': ['GitHub Green Week', 'Developers & tech', 7],
  'one-tech-concept-daily': ['Learn One Tech Concept Daily', 'Developers & tech', 14],
  'revision-sprint-7': ['7-Day Revision Sprint', 'Exam preparation', 7],
  'mcq-mastery': ['Daily MCQ Mastery', 'Exam preparation', 21],
  'answer-writing': ['Answer Writing Challenge', 'Exam preparation', 14],
  'current-affairs-recall': ['Current Affairs to Recall', 'Exam preparation', 14],
  'semester-success-sprint': ['Semester Success Sprint', 'College life', 21],
  'career-ready-15': ['Career Ready in 15 Days', 'College life', 15],
  'speak-with-confidence': ['Speak with Confidence', 'College life', 14],
  'learn-beyond-classroom': ['Learn Beyond the Classroom', 'College life', 14],
  'move-every-day': ['Move Every Day', 'Fitness', 21],
  'gym-consistency': ['Gym Consistency Challenge', 'Fitness', 28],
  'mobility-stretch-breaks': ['Mobility & Stretch Breaks', 'Fitness', 14],
  'read-every-day': ['Read Every Day', 'Learning', 21],
  'english-practice-sprint': ['English Practice Sprint', 'Learning', 14],
  'digital-distraction-reset': ['Digital Distraction Reset', 'Wellness', 7],
  'kindness-in-action': ['Kindness in Action', 'Personal growth', 14],
  'plan-reflect-restart': ['Plan, Reflect & Restart', 'Personal growth', 14],
}
const added = DEMO_CHALLENGES.filter((c) => c.slug in ADDED)
const textOf = (c) => [c.title, c.summary, c.description, ...c.rules, ...c.habits, c.scoring, c.participation].join('\n')
const words = (text) => new Set(text.toLowerCase().match(/[a-z]+/g))
const similarity = (a, b) => {
  const [x, y] = [words(a), words(b)]
  const shared = [...x].filter((w) => y.has(w)).length
  return shared / (x.size + y.size - shared)
}

describe('the catalogue: size and identity', () => {
  it('has exactly 26 challenges: the original 6 and the 20 added', () => {
    expect(DEMO_CHALLENGES).toHaveLength(26)
    expect(added).toHaveLength(20)
    expect(Object.keys(EXISTING).length + added.length).toBe(26)
  })

  it('has unique slugs and unique titles, with readable URL slugs', () => {
    const slugs = DEMO_CHALLENGES.map((c) => c.slug)
    expect(new Set(slugs).size).toBe(26)
    expect(slugs.every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))).toBe(true)
    const titles = DEMO_CHALLENGES.map((c) => c.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
    expect(new Set(titles).size).toBe(26) // not even a near-duplicate that differs only in punctuation or case
  })

  it('keeps the original six exactly as they were (slug, title, category, duration, visibility)', () => {
    for (const [slug, facts] of Object.entries(EXISTING)) {
      expect(DEMO_CHALLENGES.find((c) => c.slug === slug), slug).toMatchObject(facts)
    }
    expect(DEMO_CHALLENGES.slice(0, 6).map((c) => c.slug)).toEqual(Object.keys(EXISTING)) // same order, so the landing page is unchanged
    expect(FEATURED_CHALLENGE.slug).toBe('winter-arc-90')
    expect(LANDING_SAMPLE_CHALLENGES.map((c) => c.slug)).toEqual(['morning-movement', 'deep-work-blocks', 'wind-down-routine'])
    expect(DEMO_CHALLENGES.filter((c) => c.featured)).toHaveLength(1)
  })

  it('has the added challenges with the agreed titles, categories and durations', () => {
    for (const [slug, [title, category, days]] of Object.entries(ADDED)) {
      expect(DEMO_CHALLENGES.find((c) => c.slug === slug), slug).toMatchObject({ title, category, durationDays: days })
    }
  })
})

describe('the catalogue: categories and durations', () => {
  it('uses only listed categories, and every listed category has at least one challenge', () => {
    expect(DEMO_CHALLENGES.every((c) => CHALLENGE_CATEGORIES.includes(c.category))).toBe(true)
    for (const category of CHALLENGE_CATEGORIES) expect(DEMO_CHALLENGES.some((c) => c.category === category), category).toBe(true)
    expect(CHALLENGE_CATEGORIES).toHaveLength(new Set(CHALLENGE_CATEGORIES).size)
  })

  it('has the expected number in each category', () => {
    const count = (category) => DEMO_CHALLENGES.filter((c) => c.category === category).length
    expect(Object.fromEntries(CHALLENGE_CATEGORIES.map((c) => [c, count(c)]))).toEqual({
      'Personal growth': 3, Fitness: 4, Learning: 3, Wellness: 2, Creative: 1, Professional: 1, 'Developers & tech': 4, 'Exam preparation': 4, 'College life': 4,
    })
  })

  it('has a duration in whole days whose label says the same thing', () => {
    for (const c of DEMO_CHALLENGES) {
      expect(Number.isInteger(c.durationDays) && c.durationDays >= 1 && c.durationDays <= 90, c.slug).toBe(true)
      expect(c.durationLabel, c.slug).toBe(`${c.durationDays} days`)
    }
    expect(Math.max(...added.map((c) => c.durationDays))).toBeLessThanOrEqual(28) // the added ones are short and achievable
  })
})

describe('the catalogue: required content', () => {
  const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0
  const list = (v) => Array.isArray(v) && v.length > 0 && v.every(nonEmpty) && new Set(v).size === v.length

  it('gives every challenge all the fields the screens show', () => {
    for (const c of DEMO_CHALLENGES) {
      for (const field of ['slug', 'title', 'category', 'durationLabel', 'scheduleLabel', 'summary', 'description', 'participation', 'scoring']) expect(nonEmpty(c[field]), `${c.slug}.${field}`).toBe(true)
      expect(list(c.rules), `${c.slug}.rules`).toBe(true)
      expect(list(c.habits), `${c.slug}.habits`).toBe(true)
      expect(VISIBILITY_OPTIONS.map((v) => v.value)).toContain(c.visibility)
      expect(nonEmpty(c.organizer?.name) && nonEmpty(c.organizer?.role), `${c.slug}.organizer`).toBe(true)
      expect(c.sampleProgress.length).toBeGreaterThan(0)
      for (const p of c.sampleProgress) expect(nonEmpty(p.label) && Number.isFinite(p.percent) && p.percent >= 0 && p.percent <= 100, c.slug).toBe(true)
    }
  })

  it('makes the added challenges rich enough to say what people will actually do', () => {
    for (const c of added) {
      expect(c.summary.length, `${c.slug} summary`).toBeLessThanOrEqual(130)
      expect(c.description.length, `${c.slug} description`).toBeGreaterThanOrEqual(250)
      expect(c.description, c.slug).not.toContain(c.title) // it explains, it does not repeat the title
      expect(c.rules.length, `${c.slug} rules`).toBeGreaterThanOrEqual(3)
      expect(c.habits.length, `${c.slug} daily actions`).toBeGreaterThanOrEqual(2)
      expect(c.scoring, `${c.slug} scoring`).toMatch(/^One credit per day/) // a clear completion criterion
      expect(c.visibility).toBe('public')
      expect(c.startDate).toBeNull()
      expect(c.scheduleLabel).toBe('Starts on the day you join')
      expect(c.sampleProgress.length).toBeLessThanOrEqual(3)
      expect(c.organizer).toEqual({ name: 'Sample organizer', role: 'Community challenge (sample)' }) // labelled as sample content like the others
    }
  })
})

describe('the catalogue: tone, safety and cost', () => {
  it('never asks for perfect streaks and never uses failure language', () => {
    for (const c of added) {
      expect(textOf(c), c.slug).not.toMatch(/\bstreaks?\b|\bfail(ed|ure|ing)?\b|\blos(e|t|ing)\b|\bshame\b|\bpunish|\bperfect (streak|record)/i)
    }
    // Flexibility is stated, not implied: every added challenge says what a hard or missed day means, or allows a short version.
    for (const c of added) expect(c.rules.join(' ') + ' ' + c.description, c.slug).toMatch(/\b(is|are) (enough|fine|okay|plenty)\b|\bcounts?\b|(missed|busy|hard) day|rough draft|never push|rest is part|restart|can be private|there is no need/i)
  })

  it('does not require public proof, payment or expensive resources', () => {
    for (const c of added) {
      expect(textOf(c), c.slug).not.toMatch(/\b(buy|purchase|subscription|premium|paid course|membership fee)\b|[$₹€£]/i)
      expect(textOf(c), c.slug).not.toMatch(/\b(must|have to|required to) (share|post|publish|upload)\b/i)
    }
    expect(added.find((c) => c.slug === 'github-green-week').rules.join(' ')).toMatch(/Nothing has to be public/)
  })

  it('keeps the fitness challenges adaptable, with rest, and free of unsafe or restrictive advice', () => {
    const fitness = added.filter((c) => c.category === 'Fitness')
    expect(fitness.map((c) => c.slug).sort()).toEqual(['gym-consistency', 'mobility-stretch-breaks', 'move-every-day'])
    for (const c of fitness) {
      expect(textOf(c), c.slug).toMatch(/rest|gentle|comfortabl/i)
      expect(textOf(c), c.slug).not.toMatch(/\bdiet|calorie|fasting|starv|no pain|push through|burn (it )?off|punish|cheat meal|\bweigh/i)
    }
    expect(textOf(added.find((c) => c.slug === 'move-every-day'))).toMatch(/health professional/)
    expect(textOf(added.find((c) => c.slug === 'move-every-day'))).toMatch(/gentle[\s\S]*steady[\s\S]*active/)
    const gym = added.find((c) => c.slug === 'gym-consistency')
    expect(gym.rules.join(' ')).toMatch(/at least two rest days/)
    expect(gym.rules.join(' ')).toMatch(/Warm up/)
    expect(gym.rules.join(' ')).toMatch(/unwell or injured/)
    expect(added.find((c) => c.slug === 'mobility-stretch-breaks').rules.join(' ')).toMatch(/never push into pain/)
  })

  it('keeps GitHub Green Week about real work, not artificial commits', () => {
    const c = added.find((x) => x.slug === 'github-green-week')
    expect(c.rules.join(' ')).toMatch(/No empty, trivial or artificial commits/)
    expect(c.description).toMatch(/never the goal/)
  })
})

describe('the catalogue: every challenge has its own purpose', () => {
  it('no two challenges read alike (by wording of their descriptions)', () => {
    for (let i = 0; i < DEMO_CHALLENGES.length; i += 1) {
      for (let j = i + 1; j < DEMO_CHALLENGES.length; j += 1) {
        const [a, b] = [DEMO_CHALLENGES[i], DEMO_CHALLENGES[j]]
        expect(similarity(a.description, b.description), `${a.slug} vs ${b.slug}`).toBeLessThan(0.5)
      }
    }
  })

  it('no two challenges share the same daily actions or the same scoring rule', () => {
    expect(new Set(DEMO_CHALLENGES.map((c) => JSON.stringify(c.habits))).size).toBe(26)
    // (three of the original challenges already share the line "One credit per day you check in.", so scoring is compared among the added ones)
    expect(new Set(added.map((c) => c.scoring)).size).toBe(20)
    const original = new Set(DEMO_CHALLENGES.slice(0, 6).map((c) => c.scoring))
    expect(added.filter((c) => original.has(c.scoring))).toEqual([])
  })

  it('Move Every Day differs from Morning movement: a level you choose, any time of day, rest-friendly', () => {
    const move = added.find((c) => c.slug === 'move-every-day')
    const morning = DEMO_CHALLENGES.find((c) => c.slug === 'morning-movement')
    expect(move.habits.join(' ')).toMatch(/Choose today’s level/)
    expect(move.rules.join(' ')).toMatch(/Any time of day/)
    expect(morning.rules.join(' ')).toMatch(/at least 10 minutes/)
    expect(morning.rules.join(' ')).not.toMatch(/level/i)
  })

  it('Digital Distraction Reset differs from Deep work blocks and Wind-down routine: reducing distractions, not a study block or a bedtime rule', () => {
    const reset = added.find((c) => c.slug === 'digital-distraction-reset')
    expect(reset.habits.join(' ')).toMatch(/Change one setting/)
    expect(reset.description).toMatch(/notification/)
    for (const slug of ['deep-work-blocks', 'wind-down-routine']) {
      const other = DEMO_CHALLENGES.find((c) => c.slug === slug)
      expect(similarity(textOf(reset), textOf(other)), slug).toBeLessThan(0.25)
    }
  })

  it('Plan, Reflect & Restart is a daily, solo rhythm: different from the weekly, invite-only review circle', () => {
    const plan = added.find((c) => c.slug === 'plan-reflect-restart')
    const circle = DEMO_CHALLENGES.find((c) => c.slug === 'weekly-review-circle')
    expect(plan.visibility).toBe('public')
    expect(circle.visibility).toBe('invite-only')
    expect(plan.scoring).toMatch(/per day/)
    expect(circle.scoring).toMatch(/weekly review/)
  })
})

describe('the catalogue: filters and the service see all 26', () => {
  it('lists every challenge and finds each one by slug; an unknown slug is null', async () => {
    expect(await listChallenges()).toHaveLength(26)
    expect((await getChallenge('github-green-week')).title).toBe('GitHub Green Week')
    expect(await getChallenge('does-not-exist')).toBeNull()
  })

  it('filters by the new categories and by search', () => {
    expect(filterChallenges(DEMO_CHALLENGES, { category: 'Exam preparation' })).toHaveLength(4)
    expect(filterChallenges(DEMO_CHALLENGES, { category: 'Developers & tech' }).map((c) => c.slug)).toEqual(['coding-consistency-7', 'build-something-14', 'github-green-week', 'one-tech-concept-daily'])
    expect(filterChallenges(DEMO_CHALLENGES, { category: 'College life' })).toHaveLength(4)
    expect(filterChallenges(DEMO_CHALLENGES, { category: 'Fitness' })).toHaveLength(4)
    expect(filterChallenges(DEMO_CHALLENGES, { query: 'github' }).map((c) => c.slug)).toEqual(['github-green-week'])
    expect(filterChallenges(DEMO_CHALLENGES, { query: 'mcq' }).map((c) => c.slug)).toEqual(['mcq-mastery'])
    expect(filterChallenges(DEMO_CHALLENGES, { category: 'Fitness', visibility: 'invite-only' })).toEqual([])
  })

  it('the community summary counts the challenges that exist', () => {
    expect(COMMUNITY_STATS.find((s) => s.key === 'checkins').note).toBe('Across 26 challenges')
  })
})

describe('Hindi: titles, summaries, categories and duration labels', () => {
  const SAME = new Set(['Winter Arc 90'])
  const devanagari = /[ऀ-ॿ]/

  it('translates every challenge title, summary, category and duration label', () => {
    for (const c of DEMO_CHALLENGES) {
      for (const text of [c.title, c.summary, c.category, c.durationLabel]) {
        if (SAME.has(text)) continue
        expect(hi[text], `${c.slug}: “${text}”`).toBeTruthy()
      }
    }
  })

  it('has real Hindi (Devanagari) for everything added, not a copy of the English', () => {
    const texts = [...added.flatMap((c) => [c.title, c.summary, c.durationLabel]), 'Developers & tech', 'Exam preparation', 'College life']
    for (const text of texts) {
      expect(hi[text], text).toMatch(devanagari)
      expect(hi[text], text).not.toBe(text)
    }
  })

  it('translates the community count and keeps the placeholders and numbers intact', () => {
    expect(hi['Across 26 challenges']).toBe('26 चैलेंज में मिलाकर')
    expect(hi['Across 6 challenges']).toBeUndefined() // the old number is gone: it would now be wrong
    for (const c of added) expect(hi[c.durationLabel]).toContain(String(c.durationDays))
  })
})
