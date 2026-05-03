import { Library } from '../components/Library'
import { ScrollToActive } from '../components/ScrollToActivate'

export function LocalSpace() {
  return (
    <div className="flex-1 relative overflow-hidden">
      <ScrollToActive />
      <Library />
    </div>
  )
}
