import { useState } from 'react'
import { Link as RouterLink, useSearchParams } from 'react-router-dom'
import { Box, Button, Chip, Container, LinearProgress, Skeleton, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material'
import { CalendarCheck, ChevronLeft, ChevronRight, RefreshCw, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import TaskRow from '../../components/planner/TaskRow.jsx'
import AddTaskForm from '../../components/planner/AddTaskForm.jsx'
import { formatDay, weekdayName } from '../../components/planner/weekFormat.js'
import { useDayPlan } from '../../hooks/useDayPlan.js'
import { useDayReminders } from '../../hooks/useDayReminders.js'
import { useDismissible } from '../../hooks/useDismissible.js'
import { useRecoveryStatus } from '../../hooks/useRecoveryStatus.js'
import DayModePanel from '../../components/planner/DayModePanel.jsx'
import MinimumDayPanel from '../../components/planner/MinimumDayPanel.jsx'
import GentleNote from '../../components/planner/GentleNote.jsx'
import { WELCOME_BACK } from '../../constants/recoveryCopy.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { ROUTES } from '../../constants/navigation.js'
import { PLANNER_CONFIG, addDays, diffDays, isValidDate, startOfWeek } from '../../utils/planner/index.js'
import { colors, contentWidths } from '../../theme/tokens.js'

const MODES = [
  { value: 'normal', label: 'Normal' },
  { value: 'busy', label: 'Busy' },
  { value: 'rest', label: 'Rest day' },
]

const ACCESS_NOTE = {
  read_only_past: 'This day is past the editing window, so it is shown as a record only.',
  future: 'This day has not arrived yet. You can plan it; progress can be recorded once it begins.',
  beyond_plan_ahead: 'This day is further ahead than the planner holds.',
}

// The repeating tasks a day does not hold yet, exactly as opening it would add them.
function ExpectedTasks({ tasks }) {
  return (
    <Box component="ul" aria-label="Repeating tasks to add" sx={{ m: 0, pl: 3, textAlign: 'left', color: colors.textSecondary }}>
      {tasks.map((t) => (
        <li key={t.id}>
          {t.title}
          {t.isPriority ? ' (priority)' : ''}
          {t.plannedStart ? ` · ${t.plannedStart}` : ''}
        </li>
      ))}
    </Box>
  )
}

// My Day: one day's plan from the planner service. Today by default, or ?date=YYYY-MM-DD.
export default function MyDayPage() {
  usePageMeta('My Day')
  const [params, setParams] = useSearchParams()
  const dateParam = params.get('date')
  const date = dateParam && isValidDate(dateParam) ? dateParam : undefined
  const { status, data: plan, error, busy, run, refresh } = useDayPlan(date)
  const [actionError, setActionError] = useState('')

  const perform = async (change, options) => {
    setActionError('')
    const outcome = await run(change, options)
    if (!outcome.ok) setActionError(outcome.error?.message ?? 'That didn’t save. Please try again.')
    return outcome
  }

  // One-off tasks belong to this day; repeating ones become a template starting on this day.
  const addTask = ({ recurrence, weekdays, ...input }) =>
    run((s) => (recurrence === 'once' ? s.createTask(target, input) : s.createTemplate({ ...input, recurrence, weekdays, startsOn: target })), { open: true })

  const goTo = (target) => setParams(target ? { date: target } : {})
  const access = plan?.access
  const canEdit = access === 'today' || access === 'editable_past' || access === 'future'
  const canRecord = access === 'today' || access === 'editable_past'
  const target = plan?.planDate
  const canRemind = (access === 'today' || access === 'future') && Boolean(plan?.exists)
  const reminders = useDayReminders(target, plan, canRemind)
  // Shown only on today, only when the last planned day had no progress, and only until dismissed.
  const returning = useRecoveryStatus(plan, access === 'today')
  const [welcomeDismissed, dismissWelcome] = useDismissible(`welcomeBack:${plan?.today ?? 'none'}`)
  const active = plan?.occurrences.filter((o) => o.planState === 'active') ?? []
  const setAside = plan?.occurrences.filter((o) => o.planState === 'excluded') ?? []
  const summary = plan?.summary
  const mode = plan?.day?.dayMode ?? 'normal'

  return (
    <>
      <PageHeader eyebrow="My Day" title={target ? `${weekdayName(target)}, ${formatDay(target)}` : 'My Day'} description="Check things off as you go. Partly done counts, and a missed day is just a day. Progress, not perfection.">
        <Button component={RouterLink} to={target ? `${ROUTES.week}?week=${startOfWeek(target)}&day=${target}` : ROUTES.week} variant="outlined" size="small">
          Back to your week
        </Button>
      </PageHeader>
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 4 }}>
        {status === 'loading' && (
          <Box aria-busy="true" aria-label="Loading your day" sx={{ display: 'grid', gap: 2 }}>
            <Skeleton variant="rounded" height={48} />
            <Skeleton variant="rounded" height={80} />
            <Skeleton variant="rounded" height={120} />
          </Box>
        )}
        {status === 'error' && !plan && (
          <StatePanel
            tone="error"
            icon={TriangleAlert}
            title="We couldn’t load this day"
            text={error?.code === 'VALIDATION' ? error.message : 'Something went wrong while loading. Your plans are safe. Please try again.'}
            action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={refresh}>Try again</Button>}
          />
        )}
        {plan && (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
              <Button size="small" startIcon={<ChevronLeft size={18} aria-hidden="true" />} onClick={() => goTo(addDays(target, -1))}>Previous day</Button>
              <Button size="small" endIcon={<ChevronRight size={18} aria-hidden="true" />} disabled={diffDays(plan.today, addDays(target, 1)) > PLANNER_CONFIG.planAheadDays} onClick={() => goTo(addDays(target, 1))}>Next day</Button>
              {target === plan.today ? <Chip label="Today" color="primary" size="small" /> : <Button size="small" variant="outlined" onClick={() => goTo(null)}>Back to today</Button>}
            </Box>
            {status === 'error' && (
              <StatePanel tone="error" icon={TriangleAlert} title="We couldn’t refresh this day" text="Showing what we loaded earlier."
                action={<Button variant="outlined" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={refresh}>Try again</Button>} />
            )}
            {ACCESS_NOTE[access] && <Typography color="text.secondary">{ACCESS_NOTE[access]}</Typography>}
            {actionError && <Typography role="alert" color="error">{actionError}</Typography>}
            {returning && !welcomeDismissed && <GentleNote label="Welcome back" {...WELCOME_BACK} onDismiss={dismissWelcome} />}

            {summary && (
              <Box component="section" aria-label="Day progress" sx={{ display: 'grid', gap: 1 }}>
                <Typography variant="h3" component="h2">
                  {summary.kind === 'rest' ? 'Rest day' : summary.kind === 'empty' ? 'Nothing planned' : `${summary.current.percent}% of today’s plan`}
                </Typography>
                {summary.current.count > 0 && (
                  <>
                    <LinearProgress variant="determinate" value={summary.current.percent} aria-label="Day progress" sx={{ height: 8, borderRadius: 4 }} />
                    <Typography variant="body2" color="text.secondary">
                      {summary.current.done} of {summary.current.count} done{summary.current.partial ? `, ${summary.current.partial} partly done` : ''}. Done counts as 1, partly done as half.
                    </Typography>
                  </>
                )}
                {summary.revised && summary.original && summary.original.count > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    The plan changed during the day. Against the original plan: {summary.original.percent}%.
                  </Typography>
                )}
              </Box>
            )}

            <Box component="section" aria-label="Day type" sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
              <Typography component="h2" variant="h4">Day type</Typography>
              <ToggleButtonGroup exclusive size="small" value={mode} disabled={!canEdit || busy} aria-label="Day type"
                onChange={(_, value) => value && perform((s) => s.setDayMode(target, value), { open: true })}>
                {MODES.map((m) => <ToggleButton key={m.value} value={m.value}>{m.label}</ToggleButton>)}
              </ToggleButtonGroup>
            </Box>

            {mode !== 'normal' && plan.exists && (
              <DayModePanel planDate={target} mode={mode} occurrences={plan.occurrences} busy={busy} canEdit={canEdit}
                onApply={(ids, reason) => perform(async (s) => { for (const id of ids) await s.setAside(id, reason) })} />
            )}

            {plan.exists && plan.minimum && (
              <MinimumDayPanel occurrences={plan.occurrences} minimum={plan.minimum} canEdit={canEdit} isToday={access === 'today'} busy={busy}
                onSave={(ids) => run((s) => s.setMinimum(target, ids))} />
            )}

            <Box component="section" aria-label="Tasks">
              {!plan.exists && canEdit && (
                <StatePanel icon={CalendarCheck} title="Nothing planned for this day yet"
                  text={plan.expected.length > 0 ? 'Starting this day adds the repeating tasks listed below, or add a task of your own.' : 'No repeating tasks fall on this day. Start it anyway, or add a task below.'}
                  action={
                    <Box sx={{ display: 'grid', gap: 1.5, justifyItems: 'center' }}>
                      {plan.expected.length > 0 && <ExpectedTasks tasks={plan.expected} />}
                      <Button variant="contained" disabled={busy} onClick={() => perform(async () => {}, { open: true })}>Start this day</Button>
                    </Box>
                  } />
              )}
              {!plan.exists && !canEdit && <StatePanel icon={CalendarCheck} title="No plan was recorded" text="Nothing was planned on this day." />}
              {plan.exists && active.length === 0 && setAside.length === 0 && (
                <StatePanel icon={CalendarCheck} title="No tasks on this day" text={canEdit ? 'Add a task below, or enjoy the open day.' : 'There were no tasks on this day.'} />
              )}
              {active.length > 0 && (
                <Box component="ul" aria-label="Today’s tasks" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
                  {active.map((task) => (
                    <TaskRow key={task.id} task={task} canRecord={canRecord} canEdit={canEdit} busy={busy}
                      onCompletion={(t, value) => perform((s) => s.setCompletion(t.id, value))}
                      onSetAside={(t) => perform((s) => s.setAside(t.id, mode === 'rest' ? 'rest_day' : 'busy_day'))}
                      onRestore={(t) => perform((s) => s.restore(t.id))}
                      move={plan.moves?.[task.id]}
                      onMove={(t, date) => run((s) => s.rescheduleOccurrence(t.id, date))}
                      onEdit={(t, input) => run((s) => s.updateOccurrence(t.id, input))}
                      onRemove={(t) => perform((s) => s.removeOccurrence(t.id))}
                      onStopRepeating={(t) => perform((s) => s.archiveTemplate(t.templateId))}
                      canRemind={canRemind} reminder={reminders.byOccurrence.get(task.id)} remindersOn={reminders.remindersOn}
                      onSetReminder={(t, time) => reminders.set(t.id, time)} onRemoveReminder={(t) => reminders.remove(t.id)} />
                  ))}
                </Box>
              )}
              {setAside.length > 0 && (
                <Box sx={{ mt: 3 }}>
                  <Typography variant="h4" component="h2" sx={{ mb: 1, color: colors.textSecondary }}>Set aside or moved</Typography>
                  <Box component="ul" aria-label="Set aside tasks" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
                    {setAside.map((task) => (
                      <TaskRow key={task.id} task={task} canRecord={false} canEdit={canEdit} busy={busy} move={plan.moves?.[task.id]} onRestore={(t) => perform((s) => s.restore(t.id))} onUndoMove={(t) => perform((s) => s.undoReschedule(t.id))} />
                    ))}
                  </Box>
                </Box>
              )}
              {/* A future day can already exist (for example, a task was moved to it) without its repeating tasks, which are
                  added when the day arrives or by this explicit action. Today and the editable past are topped up whenever
                  My Day opens them (lazy materialisation, spec D10), so nothing is ever missing there. The list is the exact
                  set the action adds: both come from the same rule. */}
              {plan.exists && access === 'future' && plan.expected.length > 0 && (
                <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
                  <Typography variant="body2" color="text.secondary">Repeating tasks for this day that aren’t on it yet. They are added when the day arrives, or now if you prefer.</Typography>
                  <ExpectedTasks tasks={plan.expected} />
                  <Box>
                    <Button size="small" variant="outlined" disabled={busy} onClick={() => perform(async () => {}, { open: true })}>Add my repeating tasks</Button>
                  </Box>
                </Box>
              )}
            </Box>

            {canEdit && <AddTaskForm busy={busy} onAdd={addTask} />}
          </>
        )}
      </Container>
    </>
  )
}
