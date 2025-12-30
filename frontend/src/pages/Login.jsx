import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import './Auth.css'

function Login({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      })

      const data = await response.json()

      if (response.ok) {
        onLogin(data.user)
        navigate('/')
      } else {
        setError(data.error || 'Login failed')
      }
    } catch (error) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1 className="auth-title">5 More Minutes</h1>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="auth-input"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="auth-input"
          />
          {error && <div className="auth-error">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="auth-button"
          >
            {loading ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        <div className="auth-footer">
          <span>Don't have an account? </span>
          <Link to="/register" className="auth-link">
            Sign up
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Login

