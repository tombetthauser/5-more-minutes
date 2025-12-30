import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Home.css'

const BUTTON_MINUTES = {
  'skipped a meal!': 30,
  'skipped a drink!': 15,
  'went running!': 45,
}

function Home({ user, onLogout }) {
  const [timeData, setTimeData] = useState({ days: 0, hours: 0, minutes: 0 })
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchTime()
  }, [])

  const fetchTime = async () => {
    try {
      const response = await fetch('/api/time', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setTimeData(data)
      }
    } catch (error) {
      console.error('Failed to fetch time:', error)
    }
  }

  const handleButtonClick = async (buttonText) => {
    setLoading(true)
    try {
      const response = await fetch('/api/time/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ action: buttonText }),
      })
      if (response.ok) {
        const data = await response.json()
        setTimeData(data)
      }
    } catch (error) {
      console.error('Failed to add time:', error)
    } finally {
      setLoading(false)
    }
  }

  const profilePicUrl = user.profile_picture
    ? `/api/uploads/${user.profile_picture}`
    : null

  return (
    <div className="home-container">
      <div className="home-content">
        <h1 className="main-title">5 More Minutes</h1>

        <div className="profile-picture-container">
          {profilePicUrl ? (
            <img
              src={profilePicUrl}
              alt="Profile"
              className="profile-picture"
            />
          ) : (
            <div className="profile-picture-placeholder" />
          )}
        </div>

        <h2 className="subtitle">with {user.display_name}!</h2>

        <div className="time-display">
          +{' '}
          {timeData.days > 0 && `${timeData.days} day${timeData.days !== 1 ? 's' : ''} `}
          {timeData.hours > 0 && `${timeData.hours} hour${timeData.hours !== 1 ? 's' : ''} `}
          {timeData.minutes > 0 && `${timeData.minutes} minute${timeData.minutes !== 1 ? 's' : ''}`}
          {timeData.days === 0 && timeData.hours === 0 && timeData.minutes === 0 && '0 minutes'}
        </div>

        <div className="buttons-container">
          {Object.keys(BUTTON_MINUTES).map((buttonText) => (
            <button
              key={buttonText}
              className="action-button"
              onClick={() => handleButtonClick(buttonText)}
              disabled={loading}
            >
              {buttonText}
            </button>
          ))}
        </div>

        <div className="footer-links">
          <button className="link-button" onClick={onLogout}>
            Log out
          </button>
          <span className="link-separator">•</span>
          <button
            className="link-button"
            onClick={() => navigate('/edit-profile')}
          >
            Edit profile
          </button>
        </div>
      </div>
    </div>
  )
}

export default Home

