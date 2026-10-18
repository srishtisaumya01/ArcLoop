import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, Radio, RadioGroup, TextField, Typography } from '@mui/material'
import { Plus, Trash2, User, Users } from 'lucide-react'
import FormError from '../auth/FormError.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { enrollInChallenge } from '../../services/myChallengesService.js'
import { addDaysIso, formatDate, todayIso } from '../../utils/appDates.js'
import { colors } from '../../theme/tokens.js'

const MAX_FRIENDS = 19
const blank = () => ({ username: '', email: '' })

// "Enroll": the person chooses to continue solo or start in a group. Solo needs only OK. A group asks how many friends,
// then a username and an email for each ("Add more" adds a row). The server does the rest.
export default function EnrollDialog({ challenge, open, onClose, onEnrolled }) {
  const { t, lang } = useI18n()
  const [mode, setMode] = useState('solo')
  const [friends, setFriends] = useState([blank()])
  const [state, setState] = useState({ busy: false, error: null, rows: {} })

  const start = challenge.start_date ?? todayIso()
  const end = challenge.end_date ?? addDaysIso(start, challenge.duration_days - 1)
  const setCount = (value) => {
    const n = Math.max(1, Math.min(MAX_FRIENDS, Number(value) || 1))
    setFriends((rows) => (n > rows.length ? [...rows, ...Array.from({ length: n - rows.length }, blank)] : rows.slice(0, n)))
  }
  const edit = (index, key) => (e) => setFriends((rows) => rows.map((r, i) => (i === index ? { ...r, [key]: e.target.value } : r)))
  const remove = (index) => setFriends((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows))
  const complete = mode === 'solo' || friends.every((f) => f.username.trim() && f.email.trim())

  const close = () => {
    if (!state.busy) onClose()
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!complete) return
    setState({ busy: true, error: null, rows: {} })
    try {
      const enrolled = await enrollInChallenge(challenge.slug, { mode, members: mode === 'group' ? friends.map((f) => ({ username: f.username.trim(), email: f.email.trim() })) : [] })
      setState({ busy: false, error: null, rows: {} })
      onEnrolled(enrolled)
    } catch (error) {
      setState({ busy: false, error: error.message, rows: error.members ?? {} })
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="enroll-title">
      <Box component="form" noValidate onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <DialogTitle id="enroll-title">{t('How do you want to start {title}?', { title: t(challenge.title) })}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          <Typography color="text.secondary">{t('It runs from {start} to {end}.', { start: formatDate(start, lang), end: formatDate(end, lang) })}</Typography>
          <RadioGroup aria-label={t('How do you want to start?')} value={mode} onChange={(e) => setMode(e.target.value)} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            {[
              ['solo', t('Continue solo'), t('Do it on your own, at your pace.'), User],
              ['group', t('Start in a group'), t('Do it with friends, on the same dates.'), Users],
            ].map(([value, label, hint, Icon]) => (
              <Box key={value} sx={{ border: `2px solid ${mode === value ? colors.blue600 : colors.border}`, borderRadius: '14px', px: 1.5, py: 1, bgcolor: mode === value ? colors.bgAlt : 'transparent' }}>
                <FormControlLabel value={value} control={<Radio />} sx={{ m: 0, alignItems: 'flex-start', width: 1 }} label={
                  <Box sx={{ pt: 0.75 }}>
                    <Typography sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 0.75 }}><Icon size={16} aria-hidden="true" />{label}</Typography>
                    <Typography variant="body2" color="text.secondary">{hint}</Typography>
                  </Box>
                } />
              </Box>
            ))}
          </RadioGroup>

          {mode === 'group' && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <TextField id="group-count" label={t('How many friends are joining you?')} type="number" value={friends.length} onChange={(e) => setCount(e.target.value)} slotProps={{ htmlInput: { min: 1, max: MAX_FRIENDS } }} helperText={t('{count} people in the group, you included.', { count: friends.length + 1 })} />
              {friends.map((friend, index) => (
                <Box key={index} role="group" aria-label={t('Friend {n}', { n: index + 1 })} sx={{ display: 'grid', gap: 1.5, p: 2, borderRadius: '14px', border: `1px solid ${colors.border}` }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography sx={{ fontWeight: 700 }}>{t('Friend {n}', { n: index + 1 })}</Typography>
                    {friends.length > 1 && (
                      <IconButton size="small" aria-label={t('Remove friend {n}', { n: index + 1 })} onClick={() => remove(index)}><Trash2 size={16} aria-hidden="true" /></IconButton>
                    )}
                  </Box>
                  <TextField label={t('Username of friend {n}', { n: index + 1 })} value={friend.username} onChange={edit(index, 'username')} autoComplete="off" slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }} error={Boolean(state.rows[index])} helperText={state.rows[index]} />
                  <TextField label={t('Email of friend {n}', { n: index + 1 })} type="email" value={friend.email} onChange={edit(index, 'email')} autoComplete="off" error={Boolean(state.rows[index])} />
                </Box>
              ))}
              {friends.length < MAX_FRIENDS && (
                <Box><Button variant="outlined" size="small" startIcon={<Plus size={16} aria-hidden="true" />} onClick={() => setFriends((rows) => [...rows, blank()])}>{t('Add more')}</Button></Box>
              )}
              <Typography variant="body2" color="text.secondary">{t('Friends without an account yet are added to this group on the same dates as soon as they sign up with that username or email.')}</Typography>
            </Box>
          )}
          <FormError message={state.error} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={state.busy}>{t('Cancel')}</Button>
          <Button type="submit" variant="contained" disabled={state.busy || !complete}>{state.busy ? t('Joining…') : mode === 'solo' ? t('OK, start challenge') : t('Start challenge with my group')}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
