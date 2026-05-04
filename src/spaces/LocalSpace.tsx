import { Library } from '../components/Library'
import { ScrollToActive } from '../components/ScrollToActivate'
import { useDurations } from '../hooks/useDurations'
import { useScan } from '../hooks/useScan'

export function LocalSpace() {
  useScan()
  useDurations()
  return (
    <div className="flex-1 relative overflow-hidden">
      <ScrollToActive />
      <Library />
    </div>
  )
}
