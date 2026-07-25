import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

const iconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export const PlaygroundIcon = (props: IconProps) => (
  <svg {...iconProps} {...props}>
    <path d="M6 21V4.5a2.5 2.5 0 0 1 5 0V21" />
    <path d="M6 8h5M6 12h5M6 16h5" />
    <path d="m11 7 7 14M11 7h4.2L20 21" />
  </svg>
)

export const FountainIcon = (props: IconProps) => (
  <svg {...iconProps} {...props}>
    <path d="M12 2.5S5.5 10 5.5 15a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5Z" />
    <path d="M9 16.2a3.2 3.2 0 0 0 3.2 2.7" />
  </svg>
)

export const ToiletIcon = (props: IconProps) => (
  <svg {...iconProps} {...props}>
    <circle cx="7.5" cy="4.25" r="1.6" />
    <circle cx="16.5" cy="4.25" r="1.6" />
    <path d="M7.5 7v6M4.8 9.5v4.2M10.2 9.5v4.2M7.5 13v8M5.5 21l2-8 2 8M16.5 7v6M13.7 9.5v4.2M19.3 9.5v4.2M16.5 13v8M14.5 21h4" />
  </svg>
)

export const DogRunIcon = (props: IconProps) => (
  <svg {...iconProps} {...props}>
    <path d="M5 11 3 8l3.5 1L9 7h5l2.2 2.4H20l1.5 2.6-3 1.5V20h-2v-4.5H9V20H7v-8.4Z" />
    <path d="M14 7.2 15 4l3 3.2M5 11v4" />
    <circle cx="17.5" cy="9.5" r=".55" fill="currentColor" stroke="none" />
  </svg>
)
