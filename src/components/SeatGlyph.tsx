import type { SeatStatus } from '../types/venue'

interface SeatGlyphProps {
  status: SeatStatus
  radius: number
}

/**
 * The seat shape, drawn around (0, 0). Status is encoded by shape as well as
 * colour: available = circle, selected = square with a check, reserved = circle
 * with a cross.
 */
export function SeatGlyph({ status, radius: r }: SeatGlyphProps) {
  if (status === 'selected') {
    const c = r * 0.55
    return (
      <>
        <rect className="seat-shape" x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.3} />
        <path
          className="seat-mark"
          d={`M ${-c} 0 L ${-c * 0.25} ${c * 0.75} L ${c} ${-c * 0.7}`}
        />
      </>
    )
  }
  if (status === 'reserved') {
    const c = r * 0.45
    return (
      <>
        <circle className="seat-shape" r={r} />
        <path className="seat-mark" d={`M ${-c} ${-c} L ${c} ${c} M ${c} ${-c} L ${-c} ${c}`} />
      </>
    )
  }
  return <circle className="seat-shape" r={r} />
}
