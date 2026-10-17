// DRAFT legal text for owner/lawyer review. Not legal advice, not reviewed, not
// in effect. Sections with `update: true` describe intended behaviour that must
// be confirmed against the real implementation after backend integration.
// Placeholders like {{legalEntityName}} are replaced from siteConfig at render.

export const PRIVACY_DRAFT = {
  title: 'Privacy Policy',
  intro:
    'This draft explains how Arcloop is intended to handle personal information. It describes planned behaviour, not verified behaviour, and must be reviewed and updated before launch.',
  sections: [
    {
      id: 'status',
      title: 'Status of this draft',
      paragraphs: [
        'This document has not been reviewed by a lawyer and is not in effect. It does not claim compliance with any specific privacy law.',
        'At the time of writing, sign-up and login are implemented using Supabase Authentication and a profiles table, but the service has not launched. The contact form is a layout only and does not send or store anything. Public marketing pages do not use analytics or tracking in the current code.',
      ],
    },
    {
      id: 'controller',
      title: 'Who is responsible',
      paragraphs: ['The organisation responsible for Arcloop is {{legalEntityName}}. Contact: {{supportEmail}}.'],
      update: true,
    },
    {
      id: 'information',
      title: 'Information Arcloop is designed to handle',
      paragraphs: ['Once the app is built, Arcloop is planned to handle the following kinds of information:'],
      list: [
        'Account details such as your email address and a display name.',
        'Optional profile details you choose to add, such as interests and timezone.',
        'Habits, goals and check-ins you create.',
        'Challenge and group memberships.',
        'Your privacy and notification preferences.',
        'Basic technical information needed to keep the service secure and working.',
      ],
      update: true,
    },
    {
      id: 'use',
      title: 'How the information is intended to be used',
      list: [
        'To provide the app: track your habits, show your progress and run challenges and groups.',
        'To apply the visibility choices you make.',
        'To keep the service secure and fix problems.',
      ],
      update: true,
    },
    {
      id: 'sharing',
      title: 'Visibility and sharing',
      paragraphs: [
        'The product is designed so that what other people can see is controlled by your privacy settings, and so that private habit names are not shown on shared leaderboards. This must be verified once the feature is built.',
      ],
      update: true,
    },
    {
      id: 'providers',
      title: 'Service providers',
      paragraphs: [
        'Arcloop is planned to use third-party providers for authentication, database hosting and website hosting. The providers and their locations are to be confirmed and listed here.',
      ],
      update: true,
    },
    {
      id: 'retention',
      title: 'Retention and deletion',
      paragraphs: ['How long information is kept, and how account deletion works, will be described here once those features are implemented and tested.'],
      update: true,
    },
    {
      id: 'choices',
      title: 'Your choices and rights',
      paragraphs: ['Your rights depend on where you live. This section will be completed after legal review for the places Arcloop is offered.'],
      update: true,
    },
    {
      id: 'security',
      title: 'Security',
      paragraphs: ['Arcloop aims to protect information with access controls and other safeguards. No online service can promise perfect security.'],
    },
    {
      id: 'children',
      title: 'Children',
      paragraphs: ['The minimum age to use Arcloop has not been decided. This section will state it after review.'],
      update: true,
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      paragraphs: ['Last updated: {{legalLastUpdated}}. We will update this page when the policy changes.'],
    },
  ],
}

export const TERMS_DRAFT = {
  title: 'Terms of Service',
  intro:
    'These draft terms describe how Arcloop is intended to be used. They are a starting point for review and are not yet in effect.',
  sections: [
    {
      id: 'status',
      title: 'Status of this draft',
      paragraphs: ['These terms have not been reviewed by a lawyer and are not legally binding. They will be revised before the service launches.'],
    },
    {
      id: 'provider',
      title: 'Who provides Arcloop',
      paragraphs: ['Arcloop is provided by {{legalEntityName}}. Contact: {{supportEmail}}.'],
      update: true,
    },
    {
      id: 'early-service',
      title: 'Early-stage service',
      paragraphs: ['Arcloop is under development. Features may change, be unavailable, or be removed, and the service may be provided without guarantees during the beta.'],
    },
    {
      id: 'eligibility',
      title: 'Eligibility and accounts',
      paragraphs: ['The minimum age and account rules will be stated here after review. You are responsible for keeping your login details secure.'],
      update: true,
    },
    {
      id: 'use',
      title: 'Acceptable use',
      paragraphs: ['In shared spaces such as challenges and groups, we expect people to be respectful. The following are not acceptable:'],
      list: [
        'Harassing, threatening or shaming others.',
        'Sharing someone else’s private information.',
        'Attempting to access data you are not authorised to see.',
        'Trying to cheat or disrupt the service.',
      ],
    },
    {
      id: 'content',
      title: 'Your content',
      paragraphs: ['You keep ownership of what you create. The permissions Arcloop needs to operate the service, and how content is removed, will be defined after review.'],
      update: true,
    },
    {
      id: 'wellbeing',
      title: 'Not professional advice',
      paragraphs: ['Arcloop is a habit-tracking tool. It does not provide medical, mental-health, fitness or other professional advice. Talk to a qualified professional before making changes that affect your health.'],
    },
    {
      id: 'termination',
      title: 'Ending your use',
      paragraphs: ['You can stop using Arcloop at any time. Account closure and suspension rules will be described here once implemented.'],
      update: true,
    },
    {
      id: 'liability',
      title: 'Liability and governing law',
      paragraphs: ['Limits of liability and the governing law ({{governingLaw}}) require legal review and are not yet defined.'],
      update: true,
    },
    {
      id: 'changes',
      title: 'Changes to these terms',
      paragraphs: ['Last updated: {{legalLastUpdated}}. We will update this page when the terms change.'],
    },
  ],
}
