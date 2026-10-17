from .base import TODAY, ApiCase


class PreferenceTests(ApiCase):
    def test_defaults_create_update_reset(self):
        self.assertEqual(self.list('reminder-preferences').json()['results'], [])  # nothing is created for the user
        saved = self.post('reminder-preferences', {'enabled': True, 'remind_time': '07:45', 'weekdays': [1, 3, 5], 'last_notified_on': '2026-03-09'}).json()['results'][0]
        self.assertEqual((saved['enabled'], saved['remind_time'], saved['weekdays'], saved['last_notified_on']), (True, '07:45:00', [1, 3, 5], '2026-03-09'))
        self.assertError(self.post('reminder-preferences', {'enabled': True}), 409, 'conflict')  # one row per user
        changed = self.patch('reminder-preferences', {'enabled': False}, user_id=self.alice.pk).json()['results'][0]
        self.assertFalse(changed['enabled'])
        self.assertEqual(len(self.delete('reminder-preferences', user_id=self.alice.pk).json()['results']), 1)
        fresh = self.post('reminder-preferences', {'enabled': False}).json()['results'][0]
        self.assertEqual((fresh['remind_time'], fresh['weekdays'], fresh['last_notified_on']), ('09:00:00', [1, 2, 3, 4, 5, 6, 7], '1970-01-01'))

    def test_validation(self):
        for bad in ({'remind_time': '09:00:30'}, {'weekdays': []}, {'weekdays': [1, 1]}, {'weekdays': [8]}):
            self.assertError(self.post('reminder-preferences', bad), 400, 'constraint_violation')
        self.assertError(self.post('reminder-preferences', {'remind_time': 'noon'}), 400, 'validation_error')

    def test_claiming_a_daily_reminder_succeeds_exactly_once(self):
        self.post('reminder-preferences', {'enabled': True})
        first = self.patch('reminder-preferences', {'last_notified_on': TODAY}, user_id=self.alice.pk, last_notified_on__lt=TODAY).json()['results']
        second = self.patch('reminder-preferences', {'last_notified_on': TODAY}, user_id=self.alice.pk, last_notified_on__lt=TODAY).json()['results']
        self.assertEqual((len(first), len(second)), (1, 0))


class TaskReminderTests(ApiCase):
    def setUp(self):
        super().setUp()
        self.occ = self.make_occurrence()

    def test_plan_date_comes_from_the_occurrence_and_a_new_reminder_is_undelivered(self):
        r = self.post('task-reminders', {'occurrence_id': self.occ['id'], 'remind_time': '08:30'}).json()['results'][0]
        self.assertEqual((r['plan_date'], r['remind_time'], r['notified_at']), (TODAY, '08:30:00', None))
        for forbidden in ({'plan_date': '2030-01-01'}, {'notified_at': '2026-03-10T08:30:00Z'}):
            self.assertError(self.post('task-reminders', {'occurrence_id': self.occ['id'], 'remind_time': '08:30', **forbidden}), 403, 'permission_denied')

    def test_one_per_occurrence_whole_minutes_and_a_real_occurrence(self):
        self.post('task-reminders', {'occurrence_id': self.occ['id'], 'remind_time': '08:30'})
        self.assertError(self.post('task-reminders', {'occurrence_id': self.occ['id'], 'remind_time': '09:30'}), 409, 'conflict')
        other = self.make_occurrence(title='Other')
        self.assertError(self.post('task-reminders', {'occurrence_id': other['id'], 'remind_time': '09:30:15'}), 400, 'constraint_violation')
        self.assertError(self.post('task-reminders', {'occurrence_id': '11111111-1111-4111-8111-111111111111', 'remind_time': '09:30'}), 404, 'not_found')

    def test_delivery_is_remembered_and_a_new_time_makes_it_deliverable_again(self):
        r = self.post('task-reminders', {'occurrence_id': self.occ['id'], 'remind_time': '08:30'}).json()['results'][0]
        claimed = self.patch('task-reminders', {'notified_at': '2026-03-10T15:00:00Z'}, id=r['id'], notified_at__isnull='true').json()['results']
        again = self.patch('task-reminders', {'notified_at': '2026-03-10T15:01:00Z'}, id=r['id'], notified_at__isnull='true').json()['results']
        self.assertEqual((len(claimed), len(again)), (1, 0))  # claimed exactly once, even from two tabs
        moved = self.patch('task-reminders', {'remind_time': '09:00', 'notified_at': '2026-03-10T15:00:00Z'}, id=r['id']).json()['results'][0]
        self.assertEqual((moved['remind_time'], moved['notified_at']), ('09:00:00', None))
        same_time = self.patch('task-reminders', {'remind_time': '09:00'}, id=r['id']).json()['results'][0]
        self.assertIsNone(same_time['notified_at'])

    def test_listing_by_date_range_and_cascade_when_the_task_is_removed(self):
        r = self.post('task-reminders', {'occurrence_id': self.occ['id'], 'remind_time': '08:30'}).json()['results'][0]
        self.assertEqual(len(self.list('task-reminders', plan_date__gte=TODAY, plan_date__lte='2026-04-09', order='plan_date,remind_time,id').json()['results']), 1)
        self.assertEqual(self.list('task-reminders', plan_date__gte='2026-03-11').json()['results'], [])
        self.delete('task-occurrences', id=self.occ['id'])
        self.assertEqual(self.list('task-reminders', id=r['id']).json()['results'], [])
        self.assertEqual(len(self.list('task-occurrences', id__in=self.occ['id']).json()['results']), 0)


class ErrorShapeTests(ApiCase):
    def test_unknown_routes_and_methods_use_the_same_shape(self):
        self.assertError(self.client.put('/api/v1/task-templates/', {}, format='json'), 405, 'method_not_allowed')
        self.assertError(self.client.post('/api/v1/task-templates/', 'not json', content_type='text/plain'), 415, 'validation_error')
        self.assertError(self.post('task-templates', 'a string'), 400, 'validation_error')
        self.assertError(self.post('task-templates', []), 400, 'validation_error')
