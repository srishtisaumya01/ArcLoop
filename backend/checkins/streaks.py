from datetime import timedelta


def streaks(done_dates, today):
    """(current, best) streak lengths from the set of dates that were fully checked in and out.

    The current streak runs back from today if today is done, otherwise from yesterday: today is still open, so it only
    breaks once the day has passed without a check-out."""
    done = set(done_dates)
    day = today if today in done else today - timedelta(days=1)
    current = 0
    while day in done:
        current += 1
        day -= timedelta(days=1)
    best = run = 0
    previous = None
    for d in sorted(done):
        run = run + 1 if previous is not None and d - previous == timedelta(days=1) else 1
        best = max(best, run)
        previous = d
    return current, best
