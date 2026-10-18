import { Link as RouterLink } from 'react-router-dom'
import { Box, Button, Card, CardContent, Chip, Typography } from '@mui/material'
import { ArrowRight, Circle, CircleCheck, CircleDot, Plus, Star } from 'lucide-react'
import Reveal from '../ui/Reveal.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors } from '../../theme/tokens.js'

const MAX_SHOWN = 6

function TaskRow({ task }) {
  const { t } = useI18n()
  const done = task.completion === 1
  const partial = task.completion === 0.5
  const Icon = done ? CircleCheck : partial ? CircleDot : Circle
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderBottom: `1px solid ${colors.border}`, '&:last-of-type': { borderBottom: 'none' } }}>
      <Box sx={{ color: done ? colors.success : partial ? colors.blue600 : colors.textMuted, display: 'flex', flexShrink: 0 }}>
        <Icon size={22} aria-hidden="true" />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? colors.textMuted : colors.textPrimary, overflowWrap: 'anywhere' }}>{task.title}</Typography>
        {(task.plannedStart || partial) && (
          <Typography variant="body2" color="text.secondary">
            {[task.plannedStart, partial ? t('Partly done') : null].filter(Boolean).join(' · ')}
          </Typography>
        )}
      </Box>
      {task.isPriority && <Chip size="small" icon={<Star size={14} aria-hidden="true" />} label={t('Priority')} />}
    </Box>
  )
}

// Today's tasks, straight from the planner, with the state of each one.
export default function TodayCard({ today }) {
  const { t } = useI18n()
  const tasks = today?.tasks ?? []
  const shown = tasks.slice(0, MAX_SHOWN)
  return (
    <Reveal sx={{ height: '100%' }}>
      <Card sx={{ height: '100%' }}>
        <CardContent sx={{ p: { xs: 2.5, md: 3.5 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Typography variant="h4" component="h2">
              {t('Today’s plan')}
            </Typography>
            {today && today.count > 0 && <Chip size="small" label={t('{done} of {count} done', { done: today.done, count: today.count })} />}
          </Box>

          {today?.kind === 'rest' && <Typography color="text.secondary" sx={{ py: 3 }}>{t('Today is a rest day. Rest counts too.')}</Typography>}
          {today?.kind !== 'rest' && shown.length === 0 && (
            <Box sx={{ py: 3 }}>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                {t('Nothing is planned for today yet.')}
              </Typography>
              <Button component={RouterLink} to={ROUTES.day} variant="contained" color="primary" size="small" startIcon={<Plus size={16} aria-hidden="true" />}>
                {t('Add a task')}
              </Button>
            </Box>
          )}
          {shown.length > 0 && (
            <Box component="ul" aria-label={t('Today’s tasks')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {shown.map((task) => (
                <TaskRow key={task.id ?? task.title} task={task} />
              ))}
            </Box>
          )}
          {tasks.length > MAX_SHOWN && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t('and {count} more', { count: tasks.length - MAX_SHOWN })}
            </Typography>
          )}

          <Box sx={{ mt: 'auto', pt: 2 }}>
            <Button component={RouterLink} to={ROUTES.day} variant="outlined" color="primary" size="small" endIcon={<ArrowRight size={16} aria-hidden="true" />}>
              {t('Open My Day')}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Reveal>
  )
}
