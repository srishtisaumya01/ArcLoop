"""Prints, as JSON, what the SERVER's timezone database says about local dates and times, for the frontend to be checked against.

tests/integration/timezoneAgreement.integration.test.js runs this and compares every sample with the JavaScript helpers in
src/utils/planner/timeZones.js. The samples are a deliberate spread, not a proof: 16 zones (ordinary, half-hour and
45-minute offsets, date-line zones, southern-hemisphere DST, 30-minute DST, "negative" DST), the year 2026 only, every day
at four UTC times, every local midnight and every offset change at +-1 s, +-1 h and +-24 h, and real day lengths around
each change.
"""
import datetime as dt
import json
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand

ZONES = [
    'America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'America/Havana', 'Asia/Kolkata', 'Asia/Kathmandu',
    'Pacific/Chatham', 'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'America/Sao_Paulo',
    'Africa/Casablanca', 'Europe/Dublin', 'America/St_Johns', 'Australia/Adelaide', 'UTC',
]
START = dt.datetime(2025, 12, 31, tzinfo=dt.timezone.utc)
END = dt.datetime(2027, 1, 2, tzinfo=dt.timezone.utc)
UTC = dt.timezone.utc


def local(zone, epoch):
    return dt.datetime.fromtimestamp(epoch, tz=zone)


def offset_seconds(zone, epoch):
    return int(local(zone, epoch).utcoffset().total_seconds())


def transitions(zone):
    """Epochs (to the second) at which the UTC offset changes, found by scanning hourly then bisecting."""
    found = []
    t = int(START.timestamp())
    end = int(END.timestamp())
    previous = offset_seconds(zone, t)
    while t < end:
        nxt = t + 3600
        current = offset_seconds(zone, nxt)
        if current != previous:
            low, high = t, nxt
            while high - low > 1:
                mid = (low + high) // 2
                if offset_seconds(zone, mid) == previous:
                    low = mid
                else:
                    high = mid
            found.append(high)
        previous = current
        t = nxt
    return found


def ambiguous(zone, moment):
    naive = moment.replace(tzinfo=None)
    first = naive.replace(tzinfo=zone, fold=0).utcoffset()
    second = naive.replace(tzinfo=zone, fold=1).utcoffset()
    return first != second


def first_instant_of(zone, date):
    """The first epoch whose local date is `date` (later than 00:00 when midnight does not exist)."""
    guess = int(dt.datetime(date.year, date.month, date.day, tzinfo=UTC).timestamp()) - offset_seconds(zone, int(dt.datetime(date.year, date.month, date.day, 12, tzinfo=UTC).timestamp()))
    for epoch in range(guess - 3 * 3600, guess + 3 * 3600, 60):
        if local(zone, epoch).date() == date and local(zone, epoch - 60).date() < date:
            return epoch
    raise RuntimeError(f'no start of day found for {zone} {date}')


class Command(BaseCommand):
    help = 'Print local dates/times and day lengths from the server timezone database, as JSON.'

    def handle(self, *args, **options):
        samples = []  # [zone index, epoch seconds, 'YYYY-MM-DD', 'HH:MM:SS', ambiguous 0/1]
        lengths = []  # [zone index, 'YYYY-MM-DD', minutes in that local day]
        change_count = 0

        def add(index, zone, epoch):
            moment = local(zone, epoch)
            samples.append([index, epoch, moment.strftime('%Y-%m-%d'), moment.strftime('%H:%M:%S'), 1 if ambiguous(zone, moment) else 0])

        for index, name in enumerate(ZONES):
            zone = ZoneInfo(name)
            seen = set()

            def add_once(epoch, index=index, zone=zone, seen=seen):
                if epoch not in seen:
                    seen.add(epoch)
                    add(index, zone, epoch)

            day = START
            while day < END:
                midnight_utc = int(day.timestamp())
                for hour in (0, 6, 12, 18):
                    add_once(midnight_utc + hour * 3600)
                local_date = local(zone, midnight_utc + 12 * 3600).date()
                start = first_instant_of(zone, local_date)  # this local day's first instant, +-1 s around it
                for delta in (-1, 0, 1):
                    add_once(start + delta)
                day += dt.timedelta(days=1)
            changes = transitions(zone)
            change_count += len(changes)
            for epoch in changes:
                for delta in (-86400, -3600, -1, 0, 1, 3600, 86400):
                    add_once(epoch + delta)
                local_date = local(zone, epoch).date()
                for offset_days in range(-2, 3):
                    date = local_date + dt.timedelta(days=offset_days)
                    minutes = (first_instant_of(zone, date + dt.timedelta(days=1)) - first_instant_of(zone, date)) // 60
                    lengths.append([index, date.isoformat(), minutes])
        self.stdout.write(json.dumps({'zones': ZONES, 'samples': samples, 'dayLengths': lengths, 'changes': change_count}, separators=(',', ':')))
