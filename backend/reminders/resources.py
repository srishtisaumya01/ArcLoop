"""Reminder preferences (one row per user) and per-task reminders. Ports the reminders migration's triggers."""
import datetime as dt

from config.errors import not_found, validation_error
from config.resources import Resource
from planner.models import TaskOccurrence
from planner.rules import now, validate_weekdays

from .models import ReminderPreference, TaskReminder


def _whole_minute(value, field):
    if value is None or value.second or value.microsecond:
        raise validation_error('Please check the highlighted details.', {field: 'Use a whole minute.'}, code='constraint_violation')


class PreferenceResource(Resource):
    name = 'reminder-preferences'
    model = ReminderPreference
    fields = {'user_id': 'int', 'enabled': 'bool', 'remind_time': 'time', 'weekdays': 'intlist', 'last_notified_on': 'date', 'created_at': 'datetime'}
    editable = ('enabled', 'remind_time', 'weekdays', 'last_notified_on')
    insert_fields = ('user_id', *editable)
    update_fields = editable

    def _check(self, pref):
        _whole_minute(pref.remind_time, 'remind_time')
        if not validate_weekdays(pref.weekdays):
            raise validation_error('Please check the highlighted details.', {'weekdays': 'Choose at least one day.'}, code='constraint_violation')

    def create(self, user, values):
        if ReminderPreference.objects.filter(user=user).exists():
            from config.errors import conflict

            raise conflict()
        pref = ReminderPreference(user=user, **values)
        if 'weekdays' not in values:
            pref.weekdays = [1, 2, 3, 4, 5, 6, 7]
        if 'remind_time' not in values:
            pref.remind_time = dt.time(9, 0)
        self._check(pref)
        pref.save()
        return pref

    def update(self, user, pref, values):
        for column, value in values.items():
            setattr(pref, column, value)
        self._check(pref)
        pref.save()
        return pref


class TaskReminderResource(Resource):
    name = 'task-reminders'
    model = TaskReminder
    fields = {
        'id': 'uuid', 'user_id': 'int', 'occurrence_id': 'uuid', 'plan_date': 'date', 'remind_time': 'time',
        'notified_at': 'datetime', 'created_at': 'datetime',
    }
    insert_fields = ('user_id', 'occurrence_id', 'remind_time')
    update_fields = ('remind_time', 'notified_at')
    nullable = ('notified_at',)
    order_default = ('plan_date', 'remind_time')

    def create(self, user, values):
        for required in ('occurrence_id', 'remind_time'):
            if values.get(required) is None:
                raise validation_error('Please check the highlighted details.', {required: 'This is required.'})
        occurrence = TaskOccurrence.objects.filter(user=user, pk=values['occurrence_id']).first()
        if occurrence is None:
            raise not_found('Something this refers to could not be found.')
        _whole_minute(values['remind_time'], 'remind_time')
        # plan_date comes from the occurrence, never from the client; a new reminder has not been delivered.
        return TaskReminder.objects.create(user=user, occurrence=occurrence, plan_date=occurrence.plan_date, remind_time=values['remind_time'])

    def update(self, user, reminder, values):
        if 'remind_time' in values:
            if values['remind_time'] is None:
                raise validation_error('Please check the highlighted details.', {'remind_time': 'This is required.'})
            _whole_minute(values['remind_time'], 'remind_time')
            if values['remind_time'] != reminder.remind_time:
                reminder.remind_time = values['remind_time']
                reminder.notified_at = None  # a new time is a new schedule: it can be delivered once more
                values = {k: v for k, v in values.items() if k != 'notified_at'}
        if 'notified_at' in values:
            reminder.notified_at = values['notified_at']
        reminder.save()
        return reminder
