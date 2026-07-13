import { useEffect, useRef } from 'react'

/** Run a data loader immediately, on an interval, and whenever connectivity/view resumes. */
<<<<<<< HEAD
export default function useAutoRefresh(callback, intervalMs) {
=======
export default function useAutoRefresh(callback, intervalMs, refreshKey = '') {
>>>>>>> 23b0ecad43258afe71a144fbed8b528015030979
  const callbackRef = useRef(callback)
  const runningRef = useRef(false)

  useEffect(() => { callbackRef.current = callback }, [callback])

  useEffect(() => {
    let active = true
<<<<<<< HEAD
    const run = async () => {
      if (!active || runningRef.current) return
      runningRef.current = true
=======
    const effectToken = {}
    const run = async () => {
      if (!active || runningRef.current === effectToken) return
      runningRef.current = effectToken
>>>>>>> 23b0ecad43258afe71a144fbed8b528015030979
      try {
        await callbackRef.current()
      } catch (error) {
        console.warn('Automatic data refresh failed.', error)
      } finally {
<<<<<<< HEAD
        runningRef.current = false
=======
        if (runningRef.current === effectToken) runningRef.current = null
>>>>>>> 23b0ecad43258afe71a144fbed8b528015030979
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
<<<<<<< HEAD
=======
      if (runningRef.current === effectToken) runningRef.current = null
>>>>>>> 23b0ecad43258afe71a144fbed8b528015030979
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('focus', runWhenVisible)
      window.removeEventListener('online', run)
      window.removeEventListener('dashboard-refresh', run)
    }
<<<<<<< HEAD
  }, [intervalMs])
=======
  }, [intervalMs, refreshKey])
>>>>>>> 23b0ecad43258afe71a144fbed8b528015030979
}
