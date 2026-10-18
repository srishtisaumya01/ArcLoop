// Saves text as a file on the person's device, from the page, with no server round trip: the content is only ever in this
// browser. (A Blob URL and a temporary link: the same thing the browser's own "save as" does.)
export function downloadTextFile({ filename, text, mime = 'text/plain;charset=utf-8' }) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0) // after the browser has started the download
}
