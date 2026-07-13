import { useEffect, useRef } from 'react'

/** Run a data loader immediately, on an interval, and whenever connectivity/view resumes. */
export default function useAutoRefresh(callback, intervalMs) {
  const callbackRef = useRef(callback)
  const runningRef = useRef(false)

  useEffect(() => { callbackRef.current = callback }, [callback])

  useEffect(() => {
    let active = true
    const run = async () => {
      if (!active || runningRef.current) return
      runningRef.current = true
      try {
        await callbackRef.current()
      } catch (error) {
        console.warn('Automatic data refresh failed.', error)
      } finally {
        runningRef.current = false
      }
    }
    const runWhenVisible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) run()
    }
    const visibility = () => { if (document.visibilityState === 'visible') run() }

    run()
    const timer = window.setInterval(runWhenVisible, intervalMs)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('focus', runWhenVisible)
    window.addEventListener('online', run)
    window.addEventListener('dashboard-refresh', run)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('focus', runWhenVisible)
      window.removeEventListener('online', run)
      window.removeEventListener('dashboard-refresh', run)
    }
  }, [intervalMs])
}
