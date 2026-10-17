import { Box, Checkbox, FormControlLabel, TextField } from '@mui/material'
import { PLANNER_CONFIG } from '../../utils/planner/index.js'

const { titleMax, descriptionMax, categoryMax } = PLANNER_CONFIG.limits

// The fields shared by adding and editing a task. `idPrefix` keeps labels unique on the page. Every
// field except the title is optional; the planner's own validation messages are shown per field.
export default function TaskFields({ values, errors, onChange, idPrefix }) {
  const set = (name) => (e) => onChange({ ...values, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const shrink = { inputLabel: { shrink: true } }
  return (
    <>
      <TextField id={`${idPrefix}-title`} label="Task" value={values.title} onChange={set('title')} error={Boolean(errors.title)} helperText={errors.title} required slotProps={{ htmlInput: { maxLength: titleMax } }} />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField id={`${idPrefix}-start`} label="Start time (optional)" type="time" value={values.plannedStart} onChange={set('plannedStart')} error={Boolean(errors.plannedStart)} helperText={errors.plannedStart} slotProps={shrink} />
        <TextField id={`${idPrefix}-end`} label="End time (optional)" type="time" value={values.plannedEnd} onChange={set('plannedEnd')} error={Boolean(errors.plannedEnd)} helperText={errors.plannedEnd} slotProps={shrink} />
      </Box>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField id={`${idPrefix}-minutes`} label="Estimate in minutes (optional)" type="number" value={values.estimatedMinutes} onChange={set('estimatedMinutes')} error={Boolean(errors.estimatedMinutes)} helperText={errors.estimatedMinutes} />
        <TextField id={`${idPrefix}-category`} label="Category (optional)" value={values.category} onChange={set('category')} error={Boolean(errors.category)} helperText={errors.category ?? 'For example Health, Work or Home.'} slotProps={{ htmlInput: { maxLength: categoryMax } }} />
      </Box>
      <TextField id={`${idPrefix}-description`} label="Description (optional)" value={values.description} onChange={set('description')} error={Boolean(errors.description)} helperText={errors.description} multiline minRows={2} slotProps={{ htmlInput: { maxLength: descriptionMax } }} />
      <FormControlLabel control={<Checkbox checked={values.isPriority} onChange={set('isPriority')} />} label="Priority" />
    </>
  )
}
