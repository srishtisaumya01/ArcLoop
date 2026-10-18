from unittest import mock

from planner import rules

from .base import TODAY, ApiCase


class TemplateTests(ApiCase):
    def test_create_list_update_delete_round_trip_with_client_row_shapes(self):
        t = self.make_template(title='Gym', recurrence='weekly', weekdays=[2, 4], planned_start='18:00', planned_end='19:00', estimated_minutes=60)
        self.assertEqual((t['planned_start'], t['planned_end'], t['weekdays'], t['ends_on'], t['archived_at']), ('18:00:00', '19:00:00', [2, 4], None, None))
        self.assertEqual(len(self.list('task-templates').json()['results']), 1)
        updated = self.patch('task-templates', {'title': 'Long gym', 'weekdays': [1, 2, 3]}, id=t['id']).json()['results']
        self.assertEqual((len(updated), updated[0]['title'], updated[0]['weekdays']), (1, 'Long gym', [1, 2, 3]))
        self.assertEqual(len(self.delete('task-templates', id=t['id']).json()['results']), 1)
        self.assertEqual(self.list('task-templates').json()['results'], [])

    def test_each_rule_of_the_check_constraints_is_enforced(self):
        bad = [
            {'title': '   '}, {'title': 'x' * 121}, {'description': 'x' * 1001}, {'category': ''}, {'estimated_minutes': 0}, {'estimated_minutes': 1441},
            {'planned_end': '09:00'},  # an end needs a start
            {'planned_start': '10:00', 'planned_end': '09:00'}, {'planned_start': '10:00', 'planned_end': '10:00'},
            {'recurrence': 'hourly'}, {'recurrence': 'weekly'}, {'recurrence': 'weekly', 'weekdays': []}, {'recurrence': 'weekly', 'weekdays': [1, 1]},
            {'recurrence': 'weekly', 'weekdays': [0]}, {'recurrence': 'daily', 'weekdays': [1]},
            {'ends_on': '2026-02-28'}, {'recurrence': 'once', 'ends_on': None}, {'recurrence': 'once', 'ends_on': '2026-03-02'},
        ]
        for extra in bad:
            response = self.post('task-templates', {'title': 'Walk', 'recurrence': 'daily', 'starts_on': '2026-03-01', **extra})
            self.assertError(response, 400, 'constraint_violation')
        self.assertEqual(self.list('task-templates').json()['results'], [])
        ok = self.post('task-templates', {'title': 'Once', 'recurrence': 'once', 'starts_on': '2026-03-05', 'ends_on': '2026-03-05'})
        self.assertEqual(ok.status_code, 201)

    def test_malformed_input_is_a_field_error_and_server_fields_are_refused(self):
        self.assertError(self.post('task-templates', {'title': 5, 'recurrence': 'daily', 'starts_on': '2026-03-01'}), 400, 'validation_error')
        self.assertError(self.post('task-templates', {'title': 'x', 'recurrence': 'daily', 'starts_on': '03/01/2026'}), 400, 'validation_error')
        self.assertError(self.post('task-templates', {'recurrence': 'daily', 'starts_on': '2026-03-01'}), 400, 'validation_error')
        for forbidden in ({'id': '11111111-1111-4111-8111-111111111111'}, {'created_at': '2000-01-01T00:00:00Z'}, {'user_id': self.bob.pk}):
            self.assertError(self.post('task-templates', {'title': 'x', 'recurrence': 'daily', 'starts_on': '2026-03-01', **forbidden}), 403, 'permission_denied')
        own = self.post('task-templates', {'title': 'x', 'recurrence': 'daily', 'starts_on': '2026-03-01', 'user_id': self.alice.pk})
        self.assertEqual(own.status_code, 201)

    def test_active_template_cap_counts_only_active_ones(self):
        with mock.patch.object(rules, 'MAX_ACTIVE_TEMPLATES', 2):
            a = self.make_template(title='a')
            self.make_template(title='b')
            self.assertError(self.post('task-templates', {'title': 'c', 'recurrence': 'daily', 'starts_on': '2026-03-01'}), 400, 'limit_reached')
            self.patch('task-templates', {'archived_at': '2026-03-10T15:00:00Z'}, id=a['id'])
            self.make_template(title='c')  # a slot is free again
            self.assertError(self.patch('task-templates', {'archived_at': None}, id=a['id']), 400, 'limit_reached')

    def test_filters_ordering_and_paging(self):
        for title, start in (('a', '2026-03-01'), ('b', '2026-03-05'), ('c', '2026-03-09')):
            self.make_template(title=title, starts_on=start)
        titles = lambda r: [x['title'] for x in r.json()['results']]
        self.assertEqual(titles(self.list('task-templates', starts_on__lte='2026-03-05', order='starts_on')), ['a', 'b'])
        self.assertEqual(titles(self.list('task-templates', order='-starts_on', limit=2)), ['c', 'b'])
        self.assertEqual(titles(self.list('task-templates', order='starts_on', limit=2, offset=2)), ['c'])
        self.assertEqual(titles(self.list('task-templates', title__in='a,c', order='title')), ['a', 'c'])
        self.assertEqual(titles(self.list('task-templates', ends_on__isnull='true', title__neq='a', order='title')), ['b', 'c'])
        self.assertError(self.list('task-templates', nonsense='1'), 400, 'validation_error')
        self.assertError(self.list('task-templates', starts_on__lte='soon'), 400, 'validation_error')
        self.assertError(self.list('task-templates', order='password'), 400, 'validation_error')

    def test_changes_and_deletes_need_a_filter(self):
        self.make_template()
        self.assertError(self.client.patch('/api/v1/task-templates/', {'title': 'x'}, format='json'), 400, 'validation_error')
        self.assertError(self.client.delete('/api/v1/task-templates/'), 400, 'validation_error')
        self.assertEqual(len(self.list('task-templates').json()['results']), 1)

    def test_deleting_a_template_keeps_history_and_cleans_suppression_lists(self):
        t = self.make_template()
        self.make_day()
        occ = self.make_occurrence(template_id=t['id'])
        self.patch('day-plans', {'suppressed_template_ids': [t['id']]}, plan_date=TODAY)
        self.delete('task-templates', id=t['id'])
        kept = self.list('task-occurrences', id=occ['id']).json()['results'][0]
        self.assertEqual((kept['title'], kept['template_id']), ('Task', None))
        self.assertEqual(self.list('day-plans').json()['results'][0]['suppressed_template_ids'], [])


class DayTests(ApiCase):
    def test_a_new_day_starts_normal_without_a_baseline(self):
        day = self.make_day()
        self.assertEqual((day['plan_date'], day['day_mode'], day['baseline_at'], day['suppressed_template_ids']), (TODAY, 'normal', None, []))
        self.assertError(self.post('day-plans', {'plan_date': TODAY}), 409, 'conflict')

    def test_clients_cannot_write_server_fields_or_delete_days(self):
        self.assertError(self.post('day-plans', {'plan_date': TODAY, 'baseline_at': '2026-03-01T00:00:00Z'}), 403, 'permission_denied')
        self.assertError(self.post('day-plans', {'plan_date': TODAY, 'day_mode': 'rest'}), 403, 'permission_denied')
        self.make_day()
        self.assertError(self.patch('day-plans', {'baseline_at': None}, plan_date=TODAY), 403, 'permission_denied')
        self.assertEqual(self.delete('day-plans', plan_date=TODAY).json()['results'], [])
        self.assertEqual(len(self.list('day-plans').json()['results']), 1)

    def test_the_seven_date_window_and_the_far_future_bound(self):
        self.assertEqual(self.post('day-plans', {'plan_date': '2026-03-04'}).status_code, 201)  # today - 6
        self.assertError(self.post('day-plans', {'plan_date': '2026-03-03'}), 403, 'permission_denied')
        self.assertEqual(self.post('day-plans', {'plan_date': '2027-03-11'}).status_code, 201)  # today + 366
        self.assertError(self.post('day-plans', {'plan_date': '2027-03-12'}), 400, 'date_rule')

    def test_the_window_follows_the_profile_timezone(self):
        self.as_user(self.make_user('nz@example.com', 'Pacific/Auckland'))  # already Wednesday 11 March there
        self.assertEqual(self.post('day-plans', {'plan_date': '2026-03-05'}).status_code, 201)
        self.assertError(self.post('day-plans', {'plan_date': '2026-03-04'}), 403, 'permission_denied')

    def test_old_days_are_read_only_history(self):
        old = self.make_day('2026-03-04')
        with mock.patch('planner.rules.now', lambda later=rules.now().replace(day=11): later):  # a day later: the 4th falls out of the window
            self.assertEqual(self.list('day-plans').json()['results'][0]['plan_date'], old['plan_date'])
            self.assertEqual(self.patch('day-plans', {'day_mode': 'rest'}, plan_date='2026-03-04').json()['results'], [])

    def test_choosing_busy_or_rest_fixes_the_baseline_once(self):
        self.make_day()
        first = self.patch('day-plans', {'day_mode': 'busy'}, plan_date=TODAY).json()['results'][0]
        self.assertEqual(first['baseline_at'], '2026-03-10T15:00:00Z')
        later = self.patch('day-plans', {'day_mode': 'normal'}, plan_date=TODAY).json()['results'][0]
        self.assertEqual((later['day_mode'], later['baseline_at']), ('normal', first['baseline_at']))  # never cleared
        self.assertError(self.patch('day-plans', {'day_mode': 'party'}, plan_date=TODAY), 400, 'constraint_violation')

    def test_suppressed_templates_must_be_the_users_own_and_are_deduplicated(self):
        self.make_day()
        mine = self.make_template()
        self.as_user(self.bob)
        theirs = self.make_template(title='Bob only')
        self.as_user(self.alice)
        self.assertError(self.patch('day-plans', {'suppressed_template_ids': [theirs['id']]}, plan_date=TODAY), 404, 'not_found')
        done = self.patch('day-plans', {'suppressed_template_ids': [mine['id'], mine['id']]}, plan_date=TODAY).json()['results'][0]
        self.assertEqual(done['suppressed_template_ids'], [mine['id']])
        with mock.patch.object(rules, 'MAX_SUPPRESSED', 0):
            self.assertError(self.patch('day-plans', {'suppressed_template_ids': [mine['id']]}, plan_date=TODAY), 400, 'limit_reached')


class OccurrenceTests(ApiCase):
    def test_a_day_must_exist_and_the_references_must_be_the_users_own(self):
        self.assertError(self.post('task-occurrences', {'plan_date': TODAY, 'title': 'x'}), 404, 'not_found')
        self.make_day()
        self.as_user(self.bob)
        theirs = self.make_template(title='Bob only')
        self.make_day()
        theirs_occ = self.make_occurrence(template_id=theirs['id'])
        self.as_user(self.alice)
        self.assertError(self.post('task-occurrences', {'plan_date': TODAY, 'title': 'x', 'template_id': theirs['id']}), 404, 'not_found')
        self.assertError(self.post('task-occurrences', {'plan_date': TODAY, 'title': 'x', 'rescheduled_from_id': theirs_occ['id']}), 404, 'not_found')

    def test_new_occurrences_start_pending_and_active_and_take_the_original_plan_flag_from_the_baseline(self):
        before = self.make_occurrence()
        self.assertEqual((before['completion'], before['plan_state'], before['completed_at'], before['excluded_at'], before['in_original_plan']), (0.0, 'active', None, None, True))
        self.patch('task-occurrences', {'completion': 1}, id=before['id'])  # first progress fixes the baseline
        after = self.post('task-occurrences', {'plan_date': TODAY, 'title': 'late'}).json()['results'][0]
        self.assertFalse(after['in_original_plan'])  # D11
        for forbidden in ({'completion': 1}, {'plan_state': 'excluded'}, {'in_original_plan': False}, {'completed_at': '2026-03-10T00:00:00Z'}):
            self.assertError(self.post('task-occurrences', {'plan_date': TODAY, 'title': 'x', **forbidden}), 403, 'permission_denied')

    def test_completion_only_allows_the_three_values_and_stamps_times_on_the_server(self):
        occ = self.make_occurrence()
        for bad in (0.45, 2, -1, '1', True):
            self.assertEqual(self.patch('task-occurrences', {'completion': bad}, id=occ['id']).status_code, 400, bad)
        half = self.patch('task-occurrences', {'completion': 0.5}, id=occ['id']).json()['results'][0]
        self.assertEqual((half['completion'], half['completed_at']), (0.5, '2026-03-10T15:00:00Z'))
        with mock.patch('planner.rules.now', lambda later=rules.now().replace(hour=18): later):
            same = self.patch('task-occurrences', {'completion': 0.5, 'title': 'Renamed'}, id=occ['id']).json()['results'][0]
            self.assertEqual(same['completed_at'], half['completed_at'])  # unchanged completion keeps its time
        undone = self.patch('task-occurrences', {'completion': 0}, id=occ['id']).json()['results'][0]
        self.assertIsNone(undone['completed_at'])
        self.assertError(self.patch('task-occurrences', {'completed_at': '2026-03-10T00:00:00Z'}, id=occ['id']), 403, 'permission_denied')

    def test_a_conditional_patch_changes_a_row_only_while_it_is_still_in_the_expected_state(self):
        """Undo relies on this existing contract: filters on the PATCH decide which rows it touches, so naming the state the row
        is expected to be in (`completion=1`) makes the update a compare-and-set. A row in any other state is simply not
        matched: 200 with an empty list, and nothing is written."""
        occ = self.make_occurrence()
        self.patch('task-occurrences', {'completion': 1}, id=occ['id'])
        # Still done: the conditional update applies, and the server clears the completion time.
        undone = self.patch('task-occurrences', {'completion': 0}, id=occ['id'], completion=1)
        self.assertEqual(undone.status_code, 200)
        self.assertEqual([(r['completion'], r['completed_at']) for r in undone.json()['results']], [(0.0, None)])
        # It is no longer done, so the same conditional update matches nothing and changes nothing.
        stale = self.patch('task-occurrences', {'completion': 0.5}, id=occ['id'], completion=1)
        self.assertEqual((stale.status_code, stale.json()), (200, {'results': []}))
        self.assertEqual(self.list('task-occurrences', id=occ['id']).json()['results'][0]['completion'], 0.0)
        # Half-done values compare exactly too, and a condition that is not a valid value is refused, not ignored.
        self.patch('task-occurrences', {'completion': 0.5}, id=occ['id'])
        self.assertEqual(self.patch('task-occurrences', {'completion': 1}, id=occ['id'], completion=0.5).json()['results'][0]['completion'], 1.0)
        self.assertEqual(self.patch('task-occurrences', {'completion': 0}, id=occ['id'], completion=0.5).json()['results'], [])
        self.assertError(self.patch('task-occurrences', {'completion': 0}, id=occ['id'], completion='soon'), 400, 'validation_error')

    def test_a_conditional_patch_never_reaches_another_persons_row(self):
        occ = self.make_occurrence()
        self.patch('task-occurrences', {'completion': 1}, id=occ['id'])
        self.as_user(self.bob)
        self.assertEqual(self.patch('task-occurrences', {'completion': 0}, id=occ['id'], completion=1).json()['results'], [])
        self.as_user(self.alice)
        self.assertEqual(self.list('task-occurrences', id=occ['id']).json()['results'][0]['completion'], 1.0)

    def test_progress_is_only_recorded_for_today_or_earlier(self):
        self.make_day('2026-03-11')
        future = self.make_occurrence('2026-03-11')
        self.assertError(self.patch('task-occurrences', {'completion': 1}, id=future['id']), 400, 'date_rule')
        self.assertEqual(self.patch('task-occurrences', {'title': 'Plan ahead'}, id=future['id']).status_code, 200)
        past = self.make_occurrence('2026-03-08')
        self.assertEqual(self.patch('task-occurrences', {'completion': 1}, id=past['id']).status_code, 200)

    def test_set_aside_rules_and_the_baseline(self):
        occ = self.make_occurrence()
        self.assertError(self.patch('task-occurrences', {'plan_state': 'excluded'}, id=occ['id']), 400, 'constraint_violation')  # needs a reason
        self.assertError(self.patch('task-occurrences', {'excluded_reason': 'removed'}, id=occ['id']), 400, 'constraint_violation')  # a reason needs the state
        self.assertError(self.patch('task-occurrences', {'plan_state': 'excluded', 'excluded_reason': 'because'}, id=occ['id']), 400, 'constraint_violation')
        away = self.patch('task-occurrences', {'plan_state': 'excluded', 'excluded_reason': 'busy_day'}, id=occ['id']).json()['results'][0]
        self.assertEqual((away['plan_state'], away['excluded_at']), ('excluded', '2026-03-10T15:00:00Z'))
        self.assertEqual(self.list('day-plans').json()['results'][0]['baseline_at'], '2026-03-10T15:00:00Z')
        back = self.patch('task-occurrences', {'plan_state': 'active', 'excluded_reason': None}, id=occ['id']).json()['results'][0]
        self.assertEqual((back['plan_state'], back['excluded_at'], back['excluded_reason']), ('active', None, None))
        done = self.make_occurrence()
        self.patch('task-occurrences', {'completion': 1}, id=done['id'])
        self.assertError(self.patch('task-occurrences', {'plan_state': 'excluded', 'excluded_reason': 'removed'}, id=done['id']), 400, 'constraint_violation')
        partly = self.make_occurrence()
        self.patch('task-occurrences', {'completion': 0.5}, id=partly['id'])
        self.assertEqual(self.patch('task-occurrences', {'plan_state': 'excluded', 'excluded_reason': 'rescheduled'}, id=partly['id']).status_code, 200)  # C2

    def test_identity_fields_cannot_be_rewritten(self):
        occ = self.make_occurrence()
        for field, value in (('plan_date', '2026-03-09'), ('template_id', None), ('user_id', self.bob.pk), ('id', '11111111-1111-4111-8111-111111111111'), ('in_original_plan', False)):
            self.assertError(self.patch('task-occurrences', {field: value}, id=occ['id']), 403, 'permission_denied')

    def test_one_occurrence_per_template_per_day_and_a_daily_cap(self):
        t = self.make_template()
        self.make_day()
        self.make_occurrence(template_id=t['id'])
        self.assertError(self.post('task-occurrences', {'plan_date': TODAY, 'title': 'again', 'template_id': t['id']}), 409, 'conflict')
        with mock.patch.object(rules, 'MAX_OCCURRENCES_PER_DAY', 2):
            self.make_occurrence()
            self.assertError(self.post('task-occurrences', {'plan_date': TODAY, 'title': 'third'}), 400, 'limit_reached')

    def test_a_batch_is_all_or_nothing(self):
        self.make_day()
        response = self.post('task-occurrences', [{'plan_date': TODAY, 'title': 'ok'}, {'plan_date': TODAY, 'title': ''}])
        self.assertError(response, 400, 'constraint_violation')
        self.assertEqual(self.list('task-occurrences').json()['results'], [])
        ok = self.post('task-occurrences', [{'plan_date': TODAY, 'title': 'one'}, {'plan_date': TODAY, 'title': 'two'}])
        self.assertEqual([r['title'] for r in ok.json()['results']], ['one', 'two'])

    def test_hard_delete_only_for_untouched_tasks_and_never_original_plan_tasks_after_the_baseline(self):
        untouched = self.make_occurrence()
        self.assertEqual(len(self.delete('task-occurrences', id=untouched['id']).json()['results']), 1)  # no baseline yet: allowed
        a, b = self.make_occurrence(), self.make_occurrence()
        self.patch('task-occurrences', {'completion': 1}, id=a['id'])  # baseline now exists
        self.assertEqual(self.delete('task-occurrences', id=a['id']).json()['results'], [])  # has progress
        self.assertEqual(self.delete('task-occurrences', id=b['id']).json()['results'], [])  # original plan after baseline
        late = self.post('task-occurrences', {'plan_date': TODAY, 'title': 'late'}).json()['results'][0]
        self.assertEqual(len(self.delete('task-occurrences', id=late['id']).json()['results']), 1)  # added after the baseline
        self.assertEqual(len(self.list('task-occurrences').json()['results']), 2)

    def test_rescheduled_from_is_cleared_when_the_source_is_deleted_and_never_points_at_itself(self):
        source = self.make_occurrence()
        self.make_day('2026-03-11')
        moved = self.make_occurrence('2026-03-11', rescheduled_from_id=source['id'])
        self.assertEqual(moved['rescheduled_from_id'], source['id'])
        self.assertEqual(len(self.list('task-occurrences', rescheduled_from_id__in=source['id']).json()['results']), 1)
        self.delete('task-occurrences', id=source['id'])
        self.assertIsNone(self.list('task-occurrences', id=moved['id']).json()['results'][0]['rescheduled_from_id'])

    def test_the_edit_window_applies_to_occurrences(self):
        self.assertError(self.post('task-occurrences', {'plan_date': '2026-03-01', 'title': 'x'}), 403, 'permission_denied')
        old = self.make_occurrence('2026-03-04')
        with mock.patch('planner.rules.now', lambda later=rules.now().replace(day=11): later):
            self.assertEqual(self.patch('task-occurrences', {'title': 'x'}, id=old['id']).json()['results'], [])
            self.assertEqual(self.delete('task-occurrences', id=old['id']).json()['results'], [])
            self.assertEqual(len(self.list('task-occurrences', id=old['id']).json()['results']), 1)  # still readable


class IsolationTests(ApiCase):
    """One user can never read, change or delete another user's rows, whatever ids or filters they send."""

    def setUp(self):
        super().setUp()
        self.t = self.make_template(title='Alice template')
        self.make_day()
        self.o = self.make_occurrence(title='Alice task')
        self.r = self.post('task-reminders', {'occurrence_id': self.o['id'], 'remind_time': '08:30'}).json()['results'][0]
        self.post('reminder-preferences', {'enabled': True})
        self.as_user(self.bob)

    def test_reads_return_nothing_even_when_asking_by_id(self):
        for name, key, value in (('task-templates', 'id', self.t['id']), ('task-occurrences', 'id', self.o['id']), ('task-reminders', 'id', self.r['id']), ('day-plans', 'plan_date', TODAY)):
            self.assertEqual(self.list(name, **{key: value}).json()['results'], [], name)
            self.assertEqual(self.list(name).json()['results'], [], name)
        self.assertEqual(self.list('reminder-preferences').json()['results'], [])
        self.assertEqual(self.list('task-templates', user_id=self.alice.pk).json()['results'], [])

    def test_writes_and_deletes_touch_nothing(self):
        self.assertEqual(self.patch('task-templates', {'title': 'hacked'}, id=self.t['id']).json()['results'], [])
        self.assertEqual(self.patch('task-occurrences', {'completion': 1}, id=self.o['id']).json()['results'], [])
        self.assertEqual(self.patch('day-plans', {'day_mode': 'rest'}, plan_date=TODAY).json()['results'], [])
        self.assertEqual(self.patch('task-reminders', {'remind_time': '01:00'}, id=self.r['id']).json()['results'], [])
        self.assertEqual(self.delete('task-templates', id=self.t['id']).json()['results'], [])
        self.assertEqual(self.delete('task-occurrences', id=self.o['id']).json()['results'], [])
        self.assertEqual(self.delete('task-reminders', id=self.r['id']).json()['results'], [])
        self.as_user(self.alice)
        self.assertEqual(self.list('task-templates').json()['results'][0]['title'], 'Alice template')
        self.assertEqual(self.list('task-occurrences').json()['results'][0]['completion'], 0.0)
        self.assertEqual(self.list('task-reminders').json()['results'][0]['remind_time'], '08:30:00')

    def test_cannot_attach_to_or_impersonate_another_user(self):
        self.make_day()
        self.assertError(self.post('task-occurrences', {'plan_date': TODAY, 'title': 'x', 'template_id': self.t['id']}), 404, 'not_found')
        self.assertError(self.post('task-reminders', {'occurrence_id': self.o['id'], 'remind_time': '08:30'}), 404, 'not_found')
        self.assertError(self.post('task-templates', {'title': 'x', 'recurrence': 'daily', 'starts_on': '2026-03-01', 'user_id': self.alice.pk}), 403, 'permission_denied')
