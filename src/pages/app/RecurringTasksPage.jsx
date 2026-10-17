import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Container, Skeleton, Typography } from '@mui/material'
import { Repeat, RefreshCw, TriangleAlert } from 'lucide-react'
import PageHeader from '../../components/common/PageHeader.jsx'
import StatePanel from '../../components/common/StatePanel.jsx'
import TemplateCard from '../../components/planner/TemplateCard.jsx'
import { editSummary } from '../../components/planner/templateSummary.js'
import { useRecurringTasks } from '../../hooks/useRecurringTasks.js'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { ROUTES } from '../../constants/navigation.js'
import { contentWidths } from '../../theme/tokens.js'

function Group({ title, status, templates, busy, run, notices, onSaved }) {
  if (templates.length === 0) return null
  return (
    <Box component="section" aria-label={title} sx={{ display: 'grid', gap: 1.5 }}>
      <Typography variant="h3" component="h2">{title}</Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'start' }}>
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            status={status}
            busy={busy}
            notice={notices[template.id]}
            onSave={async (t, changes) => {
              const outcome = await run((s) => s.updateTemplate(t.id, changes))
              if (outcome.ok) onSaved(t.id, editSummary(outcome.result))
              return outcome
            }}
            onEnd={(t) => run((s) => s.archiveTemplate(t.id))}
            onDelete={(t) => run((s) => s.deleteTemplate(t.id))}
          />
        ))}
      </Box>
    </Box>
  )
}

// Recurring Tasks: every repeating task in one place, with edit and end. Uses the planner's own
// template operations, so its rules (what an edit may change, what history is kept) are the planner's.
export default function RecurringTasksPage() {
  usePageMeta('Recurring tasks')
  const { status, data, error, busy, run, refresh } = useRecurringTasks()
  // What the last save of each task did, kept here so it survives a card moving between groups.
  const [notices, setNotices] = useState({})
  const onSaved = (id, text) => setNotices((current) => ({ ...current, [id]: text }))
  const groups = data?.groups
  const count = groups ? groups.active.length + groups.upcoming.length + groups.ended.length : 0

  return (
    <>
      <PageHeader eyebrow="Recurring tasks" title="Recurring tasks" description="The tasks that come back on their own. Changing or ending one never touches what you’ve already done." />
      <Container sx={{ maxWidth: `${contentWidths.page}px !important`, py: { xs: 4, md: 6 }, display: 'grid', gap: 4 }}>
        {status === 'loading' && (
          <Box aria-busy="true" aria-label="Loading recurring tasks" sx={{ display: 'grid', gap: 2 }}>
            <Skeleton variant="rounded" height={110} />
            <Skeleton variant="rounded" height={110} />
          </Box>
        )}
        {status === 'error' && !data && (
          <StatePanel tone="error" icon={TriangleAlert} title="We couldn’t load your recurring tasks" text={error?.code === 'VALIDATION' ? error.message : 'Something went wrong while loading. Your plans are safe. Please try again.'}
            action={<Button variant="contained" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={refresh}>Try again</Button>} />
        )}
        {status === 'error' && data && (
          <StatePanel tone="error" icon={TriangleAlert} title="We couldn’t refresh your recurring tasks" text="Showing what we loaded earlier."
            action={<Button variant="outlined" startIcon={<RefreshCw size={18} aria-hidden="true" />} onClick={refresh}>Try again</Button>} />
        )}
        {groups && count === 0 && (
          <StatePanel icon={Repeat} title="No recurring tasks yet" text="Add a task in My Day and choose how often it repeats. It will show up here."
            action={<Button component={RouterLink} to={ROUTES.day} variant="contained">Open My Day</Button>} />
        )}
        {groups && (
          <>
            <Group title="Active" status="active" templates={groups.active} busy={busy} run={run} notices={notices} onSaved={onSaved} />
            <Group title="Not started yet" status="upcoming" templates={groups.upcoming} busy={busy} run={run} notices={notices} onSaved={onSaved} />
            <Group title="Ended" status="ended" templates={groups.ended} busy={busy} run={run} notices={notices} onSaved={onSaved} />
          </>
        )}
      </Container>
    </>
  )
}
