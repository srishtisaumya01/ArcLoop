import { useEffect } from 'react'

const SITE_NAME = 'Arcloop'
const DEFAULT_DESCRIPTION = 'Arcloop: build habits, keep growing.'

// Sets the document title and meta description for the current page.
export function usePageMeta(title, description = DEFAULT_DESCRIPTION) {
  useEffect(() => {
    const previousTitle = document.title
    document.title = title ? `${title} · ${SITE_NAME}` : `${SITE_NAME} — Build habits. Keep growing.`

    let tag = document.querySelector('meta[name="description"]')
    if (!tag) {
      tag = document.createElement('meta')
      tag.setAttribute('name', 'description')
      document.head.appendChild(tag)
    }
    const previousDescription = tag.getAttribute('content')
    tag.setAttribute('content', description)

    return () => {
      document.title = previousTitle
      if (previousDescription !== null) tag.setAttribute('content', previousDescription)
    }
  }, [title, description])
}
