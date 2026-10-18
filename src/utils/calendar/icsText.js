// The generic RFC 5545 (iCalendar) text rules, and nothing Arcloop-specific: escaping, line folding, date formats and
// serialisation. Pure functions, so they are testable on their own and the plan-to-calendar conversion stays readable.

export const CRLF = '\r\n'
const encoder = new TextEncoder()

// TEXT values (section 3.3.11): backslash, semicolon and comma are escaped, line breaks become \n, and other control
// characters, which a calendar file cannot carry, are dropped.
export function escapeText(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex -- removing control characters is the point of this line
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')
}

// Lines must not exceed 75 OCTETS (section 3.1). A longer line is folded: a line break plus one space, which the reader
// removes. Folding counts UTF-8 bytes, not characters, and never splits a character (or an emoji) in the middle.
export function foldLine(line) {
  if (encoder.encode(line).length <= 75) return line
  const parts = []
  let current = ''
  let bytes = 0
  for (const char of line) {
    const size = encoder.encode(char).length
    const limit = parts.length === 0 ? 75 : 74 // continuation lines start with a space that counts too
    if (bytes + size > limit) {
      parts.push(current)
      current = ''
      bytes = 0
    }
    current += char
    bytes += size
  }
  parts.push(current)
  return parts.join(`${CRLF} `)
}

const pad = (n, width = 2) => String(n).padStart(width, '0')

// An instant as an iCalendar UTC date-time: 20260310T130000Z.
export function formatUtc(ms) {
  const d = new Date(ms)
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

// A calendar date ('2026-03-10') as an iCalendar DATE: 20260310.
export const formatDate = (isoDate) => isoDate.replaceAll('-', '')

// NAME;PARAM=value:value. The caller escapes TEXT values (escapeText) before passing them in.
export function contentLine(name, value, params = {}) {
  const parameters = Object.entries(params).map(([key, paramValue]) => `;${key}=${paramValue}`).join('')
  return `${name}${parameters}:${value}`
}

// Lines to the file's text: each folded, joined by CRLF, with a final CRLF as the standard requires.
export const serialize = (lines) => lines.map(foldLine).join(CRLF) + CRLF
