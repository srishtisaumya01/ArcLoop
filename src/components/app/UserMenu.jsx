import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { Box, ButtonBase, Divider, ListItemIcon, Menu, MenuItem, Typography } from '@mui/material'
import { ChevronDown, LogOut, UserRound } from 'lucide-react'
import UserAvatar from './UserAvatar.jsx'
import { useAppShell } from '../../hooks/useAppShell.js'
import { useAuth } from '../../hooks/useAuth.js'
import { useI18n } from '../../hooks/useI18n.js'
import { ROUTES } from '../../constants/navigation.js'
import { colors, navFontFamily } from '../../theme/tokens.js'

// The account button at the top right: the person's picture and username. It opens two choices, Profile and Log out.
export default function UserMenu({ onDark = false }) {
  const { t } = useI18n()
  const { user, signOut } = useAuth()
  const { profile, displayName } = useAppShell()
  const navigate = useNavigate()
  const [anchor, setAnchor] = useState(null)
  const close = () => setAnchor(null)
  const username = profile?.username ?? user.username ?? displayName
  const textColor = onDark ? '#FFFFFF' : colors.textPrimary

  const logOut = async () => {
    close()
    try {
      await signOut()
    } catch {
      // The local session is cleared even if the server call fails.
    }
    navigate(ROUTES.home)
  }

  return (
    <>
      <ButtonBase
        aria-label={t('Account menu')}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls="user-menu"
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ gap: 1, pl: 0.5, pr: { xs: 0.5, sm: 1.25 }, py: 0.5, borderRadius: '999px', color: textColor, border: `1px solid ${onDark ? 'rgba(255,255,255,0.35)' : colors.border}`, bgcolor: onDark ? 'rgba(255,255,255,0.08)' : colors.surface, fontFamily: navFontFamily }}
      >
        <UserAvatar name={displayName} version={profile?.avatar_version} size={34} />
        <Typography component="span" sx={{ display: { xs: 'none', sm: 'inline' }, fontWeight: 600, fontSize: '0.95rem', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {username}
        </Typography>
        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
          <ChevronDown size={16} aria-hidden="true" />
        </Box>
      </ButtonBase>
      <Menu id="user-menu" anchorEl={anchor} open={Boolean(anchor)} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { mt: 1, minWidth: 220, borderRadius: '14px' } } }}>
        <Box sx={{ px: 2, py: 1.25 }}>
          <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{displayName}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{user.email}</Typography>
        </Box>
        <Divider />
        <MenuItem component={RouterLink} to={ROUTES.profile} onClick={close} sx={{ py: 1.25 }}>
          <ListItemIcon><UserRound size={18} aria-hidden="true" /></ListItemIcon>
          {t('Profile')}
        </MenuItem>
        <MenuItem onClick={logOut} sx={{ py: 1.25 }}>
          <ListItemIcon><LogOut size={18} aria-hidden="true" /></ListItemIcon>
          {t('Log out')}
        </MenuItem>
      </Menu>
    </>
  )
}
