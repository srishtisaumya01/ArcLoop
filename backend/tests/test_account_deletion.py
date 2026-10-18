from django.contrib.auth import get_user_model

from accounts.models import AuthToken, Profile
from planner.models import DayPlan, TaskOccurrence, TaskTemplate
from reminders.models import ReminderPreference, TaskReminder

from .base import ApiCase

User = get_user_model()
URL = '/api/v1/auth/account/delete/'
PASSWORD = 'correct-horse-battery'


class AccountDeletionTests(ApiCase):
    """Only ever runs on throwaway test users in the test database."""

    def delete_account(self, **body):
        return self.client.post(URL, {'password': PASSWORD, 'confirmation': 'DELETE', **body}, format='json')

    def fill(self):
        self.make_template(title='Walk')
        self.make_day()
        occ = self.make_occurrence(title='Task')
        self.post('task-reminders', {'occurrence_id': occ['id'], 'remind_time': '08:30'})
        self.post('reminder-preferences', {'enabled': True})
        return occ

    def counts(self, user):
        return {
            'user': User.objects.filter(pk=user.pk).count(),
            'profile': Profile.objects.filter(pk=user.pk).count(),
            'tokens': AuthToken.objects.filter(user_id=user.pk).count(),
            'templates': TaskTemplate.objects.filter(user_id=user.pk).count(),
            'days': DayPlan.objects.filter(user_id=user.pk).count(),
            'occurrences': TaskOccurrence.objects.filter(user_id=user.pk).count(),
            'task_reminders': TaskReminder.objects.filter(user_id=user.pk).count(),
            'preferences': ReminderPreference.objects.filter(user_id=user.pk).count(),
        }

    def test_it_requires_sign_in(self):
        self.anonymous()
        self.assertError(self.delete_account(), 401, 'unauthenticated')
        self.assertEqual(User.objects.count(), 2)

    def test_it_needs_the_correct_password_and_the_typed_confirmation(self):
        self.fill()
        self.assertError(self.delete_account(password='wrong-wrong-wrong'), 400, 'invalid_credentials')
        self.assertError(self.delete_account(confirmation='delete'), 400, 'confirmation_required')
        self.assertError(self.delete_account(confirmation=''), 400, 'validation_error')
        self.assertError(self.client.post(URL, {}, format='json'), 400, 'validation_error')
        self.assertEqual(self.counts(self.alice)['occurrences'], 1)  # nothing was deleted by any refusal
        self.assertEqual(self.client.get('/api/v1/auth/me/').status_code, 200)

    def test_it_deletes_the_account_and_everything_it_owns_and_nothing_else(self):
        self.fill()
        self.as_user(self.bob)
        self.make_template(title='Bob walk')
        self.make_day()
        bob_occ = self.make_occurrence(title='Bob task')
        self.post('task-reminders', {'occurrence_id': bob_occ['id'], 'remind_time': '09:00'})
        before_bob = self.counts(self.bob)
        self.as_user(self.alice)
        self.assertEqual(self.delete_account().status_code, 204)
        self.assertEqual(set(self.counts(self.alice).values()), {0})
        self.assertEqual(self.counts(self.bob), before_bob)  # another user's data is untouched
        self.assertEqual(User.objects.filter(email='bob@example.com').count(), 1)

    def test_every_session_of_the_account_ends_and_a_repeat_request_is_refused(self):
        other_device = self.as_user(self.alice)
        this_device = self.as_user(self.alice)
        self.assertEqual(self.delete_account().status_code, 204)
        self.assertError(self.delete_account(), 401, 'unauthenticated')  # same token again
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {other_device}')
        self.assertError(self.client.get('/api/v1/auth/me/'), 401, 'unauthenticated')
        self.assertNotEqual(this_device, other_device)
        self.anonymous()
        login = self.client.post('/api/v1/auth/login/', {'email': 'alice@example.com', 'password': PASSWORD}, format='json')
        self.assertError(login, 401, 'invalid_credentials')

    def test_the_email_can_be_registered_again_and_starts_empty(self):
        self.fill()
        self.delete_account()
        self.anonymous()
        again = self.client.post('/api/v1/auth/register/', {'email': 'alice@example.com', 'password': 'plum-ladder-orbit-42'}, format='json')
        self.assertEqual(again.status_code, 201)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {again.json()['token']}")
        self.assertEqual(self.list('task-templates').json()['results'], [])
        self.assertEqual(self.list('task-occurrences').json()['results'], [])

    def test_staff_and_superuser_accounts_are_refused(self):
        admin = User.objects.create_superuser('root@example.com', 'root@example.com', PASSWORD)
        self.as_user(admin)
        self.assertError(self.delete_account(), 403, 'permission_denied')
        self.assertTrue(User.objects.filter(pk=admin.pk).exists())

    def test_the_account_to_delete_is_always_the_callers_whatever_else_is_sent(self):
        self.as_user(self.bob)
        response = self.client.post(URL, {'password': PASSWORD, 'confirmation': 'DELETE', 'email': 'alice@example.com', 'user_id': self.alice.pk}, format='json')
        self.assertEqual(response.status_code, 204)  # extra fields are ignored: it can only ever be the caller's account
        self.assertTrue(User.objects.filter(pk=self.alice.pk).exists())
        self.assertFalse(User.objects.filter(pk=self.bob.pk).exists())
