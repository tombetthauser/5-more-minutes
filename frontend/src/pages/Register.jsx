import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import './Auth.css'

function Register({ onLogin }) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    displayName: '',
    password: '',
    profilePicture: null,
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleChange = (e) => {
    if (e.target.name === 'profilePicture') {
      setFormData({ ...formData, profilePicture: e.target.files[0] })
    } else {
      setFormData({ ...formData, [e.target.name]: e.target.value })
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('username', formData.username)
      formDataToSend.append('email', formData.email)
      formDataToSend.append('display_name', formData.displayName)
      formDataToSend.append('password', formData.password)
      if (formData.profilePicture) {
        formDataToSend.append('profile_picture', formData.profilePicture)
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        body: formDataToSend,
      })

      const data = await response.json()

      if (response.ok) {
        onLogin(data.user)
        navigate('/')
      } else {
        setError(data.error || 'Registration failed')
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
        <p className="auth-description">
          Track and log the health benefits of things you do or skip throughout the day. 
          Increase your average life expectancy to spend more time with someone or something you care about.
        </p>
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            name="username"
            placeholder="Your username"
            value={formData.username}
            onChange={handleChange}
            required
            className="auth-input"
          />
          <input
            type="email"
            name="email"
            placeholder="Your email"
            value={formData.email}
            onChange={handleChange}
            required
            className="auth-input"
          />
          <input
            type="text"
            name="displayName"
            placeholder="Name of the person / thing you want more time with"
            value={formData.displayName}
            onChange={handleChange}
            required
            className="auth-input"
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleChange}
            required
            className="auth-input"
          />
          <label className="auth-file-label">
            Picture of the person / thing you want more time with
            <input
              type="file"
              name="profilePicture"
              accept="image/*"
              onChange={handleChange}
              className="auth-input-file"
            />
          </label>
          {error && <div className="auth-error">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="auth-button"
          >
            {loading ? 'Signing up...' : 'Sign Up'}
          </button>
        </form>
        <div className="auth-footer">
          <span>Have an account? </span>
          <Link to="/login" className="auth-link">
            Log in
          </Link>
        </div>
      </div>
    </div>
  )
}

export default Register

