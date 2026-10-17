import { Box, Checkbox, FormControlLabel, TextField } from '@mui/material'

// The fields shared by adding and editing a task. `idPrefix` keeps labels unique on the page.
export default function TaskFields({ values, errors, onChange, idPrefix }) {
  const set = (name) => (e) => onChange({ ...values, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <>
      <TextField id={`${idPrefix}-title`} label="Task" value={values.title} onChange={set('title')} error={Boolean(errors.title)} helperText={errors.title} required />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField id={`${idPrefix}-start`} label="Start time (optional)" type="time" value={values.plannedStart} onChange={set('plannedStart')} error={Boolean(errors.plannedStart)} helperText={errors.plannedStart} slotProps={{ inputLabel: { shrink: true } }} />
        <TextField id={`${idPrefix}-minutes`} label="Estimate in minutes (optional)" type="number" value={values.estimatedMinutes} onChange={set('estimatedMinutes')} error={Boolean(errors.estimatedMinutes)} helperText={errors.estimatedMinutes} />
      </Box>
      <FormControlLabel control={<Checkbox checked={values.isPriority} onChange={set('isPriority')} />} label="Priority" />
    </>
  )
}
