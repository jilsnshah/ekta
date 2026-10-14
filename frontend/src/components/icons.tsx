import type { ReactNode, SVGProps } from 'react'

/**
 * Ekta's icon set: one 20x20 grid, 1.6 stroke, round caps, drawn in
 * currentColor so every icon takes the colour of the text around it.
 *
 * Kept in one file so the set stays visually consistent -- an icon pulled
 * from a different library at a different weight is the fastest way to make
 * a product look assembled rather than designed.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number }

function make(paths: ReactNode, fill = false) {
  return function Icon({ size = 18, className, ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 20 20"
        width={size}
        height={size}
        fill={fill ? 'currentColor' : 'none'}
        stroke={fill ? 'none' : 'currentColor'}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className={className ? `shrink-0 ${className}` : 'shrink-0'}
        {...rest}
      >
        {paths}
      </svg>
    )
  }
}

export const IconOverview = make(
  <>
    <rect x="2.75" y="2.75" width="6" height="7.5" rx="1.5" />
    <rect x="11.25" y="2.75" width="6" height="4.5" rx="1.5" />
    <rect x="11.25" y="9.75" width="6" height="7.5" rx="1.5" />
    <rect x="2.75" y="12.75" width="6" height="4.5" rx="1.5" />
  </>,
)

export const IconAssign = make(
  <>
    <rect x="2.5" y="3" width="7" height="5" rx="1.3" />
    <rect x="2.5" y="12" width="7" height="5" rx="1.3" />
    <path d="M9.5 5.5h2.5a2 2 0 0 1 2 2v1.25M9.5 14.5h2.5a2 2 0 0 0 2-2v-1.25" />
    <path d="M14 10h3.5M15.75 8.25 17.5 10l-1.75 1.75" />
  </>,
)

export const IconOrders = make(
  <>
    <path d="M5 2.75h7.25L15.5 6v10.25a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-12.5a1 1 0 0 1 1-1Z" />
    <path d="M12 2.75V6.5h3.5M7 10h6M7 13.25h4" />
  </>,
)

export const IconTrips = make(
  <>
    <circle cx="5" cy="4.75" r="2" />
    <circle cx="15" cy="15.25" r="2" />
    <path d="M5 6.75v1.5a2.5 2.5 0 0 0 2.5 2.5h5a2.5 2.5 0 0 1 2.5 2.5v0" />
  </>,
)

export const IconTruck = make(
  <>
    <path d="M2.5 13.75v-8.5a1 1 0 0 1 1-1h7.75v9.5" />
    <path d="M11.25 7.5h3.4l2.85 3.1v3.15h-1.9M11.25 13.75H8.4" />
    <circle cx="6" cy="14.75" r="1.75" />
    <circle cx="14.5" cy="14.75" r="1.75" />
  </>,
)

export const IconDriver = make(
  <>
    <circle cx="10" cy="6.75" r="3.25" />
    <path d="M3.75 17c.6-3.1 3.1-5 6.25-5s5.65 1.9 6.25 5" />
  </>,
)

export const IconPin = make(
  <>
    <path d="M10 17.5s5.5-4.75 5.5-9.25a5.5 5.5 0 1 0-11 0C4.5 12.75 10 17.5 10 17.5Z" />
    <circle cx="10" cy="8.25" r="2" />
  </>,
)

export const IconBell = make(
  <>
    <path d="M5 13.75V9a5 5 0 0 1 10 0v4.75l1.25 1.5H3.75L5 13.75Z" />
    <path d="M8.25 17.25a1.9 1.9 0 0 0 3.5 0" />
  </>,
)

export const IconSearch = make(
  <>
    <circle cx="9" cy="9" r="5.5" />
    <path d="m13.25 13.25 3.5 3.5" />
  </>,
)

export const IconPlus = make(<path d="M10 4.5v11M4.5 10h11" />)
export const IconMinus = make(<path d="M4.5 10h11" />)
export const IconClose = make(<path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />)
export const IconCheck = make(<path d="m4.5 10.5 3.5 3.5 7.5-8" />)
export const IconChevronLeft = make(<path d="M12 5 7 10l5 5" />)
export const IconChevronRight = make(<path d="m8 5 5 5-5 5" />)
export const IconChevronDown = make(<path d="m5 8 5 5 5-5" />)
export const IconChevronUp = make(<path d="m5 12 5-5 5 5" />)
export const IconArrowRight = make(<path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />)
export const IconArrowUp = make(<path d="M10 16V4M5.5 8.5 10 4l4.5 4.5" />)
export const IconArrowDown = make(<path d="M10 4v12M5.5 11.5 10 16l4.5-4.5" />)

export const IconMore = make(
  <>
    <circle cx="4.5" cy="10" r="1.25" />
    <circle cx="10" cy="10" r="1.25" />
    <circle cx="15.5" cy="10" r="1.25" />
  </>,
  true,
)

export const IconMenu = make(<path d="M3.5 6h13M3.5 10h13M3.5 14h13" />)

export const IconPhone = make(
  <path d="M4.25 3h2.5l1.5 3.75-1.9 1.15a8.5 8.5 0 0 0 3.75 3.75l1.15-1.9L15 11.25v2.5A1.75 1.75 0 0 1 13.25 15.5 10.25 10.25 0 0 1 2.5 4.75 1.75 1.75 0 0 1 4.25 3Z" />,
)

export const IconNavigate = make(<path d="m3 9.25 13.5-5.75-5.75 13.5-1.6-6.15L3 9.25Z" />)

export const IconSignOut = make(
  <>
    <path d="M8 16.5H4.75a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1H8" />
    <path d="M12.5 13.5 16 10l-3.5-3.5M16 10H8" />
  </>,
)

export const IconBuilding = make(
  <>
    <path d="M3.5 17.25V4a1 1 0 0 1 1-1h6.5a1 1 0 0 1 1 1v13.25" />
    <path d="M12 7.5h3.5a1 1 0 0 1 1 1v8.75M2 17.25h16" />
    <path d="M6.25 6.5h2.5M6.25 9.75h2.5M6.25 13h2.5" />
  </>,
)

export const IconBox = make(
  <>
    <path d="M10 2.75 16.5 6v8L10 17.25 3.5 14V6L10 2.75Z" />
    <path d="M3.5 6 10 9.25 16.5 6M10 9.25v8" />
  </>,
)

export const IconCalendar = make(
  <>
    <rect x="3" y="4" width="14" height="13" rx="2" />
    <path d="M3 8h14M7 2.5V5M13 2.5V5" />
  </>,
)

export const IconClock = make(
  <>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 6v4l2.75 1.75" />
  </>,
)

export const IconWeight = make(
  <>
    <path d="M5.25 7h9.5l1.75 10H3.5L5.25 7Z" />
    <circle cx="10" cy="4.75" r="2" />
  </>,
)

export const IconGrip = make(
  <>
    <circle cx="7.5" cy="5" r="1.2" />
    <circle cx="12.5" cy="5" r="1.2" />
    <circle cx="7.5" cy="10" r="1.2" />
    <circle cx="12.5" cy="10" r="1.2" />
    <circle cx="7.5" cy="15" r="1.2" />
    <circle cx="12.5" cy="15" r="1.2" />
  </>,
  true,
)

export const IconAlert = make(
  <>
    <path d="M8.6 3.6 2.4 14.4a1.6 1.6 0 0 0 1.4 2.35h12.4a1.6 1.6 0 0 0 1.4-2.35L11.4 3.6a1.6 1.6 0 0 0-2.8 0Z" />
    <path d="M10 8v3.5M10 14.25v.1" />
  </>,
)

export const IconInfo = make(
  <>
    <circle cx="10" cy="10" r="7" />
    <path d="M10 9v4.5M10 6.5v.1" />
  </>,
)

export const IconSliders = make(
  <>
    <path d="M3.5 6h8M15 6h1.5M3.5 14h2M8.5 14h8" />
    <circle cx="13" cy="6" r="1.75" />
    <circle cx="7" cy="14" r="1.75" />
  </>,
)

export const IconSort = make(<path d="M6.5 4v12M3.5 13l3 3 3-3M13.5 16V4M10.5 7l3-3 3 3" />)

export const IconEdit = make(
  <>
    <path d="M12.75 3.75 16.25 7.25 7.5 16H4v-3.5l8.75-8.75Z" />
    <path d="m11 5.5 3.5 3.5" />
  </>,
)

export const IconTrash = make(
  <>
    <path d="M3.5 5.5h13M8 5.5V3.75h4V5.5M5.25 5.5l.75 11h8l.75-11" />
  </>,
)

export const IconExternal = make(
  <>
    <path d="M11 3.5h5.5V9M16.5 3.5 9.5 10.5" />
    <path d="M14 12v3.5a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1H8" />
  </>,
)

export const IconPackageUp = make(
  <>
    <path d="M10 13V3.5M6.25 7.25 10 3.5l3.75 3.75" />
    <path d="M3.5 12.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" />
  </>,
)

export const IconPackageDown = make(
  <>
    <path d="M10 3.5V13M6.25 9.25 10 13l3.75-3.75" />
    <path d="M3.5 12.5v3a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3" />
  </>,
)

export const IconHistory = make(
  <>
    <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6L3.5 7.25" />
    <path d="M3.5 3.75v3.5H7M10 6.75V10l2.25 1.5" />
  </>,
)

export const IconSpark = make(
  <path d="M10 2.75v3M10 14.25v3M2.75 10h3M14.25 10h3M4.9 4.9 7 7M13 13l2.1 2.1M4.9 15.1 7 13M13 7l2.1-2.1" />,
)

export const IconLock = make(
  <>
    <rect x="4" y="8.5" width="12" height="8.5" rx="2" />
    <path d="M6.75 8.5V6.25a3.25 3.25 0 0 1 6.5 0V8.5" />
  </>,
)

export const IconRoute = make(
  <>
    <circle cx="5" cy="15" r="2" />
    <circle cx="15" cy="5" r="2" />
    <path d="M7 15h5.5a2.5 2.5 0 0 0 0-5h-5a2.5 2.5 0 0 1 0-5H13" />
  </>,
)

export const IconCustomers = make(
  <>
    <circle cx="7.5" cy="7" r="2.75" />
    <path d="M2.5 16.25c.45-2.6 2.45-4.25 5-4.25s4.55 1.65 5 4.25" />
    <path d="M12.75 4.6a2.75 2.75 0 0 1 0 4.8M14.5 12.35c1.55.6 2.6 1.9 2.95 3.9" />
  </>,
)
