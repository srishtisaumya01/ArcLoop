import {
  assertEditableDate,
  buildPlanSnapshot,
  classifyDate,
  compareDates,
  diffDays,
  editableRange,
  isValidDate,
  occurrencesToCreate,
  parseDate,
  planRemoval,
  planTemplateEdit,
  planUndoReschedule,
  resolveContext,
  restoreOccurrence as restoreLogic,
  rescheduleOccurrence as rescheduleLogic,
  setAside as setAsideLogic,
  setCompletion as setCompletionLogic,
  setDayMode as setDayModeLogic,
  sortOccurrencesForDisplay,
  summarizeDay,
  summarizeWeek,
  validateTemplateInput,
  weekDates,
  ERR,
  EXCLUDED_REASONS,
  PLAN_STATES,
  PlannerError,
  RECURRENCE,
} from '../../utils/planner/index.js'
import { PlannerServiceError, SERVICE_ERROR, toServiceError } from './errors.js'
import {
  DAY_COLUMNS,
  OCCURRENCE_COLUMNS,
  TEMPLATE_COLUMNS,
  dayFromRow,
  dayInsertRow,
  occurrenceDetailsRow,
  occurrenceDiffRow,
  occurrenceFromRow,
  occurrenceInsertRow,
  occurrenceStateRow,
  templateFromRow,
  templateInsertRow,
  templateUpdateRow,
} from './mappers.js'

const T = Object.freeze({ templates: 'task_templates', days: 'day_plans', occurrences: 'task_occurrences' })
const PAGE = 1000
const MAX_SNAPSHOT_SPAN_DAYS = 62
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const fail = (code, message, details = {}) => new PlannerServiceError(code, message, { details })
const check = (response) => {
  if (response.error) throw toServiceError(response.error)
  return response.data
}
function assertId(value, label = 'id') {
  if (typeof value !== 'string' || !UUID.test(value)) throw fail(SERVICE_ERROR.VALIDATION, 'That reference is not valid.', { field: label })
}

// Planner services. All authorisation is done by the database (Row Level Security): the
// service never relies on filtering by user id as a security boundary. It reads the signed-in
// user from the existing Supabase session, validates input with the pure planner logic before
// any write, and turns every failure into a PlannerServiceError. A write that did not take
// effect (zero rows) is reported as an error, never as success.
//
// `getClient` returns the authenticated Supabase client (or null when unconfigured).
// `clock` returns the current time in ms; inject a fixed one in tests.
export function createPlannerService({ getClient, clock = () => Date.now() }) {
  async function session() {
    const client = getClient()
    if (!client) throw fail(SERVICE_ERROR.NOT_CONFIGURED, 'The planner is not available right now.')
    const auth = await client.auth.getSession()
    if (auth.error) throw toServiceError(auth.error)
    const userId = auth.data?.session?.user?.id
    if (!userId) throw fail(SERVICE_ERROR.AUTH_REQUIRED, 'Please log in to continue.')
    // "Today" and every date rule use the profile timezone, exactly like the pure planner.
    const profile = check(await client.from('profiles').select('timezone').eq('id', userId).maybeSingle())
    if (!profile) throw fail(SERVICE_ERROR.NOT_FOUND, 'Your profile could not be found.')
    const ctx = { now: clock(), timeZone: profile.timezone }
    const { today, config } = resolveContext(ctx)
    return { client, userId, ctx, today, config }
  }

  // ---- reads ---------------------------------------------------------------

  async function fetchAll(query) {
    const out = []
    for (let from = 0; ; from += PAGE) {
      const rows = check(await query(from, from + PAGE - 1)) ?? []
      out.push(...rows)
      if (rows.length < PAGE) return out
    }
  }

  async function fetchDay(client, planDate) {
    const row = check(await client.from(T.days).select(DAY_COLUMNS).eq('plan_date', planDate).maybeSingle())
    return row ? dayFromRow(row) : null
  }

  async function fetchOccurrence(client, id) {
    const row = check(await client.from(T.occurrences).select(OCCURRENCE_COLUMNS).eq('id', id).maybeSingle())
    if (!row) throw fail(SERVICE_ERROR.NOT_FOUND, 'That task could not be found.')
    return occurrenceFromRow(row)
  }

  async function fetchOccurrencesOn(client, planDate) {
    const rows = await fetchAll((a, b) =>
      client.from(T.occurrences).select(OCCURRENCE_COLUMNS).eq('plan_date', planDate).order('created_at').order('id').range(a, b))
    return rows.map(occurrenceFromRow)
  }

  async function fetchTemplate(client, id) {
    const row = check(await client.from(T.templates).select(TEMPLATE_COLUMNS).eq('id', id).maybeSingle())
    if (!row) throw fail(SERVICE_ERROR.NOT_FOUND, 'That task could not be found.')
    return templateFromRow(row)
  }

  async function requireDay(client, planDate) {
    const day = await fetchDay(client, planDate)
    if (!day) throw fail(SERVICE_ERROR.NOT_FOUND, 'That day has not been planned yet.', { planDate })
    return day
  }

  // Where moved tasks went and came from, so a day can say "Moved to Wed 11 Mar". Read-only; the
  // link itself (rescheduled_from_id) is the audit trail.
  async function fetchMoves(client, occurrences) {
    const moves = {}
    const entry = (id) => (moves[id] ??= { movedTo: null, movedFrom: null })
    const movedAway = occurrences.filter((o) => o.planState === PLAN_STATES.EXCLUDED && o.excludedReason === EXCLUDED_REASONS.RESCHEDULED).map((o) => o.id)
    if (movedAway.length > 0) {
      const rows = check(await client.from(T.occurrences).select('id, rescheduled_from_id, plan_date').in('rescheduled_from_id', movedAway)) ?? []
      for (const row of rows) entry(row.rescheduled_from_id).movedTo = row.plan_date
    }
    const arrived = occurrences.filter((o) => o.rescheduledFromId)
    if (arrived.length > 0) {
      const rows = check(await client.from(T.occurrences).select('id, plan_date').in('id', arrived.map((o) => o.rescheduledFromId))) ?? []
      const dates = new Map(rows.map((r) => [r.id, r.plan_date]))
      for (const o of arrived) if (dates.has(o.rescheduledFromId)) entry(o.id).movedFrom = dates.get(o.rescheduledFromId)
    }
    return moves
  }

  async function readPlan(client, planDate, { today, config }) {
    const day = await fetchDay(client, planDate)
    const occurrences = sortOccurrencesForDisplay(day ? await fetchOccurrencesOn(client, planDate) : [])
    return {
      planDate,
      exists: day !== null,
      day,
      occurrences,
      moves: await fetchMoves(client, occurrences),
      summary: day ? summarizeDay({ day, occurrences }) : null,
      access: classifyDate(planDate, today, config), // 'read_only_past' | 'editable_past' | 'today' | 'future' | 'beyond_plan_ahead'
    }
  }

  // ---- shared write helpers ---------------------------------------------------

  async function ensureDay(client, userId, planDate) {
    const existing = await fetchDay(client, planDate)
    if (existing) return existing
    const response = await client.from(T.days).insert(dayInsertRow(userId, planDate)).select(DAY_COLUMNS)
    if (response.error) {
      if (response.error.code === '23505') {
        const raced = await fetchDay(client, planDate) // another tab created it first
        if (raced) return raced
      }
      throw toServiceError(response.error)
    }
    return dayFromRow(response.data[0])
  }

  async function writeOccurrence(client, id, row) {
    const rows = check(await client.from(T.occurrences).update(row).eq('id', id).select(OCCURRENCE_COLUMNS))
    if (!rows || rows.length !== 1) {
      throw fail(SERVICE_ERROR.NOT_FOUND, 'That task could not be updated. It may have been removed, or it belongs to your read-only history.', { reason: 'no_rows_affected' })
    }
    return occurrenceFromRow(rows[0])
  }

  async function writeDay(client, planDate, row) {
    const rows = check(await client.from(T.days).update(row).eq('plan_date', planDate).select(DAY_COLUMNS))
    if (!rows || rows.length !== 1) {
      throw fail(SERVICE_ERROR.NOT_FOUND, 'That day could not be updated. It may belong to your read-only history.', { reason: 'no_rows_affected' })
    }
    return dayFromRow(rows[0])
  }

  async function deleteOccurrence(client, id) {
    const rows = check(await client.from(T.occurrences).delete().eq('id', id).select('id'))
    if (!rows || rows.length !== 1) {
      // The pure planner said a delete was allowed but the database refused or found nothing.
      throw fail(SERVICE_ERROR.CONFLICT, 'That task could not be deleted. Set it aside instead.', { reason: 'delete_refused' })
    }
  }

  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x))

  // Applies the outcome of planRemoval. A delete updates the suppression list first so the
  // task cannot be recreated if the delete then fails (the list is put back on failure).
  async function applyRemoval(client, removal, dayBefore) {
    if (removal.action === 'exclude') return { occurrence: await writeOccurrence(client, removal.occurrence.id, occurrenceStateRow(removal.occurrence)) }
    const changed = !sameSet(removal.day.suppressedTemplateIds, dayBefore.suppressedTemplateIds)
    if (changed) await writeDay(client, dayBefore.planDate, { suppressed_template_ids: removal.day.suppressedTemplateIds })
    try {
      await deleteOccurrence(client, removal.occurrenceId)
    } catch (error) {
      if (changed) {
        try {
          await writeDay(client, dayBefore.planDate, { suppressed_template_ids: dayBefore.suppressedTemplateIds })
        } catch {
          throw new PlannerServiceError(SERVICE_ERROR.UNKNOWN, 'The task could not be deleted and the day could not be tidied up. Please refresh.', { details: { partial: 'suppression_updated' }, cause: error })
        }
      }
      throw error
    }
    return { deleted: removal.occurrenceId }
  }

  // ---- public operations ---------------------------------------------------------
  const ops = {
    // The user's current local date in their profile timezone.
    async getToday() {
      const { today, ctx } = await session()
      return { today, timeZone: ctx.timeZone }
    },

    // Read-only: never creates anything. Works for read-only history too.
    async getDayPlan(planDate) {
      parseDate(planDate)
      const { client, today, config } = await session()
      return readPlan(client, planDate, { today, config })
    },

    // Creates the day if needed and tops up occurrences from templates (idempotent). Days older
    // than the 7-date window can never be created (D5).
    async openDay(planDate) {
      const { client, userId, ctx, today, config } = await session()
      assertEditableDate(planDate, today, config)
      let day = await ensureDay(client, userId, planDate)
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const occurrences = await fetchOccurrencesOn(client, planDate)
        const templateRows = await fetchAll((a, b) =>
          client.from(T.templates).select(TEMPLATE_COLUMNS).lte('starts_on', planDate).order('created_at').order('id').range(a, b))
        const drafts = occurrencesToCreate({ templates: templateRows.map(templateFromRow), occurrences, day, planDate }, ctx)
        if (drafts.length === 0) break
        const response = await client.from(T.occurrences).insert(drafts.map((d) => occurrenceInsertRow(userId, d))).select('id')
        if (!response.error) break
        // Duplicate prevention: another tab created some of them first. Re-read once and retry.
        if (response.error.code === '23505' && attempt === 0) {
          day = (await fetchDay(client, planDate)) ?? day
          continue
        }
        throw toServiceError(response.error)
      }
      return readPlan(client, planDate, { today, config })
    },

    async listTemplates({ includeArchived = false } = {}) {
      const { client } = await session()
      const rows = await fetchAll((a, b) => {
        let q = client.from(T.templates).select(TEMPLATE_COLUMNS)
        if (!includeArchived) q = q.is('archived_at', null)
        return q.order('created_at').order('id').range(a, b)
      })
      return rows.map(templateFromRow)
    },

    async createTemplate(input) {
      const { client, userId, today, config } = await session()
      const validated = validateTemplateInput(input, { today, config })
      if (!validated.ok) throw fail(SERVICE_ERROR.VALIDATION, 'Please check the highlighted details.', { fields: validated.errors })
      const rows = check(await client.from(T.templates).insert(templateInsertRow(userId, validated.value)).select(TEMPLATE_COLUMNS))
      return templateFromRow(rows[0])
    },

    // A custom task for one date is a one-time template plus its occurrence.
    async createTask(planDate, input) {
      const { today, config } = await session()
      assertEditableDate(planDate, today, config)
      const template = await ops.createTemplate({ ...(input ?? {}), recurrence: RECURRENCE.ONCE, weekdays: null, startsOn: planDate, endsOn: planDate })
      try {
        const plan = await ops.openDay(planDate)
        return { template, plan }
      } catch (error) {
        throw new PlannerServiceError(error.code ?? SERVICE_ERROR.UNKNOWN, error.message, { details: { ...error.details, partial: 'template_created', templateId: template.id }, cause: error })
      }
    },

    // Edits a template. Only today-and-future, pending, active, non-customised occurrences are
    // updated; past days and anything with progress are never rewritten (spec 6.4).
    async updateTemplate(templateId, changes) {
      assertId(templateId, 'templateId')
      const { client, ctx, today } = await session()
      const template = await fetchTemplate(client, templateId)
      const rows = await fetchAll((a, b) =>
        client.from(T.occurrences).select(OCCURRENCE_COLUMNS).eq('template_id', templateId).gte('plan_date', today).order('plan_date').order('id').range(a, b))
      let plan
      try {
        plan = planTemplateEdit({ template, changes: changes ?? {}, occurrences: rows.map(occurrenceFromRow) }, ctx)
      } catch (error) {
        // Same shape as createTemplate / updateOccurrence: a friendly message plus per-field messages.
        if (error instanceof PlannerError && error.code === ERR.INVALID_TEMPLATE) throw fail(SERVICE_ERROR.VALIDATION, 'Please check the highlighted details.', { fields: error.details?.errors ?? {} })
        throw error
      }
      const updated = check(await client.from(T.templates).update(templateUpdateRow(plan.template)).eq('id', templateId).select(TEMPLATE_COLUMNS))
      if (!updated || updated.length !== 1) throw fail(SERVICE_ERROR.NOT_FOUND, 'That task could not be updated.', { reason: 'no_rows_affected' })
      const applied = []
      for (const u of plan.updates) {
        try {
          await writeOccurrence(client, u.id, occurrenceDiffRow(u.changes))
          applied.push(u.id)
        } catch (error) {
          throw new PlannerServiceError(error.code ?? SERVICE_ERROR.UNKNOWN, 'The task was updated but some upcoming days could not be refreshed. Please try again.', { details: { partial: 'template_updated', appliedOccurrenceIds: applied, failedOccurrenceId: u.id }, cause: error })
        }
      }
      return { template: templateFromRow(updated[0]), updatedOccurrenceIds: applied, skipped: plan.skipped, noLongerMatching: plan.noLongerMatching }
    },

    // Archive keeps all history and stops future days (ends today). A template that has not
    // started yet has nothing to keep: delete it instead.
    async archiveTemplate(templateId) {
      assertId(templateId, 'templateId')
      const { client, ctx, today } = await session()
      const template = await fetchTemplate(client, templateId)
      if (template.archivedAt) throw fail(SERVICE_ERROR.CONFLICT, 'That task is already archived.')
      if (compareDates(template.startsOn, today) > 0) throw fail(SERVICE_ERROR.VALIDATION, 'That task has not started yet. Delete it instead.')
      const endsOn = template.endsOn && compareDates(template.endsOn, today) < 0 ? template.endsOn : today
      const rows = check(await client.from(T.templates).update({ archived_at: new Date(resolveContext(ctx).nowMs).toISOString(), ends_on: endsOn }).eq('id', templateId).select(TEMPLATE_COLUMNS))
      if (!rows || rows.length !== 1) throw fail(SERVICE_ERROR.NOT_FOUND, 'That task could not be updated.', { reason: 'no_rows_affected' })
      return templateFromRow(rows[0])
    },

    // Permanent delete (spec 6.4): untouched upcoming occurrences are removed by the normal
    // removal rules; anything with progress or already set aside keeps its history (the
    // database clears only its template link).
    async deleteTemplate(templateId) {
      assertId(templateId, 'templateId')
      const { client, ctx, today, config } = await session()
      await fetchTemplate(client, templateId)
      const latest = editableRange(today, config).latest
      const rows = await fetchAll((a, b) =>
        client.from(T.occurrences).select(OCCURRENCE_COLUMNS).eq('template_id', templateId).gte('plan_date', today).lte('plan_date', latest).order('plan_date').order('id').range(a, b))
      const pending = rows.map(occurrenceFromRow).filter((o) => o.completion === 0 && o.planState === PLAN_STATES.ACTIVE)
      const days = new Map()
      let removed = 0
      for (const occurrence of pending) {
        if (!days.has(occurrence.planDate)) days.set(occurrence.planDate, await requireDay(client, occurrence.planDate))
        const day = days.get(occurrence.planDate)
        const removal = planRemoval({ occurrence, day }, ctx)
        // The template is going away, so its suppression entry would only be cleaned up again.
        if (removal.action === 'delete') await deleteOccurrence(client, removal.occurrenceId)
        else await writeOccurrence(client, removal.occurrence.id, occurrenceStateRow(removal.occurrence))
        removed += 1
      }
      const deleted = check(await client.from(T.templates).delete().eq('id', templateId).select('id'))
      if (!deleted || deleted.length !== 1) throw fail(SERVICE_ERROR.NOT_FOUND, 'That task could not be deleted.', { reason: 'no_rows_affected' })
      return { removedUpcoming: removed, keptWithHistory: rows.length - removed }
    },

    async updateOccurrence(occurrenceId, changes) {
      assertId(occurrenceId, 'occurrenceId')
      const { client, today, config } = await session()
      const occurrence = await fetchOccurrence(client, occurrenceId)
      assertEditableDate(occurrence.planDate, today, config)
      const merged = {
        title: occurrence.title, description: occurrence.description, category: occurrence.category,
        isPriority: occurrence.isPriority, plannedStart: occurrence.plannedStart, plannedEnd: occurrence.plannedEnd,
        estimatedMinutes: occurrence.estimatedMinutes, ...(changes ?? {}),
        recurrence: RECURRENCE.ONCE, weekdays: null, startsOn: occurrence.planDate, endsOn: occurrence.planDate,
      }
      const checked = validateTemplateInput(merged, { config })
      if (!checked.ok) throw fail(SERVICE_ERROR.VALIDATION, 'Please check the highlighted details.', { fields: checked.errors })
      return writeOccurrence(client, occurrenceId, occurrenceDetailsRow(checked.value))
    },

    // value: 0 (undo), 0.5 (partial) or 1 (done). Raising progress on a set-aside task puts it back.
    async setCompletion(occurrenceId, value) {
      assertId(occurrenceId, 'occurrenceId')
      const { client, ctx } = await session()
      const occurrence = await fetchOccurrence(client, occurrenceId)
      const day = await requireDay(client, occurrence.planDate)
      const result = setCompletionLogic({ occurrence, day, value }, ctx)
      if (!result.changed) return { occurrence, day, changed: false, restored: false }
      const saved = await writeOccurrence(client, occurrenceId, occurrenceStateRow(result.occurrence))
      // The server stamps the baseline; read it back rather than assuming.
      return { occurrence: saved, day: (await fetchDay(client, occurrence.planDate)) ?? day, changed: true, restored: result.restored }
    },

    undoCompletion(occurrenceId) {
      return ops.setCompletion(occurrenceId, 0)
    },

    async setAside(occurrenceId, reason) {
      assertId(occurrenceId, 'occurrenceId')
      const { client, ctx } = await session()
      const occurrence = await fetchOccurrence(client, occurrenceId)
      const day = await requireDay(client, occurrence.planDate)
      const result = setAsideLogic({ occurrence, day, reason }, ctx)
      const saved = await writeOccurrence(client, occurrenceId, occurrenceStateRow(result.occurrence))
      return { occurrence: saved, day: (await fetchDay(client, occurrence.planDate)) ?? day }
    },

    async restore(occurrenceId) {
      assertId(occurrenceId, 'occurrenceId')
      const { client, ctx } = await session()
      const occurrence = await fetchOccurrence(client, occurrenceId)
      const next = restoreLogic({ occurrence }, ctx)
      return writeOccurrence(client, occurrenceId, occurrenceStateRow(next))
    },

    // Delete a task from a day following the approved rules (C1): see planRemoval.
    async removeOccurrence(occurrenceId) {
      assertId(occurrenceId, 'occurrenceId')
      const { client, ctx } = await session()
      const occurrence = await fetchOccurrence(client, occurrenceId)
      const day = await requireDay(client, occurrence.planDate)
      const removal = planRemoval({ occurrence, day }, ctx)
      const outcome = await applyRemoval(client, removal, day)
      return { action: removal.action, ...outcome }
    },

    // Moves a task to another date without rewriting history: the target is created first and
    // linked back; the source is then set aside as 'rescheduled'. If the second step fails the
    // target is removed again so no duplicate is left behind.
    async rescheduleOccurrence(occurrenceId, targetDate, { plannedStart, plannedEnd } = {}) {
      assertId(occurrenceId, 'occurrenceId')
      parseDate(targetDate)
      const { client, userId, ctx } = await session()
      const occurrence = await fetchOccurrence(client, occurrenceId)
      const day = await requireDay(client, occurrence.planDate)
      const targetDayBefore = await fetchDay(client, targetDate)
      const occurrencesOnTarget = targetDayBefore ? await fetchOccurrencesOn(client, targetDate) : []
      const plan = rescheduleLogic({ occurrence, day, targetDate, targetDay: targetDayBefore, occurrencesOnTarget, plannedStart, plannedEnd }, ctx)

      if (plan.createsTargetDay) await ensureDay(client, userId, targetDate)
      const suppressionChanged = targetDayBefore && !sameSet(plan.targetDay.suppressedTemplateIds, targetDayBefore.suppressedTemplateIds)
      if (suppressionChanged) await writeDay(client, targetDate, { suppressed_template_ids: plan.targetDay.suppressedTemplateIds })

      const created = await client.from(T.occurrences).insert(occurrenceInsertRow(userId, plan.target)).select(OCCURRENCE_COLUMNS)
      if (created.error) throw toServiceError(created.error)
      const target = occurrenceFromRow(created.data[0])

      try {
        const source = await writeOccurrence(client, occurrenceId, occurrenceStateRow(plan.source))
        return { source, target, link: plan.link }
      } catch (error) {
        try {
          await deleteOccurrence(client, target.id)
        } catch {
          throw new PlannerServiceError(SERVICE_ERROR.UNKNOWN, 'The task could not be moved cleanly. A copy may exist on the new day; please refresh.', { details: { partial: 'target_created', targetId: target.id }, cause: error })
        }
        throw error
      }
    },

    // Undo a move: the target is removed by the normal removal rules and the source is restored.
    async undoReschedule(sourceOccurrenceId) {
      assertId(sourceOccurrenceId, 'occurrenceId')
      const { client, ctx } = await session()
      const source = await fetchOccurrence(client, sourceOccurrenceId)
      const targetRow = check(await client.from(T.occurrences).select(OCCURRENCE_COLUMNS).eq('rescheduled_from_id', sourceOccurrenceId).maybeSingle())
      if (!targetRow) {
        // The new copy no longer exists (it was deleted), so there is nothing to undo but the set-aside state.
        if (source.planState !== PLAN_STATES.EXCLUDED || source.excludedReason !== EXCLUDED_REASONS.RESCHEDULED) {
          throw fail(SERVICE_ERROR.CONFLICT, 'That task was not moved to another day.')
        }
        return { source: await writeOccurrence(client, sourceOccurrenceId, { completion: source.completion, plan_state: PLAN_STATES.ACTIVE, excluded_reason: null }), target: null }
      }
      const target = occurrenceFromRow(targetRow)
      const targetDay = await requireDay(client, target.planDate)
      const undo = planUndoReschedule({ source, target, targetDay }, ctx)
      const targetOutcome = await applyRemoval(client, undo.targetResult, targetDay)
      try {
        const restored = await writeOccurrence(client, sourceOccurrenceId, occurrenceStateRow(undo.source))
        return { source: restored, target: targetOutcome }
      } catch (error) {
        throw new PlannerServiceError(error.code ?? SERVICE_ERROR.UNKNOWN, 'The new copy was removed but the original could not be restored. Please refresh.', { details: { partial: 'target_removed' }, cause: error })
      }
    },

    // Day mode only changes the label; the database fixes the baseline. Creates the day if needed.
    async setDayMode(planDate, mode) {
      const { client, userId, ctx, today, config } = await session()
      assertEditableDate(planDate, today, config)
      const day = await ensureDay(client, userId, planDate)
      const next = setDayModeLogic({ day, mode }, ctx)
      if (next === day) return day
      return writeDay(client, planDate, { day_mode: next.dayMode })
    },

    // ---- history ---------------------------------------------------------------

    // Frozen read-only view of one day (original plan, current plan, set-aside, late additions).
    async getPlanSnapshot(planDate) {
      parseDate(planDate)
      const { client } = await session()
      const day = await fetchDay(client, planDate)
      if (!day) return null
      return buildPlanSnapshot({ day, occurrences: await fetchOccurrencesOn(client, planDate) })
    },

    // Snapshots for every recorded day in [from, to] (at most 62 days), oldest first.
    async listSnapshots({ from, to }) {
      if (!isValidDate(from) || !isValidDate(to)) throw fail(SERVICE_ERROR.VALIDATION, 'Choose a valid date range.')
      const span = diffDays(from, to)
      if (span < 0) throw fail(SERVICE_ERROR.VALIDATION, 'The end date cannot be before the start date.')
      if (span + 1 > MAX_SNAPSHOT_SPAN_DAYS) throw fail(SERVICE_ERROR.VALIDATION, `Choose a range of ${MAX_SNAPSHOT_SPAN_DAYS} days or fewer.`)
      const { client } = await session()
      const { days, occurrences } = await fetchRange(client, from, to)
      return days.map((day) => buildPlanSnapshot({ day, occurrences: occurrences.filter((o) => o.planDate === day.planDate) }))
    },

    // Monday-to-Sunday metrics for the week containing `weekOf` (default: today).
    async getWeekSummary({ weekOf } = {}) {
      if (weekOf !== undefined && !isValidDate(weekOf)) throw fail(SERVICE_ERROR.VALIDATION, 'Choose a valid date.')
      const { client, ctx, today, config } = await session()
      const dates = weekDates(weekOf ?? today, config.weekStartsOn)
      const { days, occurrences } = await fetchRange(client, dates[0], dates[6])
      return summarizeWeek({ weekOf, days: days.map((day) => ({ day, occurrences: occurrences.filter((o) => o.planDate === day.planDate) })) }, ctx)
    },
  }

  async function fetchRange(client, from, to) {
    const dayRows = await fetchAll((a, b) =>
      client.from(T.days).select(DAY_COLUMNS).gte('plan_date', from).lte('plan_date', to).order('plan_date').range(a, b))
    const occurrenceRows = await fetchAll((a, b) =>
      client.from(T.occurrences).select(OCCURRENCE_COLUMNS).gte('plan_date', from).lte('plan_date', to).order('plan_date').order('created_at').order('id').range(a, b))
    return { days: dayRows.map(dayFromRow), occurrences: occurrenceRows.map(occurrenceFromRow) }
  }

  // Every public method converts any failure into a PlannerServiceError.
  const service = {}
  for (const [name, fn] of Object.entries(ops)) {
    service[name] = async (...args) => {
      try {
        return await fn(...args)
      } catch (error) {
        throw toServiceError(error)
      }
    }
  }
  return Object.freeze(service)
}
