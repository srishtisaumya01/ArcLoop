import { Link as RouterLink } from 'react-router-dom'
import { Alert, Button, Snackbar } from '@mui/material'
import { useReminderScheduler } from '../../hooks/useReminderScheduler.js'
import { ROUTES } from '../../constants/navigation.js'

// In-app delivery of reminders: one calm notice at a time, bottom of the screen. Mounted for signed-in
// users only. Browser notifications (if allowed) are sent by the scheduler alongside this.
export default function ReminderNotifier({ now, tickMs }) {
  const { notices, dismiss } = useReminderScheduler({ now, tickMs })
  const notice = notices[0]
  return (
    <Snackbar open={Boolean(notice)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} onClose={(_, reason) => reason !== 'clickaway' && notice && dismiss(notice.key)}>
      {notice ? (
        <Alert
          severity="info"
          variant="filled"
          icon={false}
          role="status"
          onClose={() => dismiss(notice.key)}
          action={
            <>
              <Button color="inherit" size="small" component={RouterLink} to={`${ROUTES.day}?date=${notice.planDate}`} onClick={() => dismiss(notice.key)}>
                Open My Day
              </Button>
              <Button color="inherit" size="small" onClick={() => dismiss(notice.key)}>
                Dismiss
              </Button>
            </>
          }
        >
          <strong>{notice.title}</strong>
          <br />
          {notice.body}
        </Alert>
      ) : (
        <span />
      )}
    </Snackbar>
  )
}
