import type { ComponentType, SVGProps } from 'react'
import type { AmenityKey } from '../lib/parks'
import {
  DogRunIcon,
  FountainIcon,
  PlaygroundIcon,
  ToiletIcon,
} from './icons'

interface AmenityOption {
  key: AmenityKey
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

const OPTIONS: AmenityOption[] = [
  { key: 'playground', label: 'Spielplatz', Icon: PlaygroundIcon },
  {
    key: 'drinkingFountain',
    label: 'Trinkbrunnen',
    Icon: FountainIcon,
  },
  { key: 'toilet', label: 'Toilette', Icon: ToiletIcon },
  { key: 'dogRun', label: 'Hundeauslauf', Icon: DogRunIcon },
]

interface AmenityFiltersProps {
  selected: readonly AmenityKey[]
  onToggle: (key: AmenityKey) => void
}

export function AmenityFilters({
  selected,
  onToggle,
}: AmenityFiltersProps) {
  return (
    <fieldset className="amenity-fieldset">
      <legend>Im Park oder nah dran</legend>
      <div className="amenity-options">
        {OPTIONS.map(({ key, label, Icon }) => {
          const active = selected.includes(key)
          return (
            <button
              aria-label={label}
              aria-pressed={active}
              className="amenity-button"
              key={key}
              onClick={() => onToggle(key)}
              type="button"
            >
              <Icon />
              <span>{label}</span>
              {active ? <span className="selected-check">✓</span> : null}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}
