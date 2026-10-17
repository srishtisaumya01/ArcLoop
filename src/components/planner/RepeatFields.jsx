import { Box, Checkbox, FormControlLabel, FormGroup, MenuItem, TextField, Typography } from '@mui/material'

const WEEKDAYS = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun'],
]

// "Repeats" choice plus the days of the week for selected-days tasks. `allowOnce` adds "Just this day"
// (used when adding a task to a day; a repeating task being edited cannot become a one-off).
export default function RepeatFields({ repeat, weekdays, onRepeat, onWeekdays, errors = {}, allowOnce = false }) {
  const toggleDay = (day) => onWeekdays(weekdays.includes(day) ? weekdays.filter((d) => d !== day) : [...weekdays, day])
  return (
    <>
      <TextField select label="Repeats" value={repeat} onChange={(e) => onRepeat(e.target.value)} error={Boolean(errors.recurrence)} helperText={errors.recurrence}>
        {allowOnce && <MenuItem value="once">Just this day</MenuItem>}
        <MenuItem value="daily">Every day</MenuItem>
        <MenuItem value="weekly">Selected days of the week</MenuItem>
      </TextField>
      {repeat === 'weekly' && (
        <Box role="group" aria-label="Days of the week">
          <FormGroup row>
            {WEEKDAYS.map(([day, label]) => (
              <FormControlLabel key={day} control={<Checkbox checked={weekdays.includes(day)} onChange={() => toggleDay(day)} />} label={label} />
            ))}
          </FormGroup>
          {errors.weekdays && <Typography variant="body2" color="error">{errors.weekdays}</Typography>}
        </Box>
      )}
    </>
  )
}
