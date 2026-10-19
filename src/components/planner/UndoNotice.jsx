import { Alert, Button, Snackbar } from '@mui/material'
import { bottomNavClearance } from '../../theme/tokens.js'

// How long the Undo notice stays: 8 seconds. Hovering it, or moving keyboard focus into it, holds it open; once the pointer or
// focus leaves it stays another 8 seconds.
export const UNDO_NOTICE_MS = 8000

// One calm notice at the bottom of the screen after a change that can be undone ("“Walk” marked done. Undo"). Only the latest
// change is offered. The notice never claims success it has not seen: the page closes it when the server has confirmed the
// undo, and a failed undo shows its message here, keeps the button for another try, and leaves the notice open.
//   notice: { key, message, undoLabel } | null    busy: an undo is in flight    error: text of a failed undo
export default function UndoNotice({ notice, busy, error, onUndo, onDismiss }) {
  return (
    <Snackbar
      key={notice?.key}
      open={Boolean(notice)}
      autoHideDuration={UNDO_NOTICE_MS}
      resumeHideDuration={UNDO_NOTICE_MS}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      sx={{ bottom: { xs: `calc(${bottomNavClearance} + 8px) !important`, md: undefined } }} // clear of the phone tab bar
      onClose={(_, reason) => {
        if (reason === 'clickaway' || busy || error) return // nothing closes it mid-request, or while a failure is being read
        onDismiss()
      }}
    >
      {notice ? (
        <Alert
          severity={error ? 'error' : 'info'}
          variant="filled"
          icon={false}
          role={error ? 'alert' : 'status'}
          action={
            <Button color="inherit" size="small" disabled={busy} onClick={onUndo} aria-label={error ? undefined : notice.undoLabel}>
              {error ? 'Try again' : 'Undo'}
            </Button>
          }
        >
          {error || notice.message}
        </Alert>
      ) : (
        <span />
      )}
    </Snackbar>
  )
}
