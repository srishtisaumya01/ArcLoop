"""Prints, as JSON, the columns a client may write on each planner collection, and the limits the client mirrors.

The frontend keeps its own copy of these lists (src/services/planner/mappers.js) so it can never try to write a
server-maintained column; tests/integration/writableColumns.integration.test.js runs this command and checks
that the two copies are identical.
"""
import json

from django.core.management.base import BaseCommand

from planner import rules
from planner.resources import DayResource, OccurrenceResource, TemplateResource


class Command(BaseCommand):
    help = 'Print the client-writable columns of each planner collection as JSON.'

    def handle(self, *args, **options):
        resources = {'task_templates': TemplateResource(), 'day_plans': DayResource(), 'task_occurrences': OccurrenceResource()}
        columns = {name: {'insert': sorted(r.insert_fields), 'update': sorted(r.update_fields)} for name, r in resources.items()}
        self.stdout.write(json.dumps({**columns, 'limits': {'minimum_tasks': rules.MAX_MINIMUM_TASKS}}))
