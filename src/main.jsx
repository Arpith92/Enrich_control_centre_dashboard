import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  componentDidMount() {
    if (import.meta.hot) {
      this.removeHotListener = import.meta.hot.on('vite:afterUpdate', () => this.setState({ error: null }))
    }
  }
  componentWillUnmount() { this.removeHotListener?.() }
  render() {
    if (this.state.error) {
      return <div style={{ color: '#ff6b6b', padding: 24 }}>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{this.state.error.stack || this.state.error.message}</pre>
        <button onClick={() => window.location.reload()}>Reload dashboard</button>
      </div>
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </StrictMode>,
)
