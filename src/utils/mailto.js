import { SITE_CONFIG } from '../constants/siteConfig.js'

// The contact form's message as an email to the support inbox, to be opened in the visitor's own email app.
export function buildMailto({ email, topic, message }) {
  const subject = `[Arcloop] ${topic}`
  const body = `${message}\n\n${email}`
  return `mailto:${SITE_CONFIG.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
