from django.db import migrations, models


def priorities_from_flag(apps, schema_editor):
    """Every task already marked as a priority is a "high" priority; all the others are "medium" (the column's default)."""
    for name in ('TaskTemplate', 'TaskOccurrence'):
        apps.get_model('planner', name).objects.filter(is_priority=True).update(priority_level='high')


class Migration(migrations.Migration):
    dependencies = [('planner', '0002_occurrence_is_minimum')]

    operations = [
        migrations.AddField(model_name='tasktemplate', name='priority_level', field=models.CharField(default='medium', max_length=6)),
        migrations.AddField(model_name='taskoccurrence', name='priority_level', field=models.CharField(default='medium', max_length=6)),
        # The data is brought in step before the constraints that require it. Going back needs nothing: `is_priority` was kept all along,
        # and only the difference between medium and low is lost.
        migrations.RunPython(priorities_from_flag, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='tasktemplate',
            constraint=models.CheckConstraint(condition=models.Q(('priority_level__in', ['high', 'medium', 'low'])), name='task_templates_priority_level_valid'),
        ),
        migrations.AddConstraint(
            model_name='tasktemplate',
            constraint=models.CheckConstraint(
                condition=models.Q(models.Q(('is_priority', True), ('priority_level', 'high')), models.Q(('is_priority', False), models.Q(('priority_level', 'high'), _negated=True)), _connector='OR'),
                name='task_templates_priority_matches',
            ),
        ),
        migrations.AddConstraint(
            model_name='taskoccurrence',
            constraint=models.CheckConstraint(condition=models.Q(('priority_level__in', ['high', 'medium', 'low'])), name='task_occurrences_priority_level_valid'),
        ),
        migrations.AddConstraint(
            model_name='taskoccurrence',
            constraint=models.CheckConstraint(
                condition=models.Q(models.Q(('is_priority', True), ('priority_level', 'high')), models.Q(('is_priority', False), models.Q(('priority_level', 'high'), _negated=True)), _connector='OR'),
                name='task_occurrences_priority_matches',
            ),
        ),
    ]
