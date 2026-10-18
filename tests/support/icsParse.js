import ICAL from 'ical.js'

// Reads an .ics file back with an INDEPENDENT iCalendar parser (Mozilla's ical.js), so tests check what a calendar app
// would see, not just what our own serialiser wrote. Returns the calendar's header values and a plain object per event.
export function parseIcs(text) {
  const root = new ICAL.Component(ICAL.parse(text)) // throws on malformed input
  const events = root.getAllSubcomponents('vevent').map((component) => {
    const start = component.getFirstProperty('dtstart')
    const end = component.getFirstProperty('dtend')
    const isDate = start.type === 'date'
    const instant = (property) => (property ? property.getFirstValue().toJSDate().toISOString() : null)
    return {
      uid: component.getFirstPropertyValue('uid'),
      summary: component.getFirstPropertyValue('summary'),
      description: component.getFirstPropertyValue('description'),
      categories: component.getFirstPropertyValue('categories') ?? null,
      priority: component.getFirstPropertyValue('priority') ?? null,
      transp: component.getFirstPropertyValue('transp') ?? null,
      allDay: isDate,
      // A timed event's start and end as UTC ISO instants; an all-day event's as plain dates.
      start: isDate ? start.getFirstValue().toString() : instant(start),
      end: end ? (isDate ? end.getFirstValue().toString() : instant(end)) : null,
      tzid: start.getParameter('tzid') ?? null,
      stamp: instant(component.getFirstProperty('dtstamp')),
      alarms: component.getAllSubcomponents('valarm').map((alarm) => ({ action: alarm.getFirstPropertyValue('action'), trigger: alarm.getFirstPropertyValue('trigger').toString(), description: alarm.getFirstPropertyValue('description') })),
    }
  })
  return {
    version: root.getFirstPropertyValue('version'),
    prodid: root.getFirstPropertyValue('prodid'),
    method: root.getFirstPropertyValue('method'),
    name: root.getFirstPropertyValue('x-wr-calname'),
    hasTimezoneComponent: root.getAllSubcomponents('vtimezone').length > 0,
    events,
  }
}
