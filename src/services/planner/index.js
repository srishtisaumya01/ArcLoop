import { supabase } from '../supabaseClient.js'
import { createPlannerService } from './createPlannerService.js'

export { createPlannerService } from './createPlannerService.js'
export { PlannerServiceError, SERVICE_ERROR, toServiceError } from './errors.js'

// The application's planner service, wired to the one shared Supabase client. When Supabase
// is not configured every call fails with a NOT_CONFIGURED PlannerServiceError.
export const plannerService = createPlannerService({ getClient: () => supabase })
