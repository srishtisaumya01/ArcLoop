from django.core.management.base import BaseCommand

from checkins.reminders import send_reminders


class Command(BaseCommand):
    help = 'Sends the 5 pm and 10 pm streak reminder emails that are due now. Run it every 30 minutes.'

    def add_arguments(self, parser):
        parser.add_argument('--slot', choices=['evening', 'night'], help='send this reminder now, whatever the time')
        parser.add_argument('--email', help='only this account (also resends even if already sent today)')
        parser.add_argument('--dry-run', action='store_true', help='print who would get an email; send nothing')

    def handle(self, *args, **options):
        self.stdout.write(str(send_reminders(only_slot=options['slot'], dry_run=options['dry_run'], only_email=options['email'])))
