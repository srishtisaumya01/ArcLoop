import re
from pathlib import Path

from challenges.models import Challenge

from .base import ApiCase

FRONTEND_CATALOGUE = Path(__file__).resolve().parents[2] / 'src' / 'constants' / 'demoChallenges.js'


class ChallengeCatalogueTests(ApiCase):
    """The official catalogue the signed-in app lists and people join: 26 challenges, loaded by the migrations."""

    def test_the_catalogue_holds_26_official_challenges_with_complete_details(self):
        official = Challenge.objects.filter(kind='official')
        self.assertEqual(official.count(), 26)
        self.assertEqual(len({c.title for c in official}), 26)
        for c in official:
            with self.subTest(slug=c.slug):
                self.assertTrue(c.title and c.category and c.summary and c.description)
                self.assertGreater(c.duration_days, 0)
                self.assertIn(c.visibility, ('public', 'invite-only'))
                for key in ('rules', 'habits', 'participation', 'scoring'):
                    self.assertTrue(c.details.get(key), key)

    def test_every_challenge_people_can_browse_can_be_found_by_its_page_and_joined(self):
        listed = self.list('challenges').json()['results']
        self.assertEqual(len(listed), 26)
        for slug in ('github-green-week', 'mcq-mastery', 'gym-consistency'):
            with self.subTest(slug=slug):
                self.assertEqual(self.client.get(f'/api/v1/challenges/{slug}/').status_code, 200)
        joined = self.client.post('/api/v1/challenges/github-green-week/enroll/', {'mode': 'solo'}, format='json')
        self.assertEqual(joined.status_code, 201, joined.content)

    def test_the_new_categories_come_through_the_api(self):
        categories = {c['category'] for c in self.list('challenges').json()['results']}
        self.assertTrue({'Developers & tech', 'Exam preparation', 'College life'} <= categories)

    def test_the_backend_and_the_public_pages_list_the_same_challenges(self):
        if not FRONTEND_CATALOGUE.exists():
            self.skipTest('the frontend source is not next to the backend here')
        slugs = re.findall(r"^\s{4}slug: '([a-z0-9-]+)'", FRONTEND_CATALOGUE.read_text(encoding='utf-8'), re.M)
        self.assertEqual(len(slugs), 26)
        self.assertEqual(set(slugs), set(Challenge.objects.filter(kind='official').values_list('slug', flat=True)))
