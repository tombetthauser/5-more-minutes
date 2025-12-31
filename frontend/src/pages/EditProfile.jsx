import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './Auth.css'

function EditProfile({ user, onUpdate }) {
  const [formData, setFormData] = useState({
    email: user.email || '',
    displayName: user.display_name || '',
    password: '',
    profilePicture: null,
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
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
    setSuccess('')
    setLoading(true)

    try {
      const formDataToSend = new FormData()
      formDataToSend.append('email', formData.email)
      formDataToSend.append('display_name', formData.displayName)
      if (formData.password) {
        formDataToSend.append('password', formData.password)
      }
      if (formData.profilePicture) {
        formDataToSend.append('profile_picture', formData.profilePicture)
      }

      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        credentials: 'include',
        body: formDataToSend,
      })

      const data = await response.json()

      if (response.ok) {
        setSuccess('Profile updated successfully!')
        onUpdate(data.user)
        setTimeout(() => navigate('/'), 1500)
      } else {
        setError(data.error || 'Update failed')
      }
    } catch (error) {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
        credentials: 'include',
      })

      const data = await response.json()

      if (response.ok) {
        setShowResetModal(false)
        setSuccess('All actions and time have been reset successfully!')
        // Refresh user data
        const userResponse = await fetch('/api/auth/me', {
          credentials: 'include',
        })
        if (userResponse.ok) {
          const userData = await userResponse.json()
          onUpdate(userData.user)
        }
        setTimeout(() => navigate('/'), 2000)
      } else {
        setError(data.error || 'Reset failed')
        setShowResetModal(false)
      }
    } catch (error) {
      setError('Network error. Please try again.')
      setShowResetModal(false)
    } finally {
      setResetting(false)
    }
  }

  const profilePicUrl = user.profile_picture
    ? `/api/uploads/${user.profile_picture}`
    : null

  return (
    <div className="auth-container">
      <div className="auth-box">
        <h1 className="auth-title">Edit Profile</h1>
        {profilePicUrl && (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <img
              src={profilePicUrl}
              alt="Profile"
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid #dbdbdb',
              }}
            />
          </div>
        )}
        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleChange}
            required
            className="auth-input"
          />
          <input
            type="text"
            name="displayName"
            placeholder="Display Name"
            value={formData.displayName}
            onChange={handleChange}
            required
            className="auth-input"
          />
          <input
            type="password"
            name="password"
            placeholder="New Password (leave blank to keep current)"
            value={formData.password}
            onChange={handleChange}
            className="auth-input"
          />
          <input
            type="file"
            name="profilePicture"
            accept="image/*"
            onChange={handleChange}
            className="auth-input-file"
          />
          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}
          <button
            type="submit"
            disabled={loading}
            className="auth-button"
          >
            {loading ? 'Updating...' : 'Update Profile'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="auth-button-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="auth-button-reset"
          >
            Reset All Actions & Time
          </button>
        </form>
      </div>

      {showResetModal && (
        <div className="warning-overlay" onClick={() => setShowResetModal(false)}>
          <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-header">
              <div>
                <h3 className="warning-title">Reset All Actions & Time</h3>
                <p className="warning-action-name">This action cannot be undone</p>
              </div>
            </div>
            <p className="warning-message">
              Are you sure you want to reset all your actions and total time? This will:
            </p>
            <ul style={{ 
              margin: '0 0 16px 0', 
              paddingLeft: '20px',
              color: 'var(--color-surfaceText, var(--color-text))',
              fontSize: '14px',
              lineHeight: '1.5'
            }}>
              <li>Delete all logged actions</li>
              <li>Reset your total time to 0</li>
            </ul>
            <p className="warning-message" style={{ marginBottom: '0' }}>
              Your username, name, email, and profile picture will not be affected.
            </p>
            <div className="warning-actions">
              <button
                className="warning-button warning-button-cancel"
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                className="warning-button warning-button-reset"
                onClick={handleReset}
                disabled={resetting}
              >
                {resetting ? 'Resetting...' : 'Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EditProfile

