import { dataClient } from '../backend.js'
import { createPlannerService } from './createPlannerService.js'

export { createPlannerService } from './createPlannerService.js'
export { PlannerServiceError, SERVICE_ERROR, toServiceError } from './errors.js'

// The application's planner service, wired to the one shared data client (the Arcloop API). When the API
// address is not configured every call fails with a NOT_CONFIGURED PlannerServiceError.
export const plannerService = createPlannerService({ getClient: () => dataClient })
