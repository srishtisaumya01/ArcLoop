from unittest import mock

from planner import rules

from .base import TODAY, ApiCase

TOMORROW = '2026-03-11'


class MinimumDayTests(ApiCase):
    """Minimum Day: up to three tasks a person chooses to keep a day moving. A label only: it never changes completion,
    plan state or the baseline, so the full-plan progress is exactly what it was."""

    def flag(self, occurrence, value=True):
        return self.patch('task-occurrences', {'is_minimum': value}, id=occurrence['id'])

    def row(self, occurrence):
        return self.list('task-occurrences', id=occurrence['id']).json()['results'][0]

    def test_a_task_is_not_part_of_a_minimum_until_the_person_chooses_it(self):
        task = self.make_occurrence()
        self.assertIs(task['is_minimum'], False)
        self.assertError(self.post('task-occurrences', {'plan_date': TODAY, 'title': 'x', 'is_minimum': True}), 403, 'permission_denied')  # chosen after it exists, not at creation

    def test_choosing_and_clearing_changes_only_the_label(self):
        task = self.make_occurrence()
        before_day = self.list('day-plans', plan_date=TODAY).json()['results'][0]
        chosen = self.flag(task).json()['results'][0]
        self.assertIs(chosen['is_minimum'], True)
        for column in ('completion', 'completed_at', 'plan_state', 'excluded_reason', 'in_original_plan', 'is_customized', 'title'):
            self.assertEqual(chosen[column], task[column], column)
        self.assertEqual(self.list('day-plans', plan_date=TODAY).json()['results'][0], before_day)  # no baseline stamped, mode untouched
        self.assertIs(self.flag(task, False).json()['results'][0]['is_minimum'], False)

    def test_a_day_holds_at_most_three_and_a_freed_place_can_be_used(self):
        tasks = [self.make_occurrence(title=f'Task {i}') for i in range(4)]
        for task in tasks[:3]:
            self.assertEqual(self.flag(task).status_code, 200)
        self.assertError(self.flag(tasks[3]), 400, 'limit_reached')
        self.assertIs(self.row(tasks[3])['is_minimum'], False)
        self.flag(tasks[0], False)
        self.assertEqual(self.flag(tasks[3]).status_code, 200)
        self.assertEqual(self.flag(tasks[3]).status_code, 200)  # choosing the same task again is harmless

    def test_the_limit_is_per_day_and_follows_the_shared_constant(self):
        self.make_day(TOMORROW)
        today = [self.make_occurrence(title=f'T{i}') for i in range(3)]
        tomorrow = self.make_occurrence(TOMORROW, title='Next')
        for task in today:
            self.flag(task)
        self.assertEqual(self.flag(tomorrow).status_code, 200)  # a future day can be planned too; today being full does not matter
        with mock.patch.object(rules, 'MAX_MINIMUM_TASKS', 1):
            extra = self.make_occurrence(TOMORROW, title='Another')
            self.assertError(self.flag(extra), 400, 'limit_reached')

    def test_setting_a_task_aside_takes_it_out_of_the_minimum_and_it_does_not_come_back(self):
        task = self.make_occurrence()
        self.flag(task)
        aside = self.patch('task-occurrences', {'plan_state': 'excluded', 'excluded_reason': 'busy_day'}, id=task['id']).json()['results'][0]
        self.assertEqual((aside['plan_state'], aside['is_minimum']), ('excluded', False))
        restored = self.patch('task-occurrences', {'plan_state': 'active', 'excluded_reason': None}, id=task['id']).json()['results'][0]
        self.assertIs(restored['is_minimum'], False)  # restoring is a separate choice; nothing is re-chosen for the person

    def test_a_task_that_is_set_aside_cannot_be_chosen(self):
        task = self.make_occurrence()
        self.patch('task-occurrences', {'plan_state': 'excluded', 'excluded_reason': 'busy_day'}, id=task['id'])
        self.assertError(self.flag(task), 400, 'constraint_violation')

    def test_choosing_a_minimum_does_not_touch_the_other_tasks(self):
        chosen, other = self.make_occurrence(title='Chosen'), self.make_occurrence(title='Other')
        self.flag(chosen)
        after = self.row(other)
        self.assertEqual((after['completion'], after['plan_state'], after['is_minimum'], after['plan_date']), (0.0, 'active', False, TODAY))

    def test_completing_the_minimum_does_not_complete_anything_else(self):
        chosen, other = self.make_occurrence(title='Chosen'), self.make_occurrence(title='Other')
        self.flag(chosen)
        self.patch('task-occurrences', {'completion': 1}, id=chosen['id'])
        self.assertEqual(self.row(other)['completion'], 0.0)
        self.assertEqual(self.row(chosen)['completion'], 1.0)

    def test_a_done_task_can_be_part_of_the_minimum(self):
        task = self.make_occurrence()
        self.patch('task-occurrences', {'completion': 1}, id=task['id'])
        self.assertEqual(self.flag(task).status_code, 200)

    def test_only_an_editable_day_can_change_its_minimum(self):
        task = self.make_occurrence('2026-03-08')
        with mock.patch('planner.rules.now', lambda later=rules.now().replace(day=16): later):  # the 8th has left the 7-date window
            self.assertEqual(self.flag(task).json()['results'], [])
        self.assertIs(self.row(task)['is_minimum'], False)

    def test_malformed_values_are_refused(self):
        task = self.make_occurrence()
        for bad in ('yes', 1, None, 'true '):
            self.assertEqual(self.flag(task, bad).status_code, 400, repr(bad))
        self.assertIs(self.row(task)['is_minimum'], False)

    def test_one_person_can_never_choose_or_clear_another_persons_minimum(self):
        theirs = self.make_occurrence(title='Alice task')
        self.flag(theirs)
        self.as_user(self.bob)
        self.make_day()
        mine = self.make_occurrence(title='Bob task')
        self.assertEqual(self.flag(theirs, False).json()['results'], [])
        self.assertEqual(self.list('task-occurrences', id=theirs['id']).json()['results'], [])
        self.flag(mine)
        self.as_user(self.alice)
        self.assertIs(self.row(theirs)['is_minimum'], True)  # Bob's attempt changed nothing
        self.assertEqual(len([o for o in self.list('task-occurrences').json()['results'] if o['is_minimum']]), 1)  # and Bob's choice is not in Alice's list

    def test_moving_a_task_to_another_day_does_not_carry_the_label(self):
        task = self.make_occurrence()
        self.flag(task)
        self.make_day(TOMORROW)
        copy = self.post('task-occurrences', {'plan_date': TOMORROW, 'title': task['title'], 'rescheduled_from_id': task['id']}).json()['results'][0]
        self.assertIs(copy['is_minimum'], False)
        self.patch('task-occurrences', {'plan_state': 'excluded', 'excluded_reason': 'rescheduled'}, id=task['id'])
        self.assertIs(self.row(task)['is_minimum'], False)
