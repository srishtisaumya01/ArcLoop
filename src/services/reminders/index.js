import { dataClient } from '../backend.js'
import { createReminderService } from './createReminderService.js'

export { createReminderService } from './createReminderService.js'

// The application's reminder service, wired to the one shared data client (the Arcloop API). When the API
// address is not configured every call fails with a NOT_CONFIGURED PlannerServiceError.
export const reminderService = createReminderService({ getClient: () => dataClient })
