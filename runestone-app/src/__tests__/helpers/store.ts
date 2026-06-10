import type { AppStore } from '@/store'
import { useStore } from '@/store'

export function setStoreState(partial: Partial<AppStore>) {
  useStore.setState(partial)
}

export function resetStoreState() {
  useStore.setState(useStore.getInitialState())
}
