import { useEffect, useState } from 'react'

/** Whole seconds until `deadline` (ISO timestamp), never below zero. Ticks every second. */
export function useCountdown(deadline: string | null): number {
  const secondsLeft = () => (deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - Date.now()) / 1000)) : 0)
  const [seconds, setSeconds] = useState(secondsLeft)

  useEffect(() => {
    setSeconds(secondsLeft())
    if (!deadline) return
    const timer = setInterval(() => setSeconds(secondsLeft()), 1000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline])

  return seconds
}
