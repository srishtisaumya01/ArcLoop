import LegalDocument from '../../components/common/LegalDocument.jsx'
import { usePageMeta } from '../../hooks/usePageMeta.js'
import { TERMS_DRAFT } from '../../constants/legalContent.js'

export default function TermsPage() {
  usePageMeta('Terms of Service (draft)', 'Draft terms of service for Arcloop. Not yet reviewed or in effect.')
  return <LegalDocument doc={TERMS_DRAFT} />
}
