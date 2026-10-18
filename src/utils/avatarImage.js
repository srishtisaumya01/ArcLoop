// Shrinks a chosen picture to a centred square (256 px, JPEG) in the browser before it is uploaded, so uploads stay small
// whatever the camera produced. Resolves a Blob; rejects with a user-safe Error if the file is not a readable image.
export const AVATAR_SIZE = 256

export async function shrinkToAvatar(file, size = AVATAR_SIZE) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choose an image file (JPEG, PNG or WebP).')
  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('We could not read that picture. Try another one.')
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!blob) throw new Error('We could not process that picture. Try another one.')
  return blob
}
