import { api, isApiConfigured } from './api/apiClient.js'
import { createDjangoClient } from './api/djangoClient.js'

// The backend is the Arcloop (Django) API at VITE_API_BASE_URL (see the README). This module is the one place the
// data client is created: the planner, reminder and profile services are wired to it, and screens read only the
// configuration flag.
//
// `dataClient` has the shape the services were written against (`from(table).select()...`, `auth.getSession()`),
// backed by HTTP requests to the API; it is null when the address is not configured, and every service then fails
// with a NOT_CONFIGURED error instead of guessing.
export const isBackendConfigured = isApiConfigured
export const dataClient = isApiConfigured ? createDjangoClient(api) : null
