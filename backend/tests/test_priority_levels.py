from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase

from planner.models import TaskOccurrence, TaskTemplate

from .base import TODAY, ApiCase


class PriorityLevelTests(ApiCase):
    """Priority has three levels (high, medium, low). `is_priority` stays for older clients and always means "high": the two never disagree,
    through the API and in the database."""

    def template(self, **extra):
        body = {'title': 'Walk', 'recurrence': 'daily', 'starts_on': '2026-03-01', **extra}
        return self.post('task-templates', body)

    def one(self, response):
        self.assertIn(response.status_code, (200, 201), response.content)
        return response.json()['results'][0]

    def patch_template(self, template, body):
        return self.one(self.patch('task-templates', body, id=template['id']))

    def test_a_task_is_medium_priority_unless_said_otherwise(self):
        made = self.one(self.template())
        self.assertEqual((made['priority_level'], made['is_priority']), ('medium', False))

    def test_each_level_can_be_chosen_and_comes_back(self):
        for level, flag in (('high', True), ('medium', False), ('low', False)):
            with self.subTest(level=level):
                made = self.one(self.template(title=f'Task {level}', priority_level=level))
                self.assertEqual((made['priority_level'], made['is_priority']), (level, flag))

    def test_the_old_flag_still_works_and_means_high(self):
        made = self.one(self.template(is_priority=True))
        self.assertEqual((made['priority_level'], made['is_priority']), ('high', True))
        lowered = self.patch_template(made, {'is_priority': False})
        self.assertEqual((lowered['priority_level'], lowered['is_priority']), ('medium', False))
        raised = self.patch_template(lowered, {'is_priority': True})
        self.assertEqual((raised['priority_level'], raised['is_priority']), ('high', True))

    def test_turning_the_old_flag_off_leaves_a_low_priority_alone(self):
        made = self.one(self.template(priority_level='low'))
        again = self.patch_template(made, {'is_priority': False})
        self.assertEqual((again['priority_level'], again['is_priority']), ('low', False))

    def test_changing_the_level_moves_the_flag_with_it(self):
        made = self.one(self.template(priority_level='high'))
        lowered = self.patch_template(made, {'priority_level': 'low'})
        self.assertEqual((lowered['priority_level'], lowered['is_priority']), ('low', False))
        raised = self.patch_template(lowered, {'priority_level': 'high'})
        self.assertEqual((raised['priority_level'], raised['is_priority']), ('high', True))

    def test_if_both_are_sent_and_disagree_the_level_wins(self):
        made = self.one(self.template(priority_level='low', is_priority=True))
        self.assertEqual((made['priority_level'], made['is_priority']), ('low', False))

    def test_an_unknown_level_is_refused_with_a_message_for_the_field(self):
        for bad in ('urgent', 'HIGH', '', 'normal'):
            with self.subTest(level=bad):
                response = self.template(priority_level=bad)
                self.assertEqual(response.status_code, 400, response.content)
                self.assertIn('priority_level', str(response.json()))
        self.assertEqual(self.list('task-templates').json()['results'], [])

    def test_other_task_details_are_not_touched_by_a_priority_change(self):
        made = self.one(self.template(title='Report', description='Q1', category='Work', planned_start='09:00:00', estimated_minutes=30))
        changed = self.patch_template(made, {'priority_level': 'low'})
        for column in ('title', 'description', 'category', 'planned_start', 'estimated_minutes', 'recurrence', 'starts_on'):
            self.assertEqual(changed[column], made[column], column)

    def occurrence(self, **extra):
        return self.one(self.post('task-occurrences', {'plan_date': TODAY, 'title': 'Task', **extra}))

    def test_a_task_on_a_day_has_a_level_and_it_can_be_changed(self):
        self.make_day()
        made = self.occurrence()
        self.assertEqual((made['priority_level'], made['is_priority']), ('medium', False))
        low = self.occurrence(title='Low one', priority_level='low')
        self.assertEqual((low['priority_level'], low['is_priority']), ('low', False))
        legacy = self.occurrence(title='Old client', is_priority=True)
        self.assertEqual((legacy['priority_level'], legacy['is_priority']), ('high', True))
        changed = self.one(self.patch('task-occurrences', {'priority_level': 'high'}, id=made['id']))
        self.assertEqual((changed['priority_level'], changed['is_priority']), ('high', True))
        back = self.one(self.patch('task-occurrences', {'is_priority': False}, id=made['id']))
        self.assertEqual((back['priority_level'], back['is_priority']), ('medium', False))

    def test_a_level_on_a_day_does_not_change_progress_or_the_plan(self):
        self.make_day()
        made = self.occurrence()
        done = self.one(self.patch('task-occurrences', {'completion': 0.5}, id=made['id']))
        changed = self.one(self.patch('task-occurrences', {'priority_level': 'low'}, id=made['id']))
        for column in ('completion', 'plan_state', 'in_original_plan', 'plan_date'):
            self.assertEqual(changed[column], done[column], column)

    def test_an_unknown_level_on_a_day_is_refused(self):
        self.make_day()
        response = self.post('task-occurrences', {'plan_date': TODAY, 'title': 'Task', 'priority_level': 'urgent'})
        self.assertEqual(response.status_code, 400)
        made = self.occurrence()
        refused = self.patch('task-occurrences', {'priority_level': 'urgent'}, id=made['id'])
        self.assertEqual(refused.status_code, 400)

    def test_the_database_itself_refuses_a_level_and_a_flag_that_disagree(self):
        made = self.one(self.template(priority_level='medium'))
        for level, flag in (('urgent', False), ('low', True), ('high', False), ('medium', True)):
            with self.subTest(level=level, flag=flag), self.assertRaises(IntegrityError), transaction.atomic():
                TaskTemplate.objects.filter(pk=made['id']).update(priority_level=level, is_priority=flag)
        self.make_day()
        occ = self.occurrence()
        with self.assertRaises(IntegrityError), transaction.atomic():
            TaskOccurrence.objects.filter(pk=occ['id']).update(priority_level='high', is_priority=False)

    def test_each_person_sees_only_their_own_levels(self):
        mine = self.one(self.template(priority_level='low'))
        self.as_user(self.bob)
        self.assertEqual(self.list('task-templates').json()['results'], [])
        self.assertEqual(self.patch('task-templates', {'priority_level': 'high'}, id=mine['id']).status_code in (200, 404), True)
        self.as_user(self.alice)
        self.assertEqual(self.one(self.list('task-templates'))['priority_level'], 'low')


class PriorityMigrationTests(TransactionTestCase):
    """Migration planner/0003 on data made before it: priorities become levels, nothing else changes, and it can be undone and redone."""

    before = [('planner', '0002_occurrence_is_minimum')]
    after = [('planner', '0003_priority_levels')]

    def migrate(self, targets):
        executor = MigrationExecutor(connection)
        executor.migrate(targets)
        return executor.loader.project_state(targets).apps

    def tearDown(self):
        call_command('migrate', verbosity=0)  # leave the test database fully migrated for the tests that follow
        super().tearDown()

    def test_marked_tasks_become_high_and_the_rest_medium(self):
        apps = self.migrate(self.before)
        User, Template, Day, Occurrence = (apps.get_model('auth', 'User'), apps.get_model('planner', 'TaskTemplate'), apps.get_model('planner', 'DayPlan'), apps.get_model('planner', 'TaskOccurrence'))
        user = User.objects.create(username='mig@example.com', email='mig@example.com')
        import datetime as dt
        day = dt.date(2026, 3, 10)
        Day.objects.create(user=user, plan_date=day)
        starred = Template.objects.create(user=user, title='Starred', recurrence='daily', starts_on=day, is_priority=True)
        plain = Template.objects.create(user=user, title='Plain', recurrence='daily', starts_on=day, is_priority=False)
        occ_starred = Occurrence.objects.create(user=user, plan_date=day, title='Starred', is_priority=True, template=starred, completion=0.5)
        occ_plain = Occurrence.objects.create(user=user, plan_date=day, title='Plain', template=plain)

        apps = self.migrate(self.after)
        Template, Occurrence = apps.get_model('planner', 'TaskTemplate'), apps.get_model('planner', 'TaskOccurrence')
        self.assertEqual(Template.objects.get(pk=starred.pk).priority_level, 'high')
        self.assertEqual(Template.objects.get(pk=plain.pk).priority_level, 'medium')
        self.assertEqual(Occurrence.objects.get(pk=occ_starred.pk).priority_level, 'high')
        self.assertEqual(Occurrence.objects.get(pk=occ_plain.pk).priority_level, 'medium')
        self.assertEqual(float(Occurrence.objects.get(pk=occ_starred.pk).completion), 0.5)  # nothing else changed
        self.assertEqual(Template.objects.count(), 2)

        apps = self.migrate(self.before)  # undone: the flag was kept, so nothing is lost but the difference between medium and low
        self.assertTrue(apps.get_model('planner', 'TaskTemplate').objects.get(pk=starred.pk).is_priority)
        self.assertFalse(apps.get_model('planner', 'TaskTemplate').objects.get(pk=plain.pk).is_priority)

        apps = self.migrate(self.after)  # and done again, with the same result
        self.assertEqual(apps.get_model('planner', 'TaskTemplate').objects.get(pk=starred.pk).priority_level, 'high')
