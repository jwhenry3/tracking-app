import { useToastStore, type ToastInput } from '@/stores/toastStore'

const sessionToastKeys = new Set<string>()

export function toast(input: ToastInput) {
  return useToastStore.getState().push(input)
}

export function toastOnce(key: string, input: ToastInput) {
  if (sessionToastKeys.has(key)) return null
  sessionToastKeys.add(key)
  return toast({ ...input, id: key })
}

export function clearToastSession() {
  sessionToastKeys.clear()
  useToastStore.getState().clear()
}

export function dismissToast(id: string) {
  useToastStore.getState().dismiss(id)
}
