from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import AuthToken


class Command(BaseCommand):
    help = 'Deletes expired logins. Run now and then (for example daily) to keep the database small.'

    def handle(self, *args, **options):
        deleted, _ = AuthToken.objects.filter(expires_at__lte=timezone.now()).delete()
        self.stdout.write(f'Deleted {deleted} expired logins.')
