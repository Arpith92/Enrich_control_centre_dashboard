import { useEffect, useRef } from 'react'

/** Run a data loader immediately, on an interval, and whenever connectivity/view resumes. */
export default function useAutoRefresh(callback, intervalMs, refreshKey = '') {
  const callbackRef = useRef(callback)
  const runningRef = useRef(false)

  useEffect(() => { callbackRef.current = callback }, [callback])

  useEffect(() => {
    let active = true
    const effectToken = {}
    const run = async () => {
      if (!active || runningRef.current === effectToken) return
      runningRef.current = effectToken
      try {
        await callbackRef.current()
      } catch (error) {
        console.warn('Automatic data refresh failed.', error)
      } finally {
        if (runningRef.current === effectToken) runningRef.current = null
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
      if (runningRef.current === effectToken) runningRef.current = null
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('focus', runWhenVisible)
      window.removeEventListener('online', run)
      window.removeEventListener('dashboard-refresh', run)
    }
  }, [intervalMs, refreshKey])
}
