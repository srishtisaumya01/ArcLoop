import { useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'
import { Download } from 'lucide-react'
import BadgeHex from './BadgeHex.jsx'
import FormError from '../auth/FormError.jsx'
import { useI18n } from '../../hooks/useI18n.js'
import { badgeCardBlob } from '../../utils/badgeCard.js'
import { formatDate } from '../../utils/appDates.js'
import logoLight from '../../assets/arcloop-logo-light.png'

const loadLogo = () =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null) // the card is still made, just without the logo
    img.src = logoLight
  })

// One earned badge, large, with a button that saves it as a picture to post or keep.
export default function BadgeDialog({ badge, username, open, onClose }) {
  const { t, lang } = useI18n()
  const [state, setState] = useState({ busy: false, error: null })
  const download = async () => {
    setState({ busy: true, error: null })
    try {
      const blob = await badgeCardBlob({ days: badge.days, title: t(badge.title), username, earnedOn: formatDate(badge.earned_on, lang), logo: await loadLogo() })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `arcloop-${badge.days}-day-badge.png`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      setState({ busy: false, error: null })
    } catch (error) {
      setState({ busy: false, error: error.message })
    }
  }
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="badge-title">
      <DialogTitle id="badge-title" sx={{ textAlign: 'center' }}>{t('{title} badge', { title: t(badge.title) })}</DialogTitle>
      <DialogContent sx={{ display: 'grid', justifyItems: 'center', gap: 1.5, textAlign: 'center' }}>
        <BadgeHex days={badge.days} size={180} />
        <Typography sx={{ fontWeight: 700 }}>{t('You kept a {count}-day streak!', { count: badge.days })}</Typography>
        <Typography color="text.secondary">{t('Earned on {date}', { date: formatDate(badge.earned_on, lang) })}</Typography>
        <FormError message={state.error} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Button onClick={onClose}>{t('Close')}</Button>
        <Button variant="contained" startIcon={<Download size={16} aria-hidden="true" />} onClick={download} disabled={state.busy}>{state.busy ? t('Preparing…') : t('Download picture')}</Button>
      </DialogActions>
    </Dialog>
  )
}
