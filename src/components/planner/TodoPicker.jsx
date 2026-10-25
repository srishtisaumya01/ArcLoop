import { useEffect, useMemo, useState } from 'react'
import { Box, Button, Chip, TextField, Typography } from '@mui/material'
import { Check, ChevronDown, ChevronUp, History, Plus, X } from 'lucide-react'
import { POPULAR, TODO_COUNT, TODO_GROUPS } from '../../constants/todoSuggestions.js'
import { plannerService } from '../../services/planner/index.js'
import { addDays } from '../../utils/planner/index.js'
import { colors, radii } from '../../theme/tokens.js'

const norm = (s) => s.trim().toLowerCase()

// "Add To-Do": pick from ready-made ideas (or yesterday's to-dos, or type your own), then Save once. Picking only selects; nothing
// is added to the day until Save. The selection belongs to one day: it starts empty again on a new day.
//   existing: the titles already on this day         onSave(titles) -> Promise<{ ok, error }>
export default function TodoPicker({ date, existing, busy, onSave }) {
  const [selected, setSelected] = useState([])
  const [custom, setCustom] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [yesterday, setYesterday] = useState([])
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)

  // What was on the day before, offered again. Failures (outside the planner's range, offline) just mean no suggestions.
  useEffect(() => {
    let cancelled = false
    plannerService.getDayPlan(addDays(date, -1)).then(
      (plan) => !cancelled && setYesterday([...new Set((plan?.occurrences ?? []).filter((o) => o.planState === 'active').map((o) => o.title))]),
      () => !cancelled && setYesterday([]),
    )
    return () => {
      cancelled = true
    }
  }, [date])

  const taken = useMemo(() => new Set(existing.map(norm)), [existing])
  const picked = useMemo(() => new Set(selected.map(norm)), [selected])
  const toggle = (title) => setSelected((list) => (list.some((t) => norm(t) === norm(title)) ? list.filter((t) => norm(t) !== norm(title)) : [...list, title]))
  const available = (list) => list.filter((t) => !taken.has(norm(t)))

  const addCustom = (e) => {
    e.preventDefault()
    const title = custom.trim()
    if (!title) return
    if (!picked.has(norm(title)) && !taken.has(norm(title))) setSelected((list) => [...list, title])
    setCustom('')
  }
  const save = async () => {
    setSaving(true)
    setProblem('')
    const { ok, error } = await onSave(selected)
    setSaving(false)
    if (ok) setSelected([])
    else setProblem(error?.message ?? 'We couldn’t save those. Please try again.')
  }

  const chip = (title, tone = 'default') => {
    const on = picked.has(norm(title))
    return (
      <Chip key={title} label={title} clickable onClick={() => toggle(title)} aria-pressed={on} icon={on ? <Check size={14} aria-hidden="true" /> : undefined}
        color={on ? 'primary' : tone} variant={on ? 'filled' : 'outlined'} sx={{ maxWidth: '100%', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 }, height: 'auto', minHeight: 32 }} />
    )
  }
  const yesterdayLeft = available(yesterday)
  const groups = showAll ? TODO_GROUPS : [{ name: 'Popular', items: POPULAR }]

  return (
    <Box component="section" aria-label="Add To-Do" sx={{ display: 'grid', gap: 2 }}>
      <Typography variant="h3" component="h2">Add To-Do</Typography>

      <Box component="form" onSubmit={addCustom} noValidate sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField fullWidth size="small" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Write your own to-do…" slotProps={{ htmlInput: { 'aria-label': 'Your own to-do', maxLength: 120, enterKeyHint: 'done' } }} />
        <Button type="submit" variant="outlined" startIcon={<Plus size={16} aria-hidden="true" />} sx={{ flexShrink: 0, height: 40 }}>Add to list</Button>
      </Box>

      {yesterdayLeft.length > 0 && (
        <Box sx={{ display: 'grid', gap: 1 }}>
          <Typography sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}><History size={16} aria-hidden="true" />From yesterday</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{yesterdayLeft.map((t) => chip(t, 'secondary'))}</Box>
        </Box>
      )}

      <Box sx={{ display: 'grid', gap: 2 }}>
        {groups.map((g) => {
          const items = available(g.items)
          return items.length === 0 ? null : (
            <Box key={g.name} sx={{ display: 'grid', gap: 1 }}>
              <Typography sx={{ fontWeight: 700, color: colors.textSecondary }}>{g.name}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{items.map((t) => chip(t))}</Box>
            </Box>
          )
        })}
        <Box>
          <Button size="small" onClick={() => setShowAll((v) => !v)} endIcon={showAll ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}>
            {showAll ? 'Show fewer ideas' : `Show all ${TODO_COUNT} ideas`}
          </Button>
        </Box>
      </Box>

      <Box sx={{ position: 'sticky', bottom: 12, zIndex: 2, display: 'grid', gap: 1, p: 1.5, borderRadius: `${radii.md}px`, border: `1px solid ${colors.border}`, bgcolor: colors.surface, boxShadow: '0 8px 24px rgba(11, 27, 58, 0.12)' }}>
        {selected.length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }} aria-label="Selected to-dos" role="list">
            {selected.map((t) => <Chip key={t} role="listitem" size="small" label={t} onDelete={() => toggle(t)} deleteIcon={<X size={14} aria-label={`Remove ${t}`} />} />)}
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
          <Typography color="text.secondary">{selected.length === 0 ? 'Pick a few to-dos, then save.' : `${selected.length} selected`}</Typography>
          <Button variant="contained" disabled={selected.length === 0 || busy || saving} onClick={save}>{saving ? 'Saving…' : selected.length ? `Save ${selected.length} to-do${selected.length === 1 ? '' : 's'}` : 'Save'}</Button>
        </Box>
        {problem && <Typography role="alert" color="error" variant="body2">{problem}</Typography>}
      </Box>
    </Box>
  )
}
