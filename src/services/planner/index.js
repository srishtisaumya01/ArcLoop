import { dataClient } from '../backend.js'
import { createPlannerService } from './createPlannerService.js'

export { createPlannerService } from './createPlannerService.js'
export { PlannerServiceError, SERVICE_ERROR, toServiceError } from './errors.js'

// The application's planner service, wired to the one shared data client (Supabase, or the
// Django API when VITE_BACKEND=django). When the chosen backend
// is not configured every call fails with a NOT_CONFIGURED PlannerServiceError.
export const plannerService = createPlannerService({ getClient: () => dataClient })
