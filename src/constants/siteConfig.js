// Site-wide configuration placeholders. NOTHING here is a real identity or
// contact. Leave a value empty until the owner supplies the real one; the UI
// shows a visible "to be configured" marker for empty values.
export const SITE_CONFIG = {
  legalEntityName: '',
  supportEmail: '',
  postalAddress: '',
  governingLaw: '',
  legalLastUpdated: '',
}

export function configured(value, label) {
  return value && value.trim() ? value : `[${label}: to be configured]`
}
