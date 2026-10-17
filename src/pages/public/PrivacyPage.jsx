import LegalDocument from '../../components/common/LegalDocument.jsx'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { PRIVACY_DRAFT } from '../../constants/legalContent.js'

export default function PrivacyPage() {
  usePageMeta('Privacy Policy (draft)', 'Draft privacy policy for Arcloop. Not yet reviewed or in effect.')
  return <LegalDocument doc={PRIVACY_DRAFT} />
}
