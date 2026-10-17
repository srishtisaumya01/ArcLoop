import { supabase } from '../supabaseClient.js'
import { createReminderService } from './createReminderService.js'

export { createReminderService } from './createReminderService.js'

// The application's reminder service, wired to the one shared Supabase client. When Supabase is not
// configured every call fails with a NOT_CONFIGURED PlannerServiceError.
export const reminderService = createReminderService({ getClient: () => supabase })
