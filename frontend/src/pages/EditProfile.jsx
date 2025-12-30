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
        </form>
      </div>
    </div>
  )
}

export default EditProfile

