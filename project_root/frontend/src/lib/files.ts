export function filesFromList(list: FileList | DataTransferItemList | File[] | null | undefined) {
  if (!list) return []
  if (Array.isArray(list)) return list
  if (list instanceof FileList) return Array.from(list)

  const files: File[] = []
  for (const item of list) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) files.push(file)
    }
  }
  return files
}

export function dataTransferHasFiles(data: DataTransfer | null | undefined) {
  return Boolean(data?.types?.includes('Files'))
}
