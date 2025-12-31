import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './Home.css'

function Home({ user, onLogout }) {
  const [timeData, setTimeData] = useState({ days: 0, hours: 0, minutes: 0 })
  const [loading, setLoading] = useState(false)
  const [buttonActions, setButtonActions] = useState([])
  const [warning, setWarning] = useState(null)
  const [actionsTakenToday, setActionsTakenToday] = useState(new Set())
  const [showJsonDetails, setShowJsonDetails] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchTime()
    loadButtonActions()
    fetchTodayActions()
  }, [])

  const loadButtonActions = async () => {
    try {
      const response = await fetch('/api/button-actions')
      if (response.ok) {
        const data = await response.json()
        // Sort actions by minutes (ascending - least to most)
        const sortedActions = (data.actions || []).sort((a, b) => (a.minutes || 0) - (b.minutes || 0))
        setButtonActions(sortedActions)
      } else {
        // Fallback to default actions
        const fallbackActions = [
          { text: 'skipped a meal!', minutes: 30 },
          { text: 'skipped a drink!', minutes: 15 },
          { text: 'went running!', minutes: 45 }
        ]
        setButtonActions(fallbackActions.sort((a, b) => a.minutes - b.minutes))
      }
    } catch (error) {
      console.error('Failed to load button actions:', error)
      // Fallback to default actions
      const fallbackActions = [
        { text: 'skipped a meal!', minutes: 30 },
        { text: 'skipped a drink!', minutes: 15 },
        { text: 'went running!', minutes: 45 }
      ]
      setButtonActions(fallbackActions.sort((a, b) => b.minutes - a.minutes))
    }
  }

  const fetchTodayActions = async () => {
    try {
      // Get timezone offset in minutes
      const timezoneOffset = new Date().getTimezoneOffset() * -1
      const response = await fetch(`/api/actions/today?timezone_offset=${timezoneOffset}`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setActionsTakenToday(new Set(data.actions || []))
      }
    } catch (error) {
      console.error('Failed to fetch today actions:', error)
    }
  }

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

  const handleButtonClick = async (action) => {
    // Check if action was already taken today AND if it's not repeatable
    const isRepeatable = action['is-repeatable-daily'] || false
    const wasTakenToday = actionsTakenToday.has(action.text)
    const isTaken = wasTakenToday && !isRepeatable
    
    // Check if a similar action was taken today (for non-repeatable actions)
    let similarActionTaken = null
    if (!isRepeatable && action['similar-to'] && Array.isArray(action['similar-to'])) {
      for (const similarAction of action['similar-to']) {
        if (actionsTakenToday.has(similarAction)) {
          similarActionTaken = similarAction
          break
        }
      }
    }
    
    // Action is disabled if it's taken OR if a similar action was taken (for non-repeatable)
    const isDisabled = isTaken || (similarActionTaken !== null && !isRepeatable)
    
    // Show confirmation modal for all actions
    setWarning({
      text: action.text,
      message: action.warning || null,
      minutes: action.minutes,
      isTaken: isTaken,
      similarActionTaken: similarActionTaken,
      isDisabled: isDisabled,
      isRepeatable: isRepeatable,
      mustBeLoggedAtEndOfDay: action['must-be-logged-at-end-of-day'] || false,
      fullAction: action, // Store full action object for JSON display
    })
  }

  const addTime = async (buttonText) => {
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
        // Refresh today's actions after adding
        fetchTodayActions()
      }
    } catch (error) {
      console.error('Failed to add time:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleWarningConfirm = async () => {
    if (warning && !warning.isDisabled) {
      const minutesToAdd = warning.minutes || 0
      setWarning(null)
      
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' })
      
      // Get current total minutes
      const currentTotal = timeData.days * 24 * 60 + timeData.hours * 60 + timeData.minutes
      const targetTotal = currentTotal + minutesToAdd
      
      // Animate counting up
      setIsAnimating(true)
      animateTimeCount(currentTotal, targetTotal, () => {
        // After animation, actually add the time
        addTime(warning.text).then(() => {
          setIsAnimating(false)
          // Refresh today's actions
          fetchTodayActions()
        })
      })
    }
  }

  const animateTimeCount = (startMinutes, endMinutes, onComplete) => {
    const duration = 1500 // Total animation duration in ms
    const startTime = Date.now()
    const totalChange = endMinutes - startMinutes
    
    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Ease out cubic for slowing towards the end
      const easedProgress = 1 - Math.pow(1 - progress, 3)
      
      const currentMinutes = Math.floor(startMinutes + totalChange * easedProgress)
      
      // Convert to days, hours, minutes
      const days = Math.floor(currentMinutes / (24 * 60))
      const remaining = currentMinutes % (24 * 60)
      const hours = Math.floor(remaining / 60)
      const mins = remaining % 60
      
      setTimeData({ days, hours, minutes: mins })
      
      if (progress < 1) {
        requestAnimationFrame(animate)
      } else {
        if (onComplete) onComplete()
      }
    }
    
    requestAnimationFrame(animate)
  }

  const handleWarningCancel = () => {
    setWarning(null)
    setShowJsonDetails(false)
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

        <div className={`time-display ${isAnimating ? 'time-display-animating' : ''}`}>
          +{' '}
          {timeData.days > 0 && `${timeData.days} ${timeData.days !== 1 ? 'dys' : 'dy'} `}
          {timeData.hours > 0 && `${timeData.hours} hrs `}
          {timeData.minutes > 0 && `${timeData.minutes} mins`}
          {timeData.days === 0 && timeData.hours === 0 && timeData.minutes === 0 && '0 mins'}
        </div>

        <div className="buttons-container">
          {buttonActions.map((action, index) => {
            // Only gray out if action was taken today AND it's not repeatable
            const isRepeatable = action['is-repeatable-daily'] || false
            const wasTakenToday = actionsTakenToday.has(action.text)
            const isTaken = wasTakenToday && !isRepeatable
            
            // Check if a similar action was taken today (for non-repeatable actions)
            let similarActionTaken = null
            if (!isRepeatable && action['similar-to'] && Array.isArray(action['similar-to'])) {
              for (const similarAction of action['similar-to']) {
                if (actionsTakenToday.has(similarAction)) {
                  similarActionTaken = similarAction
                  break
                }
              }
            }
            
            // Button is gray if taken OR if similar action was taken (for non-repeatable)
            const isGrayed = isTaken || (similarActionTaken !== null && !isRepeatable)
            
            // Pastel rainbow colors (subtle)
            const pastelColors = [
              '#F5D0D4', // Subtle pink
              '#F5E4D0', // Subtle peach
              '#F5F5D0', // Subtle yellow
              '#D0F5DD', // Subtle mint
              '#D0E4F5', // Subtle blue
              '#E4D0F5', // Subtle lavender
            ]
            const colorIndex = index % pastelColors.length
            const buttonColor = pastelColors[colorIndex]
            
            return (
              <button
                key={action.text}
                className={`action-button ${isGrayed ? 'action-button-taken' : ''}`}
                onClick={() => handleButtonClick(action)}
                disabled={loading}
                style={!isGrayed ? { backgroundColor: buttonColor, color: '#262626' } : {}}
              >
                {action.text} (+{action.minutes})
              </button>
            )
          })}
        </div>

        {warning && (
          <div className="warning-overlay" onClick={handleWarningCancel}>
            <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
              <div className="warning-header">
                <div>
                  <h3 className="warning-title">
                    {warning.isTaken 
                      ? 'Cannot Repeat' 
                      : warning.similarActionTaken
                        ? 'Similar Action Already Logged'
                        : warning.message 
                          ? '⚠️ Warning' 
                          : 'Confirm Action'}
                  </h3>
                  <p className="warning-action-name">{warning.text}</p>
                </div>
                <button
                  className="warning-info-icon"
                  onClick={() => setShowJsonDetails(!showJsonDetails)}
                  title="Show action details"
                >
                  ℹ️
                </button>
              </div>
              {warning.isTaken ? (
                <p className="warning-message warning-message-small">
                  This action has already been logged today. You can log it again after midnight in your local timezone.
                </p>
              ) : warning.similarActionTaken ? (
                <p className="warning-message warning-message-small">
                  A similar action ("{warning.similarActionTaken}") has already been logged today. Since this action is not repeatable, you cannot log it until after midnight in your local timezone.
                </p>
              ) : warning.message ? (
                <p className="warning-message">{warning.message}</p>
              ) : null}
              <div className="warning-minutes-info">
                <p className="warning-minutes-text">
                  This action will add <strong>{warning.minutes}</strong> minute{warning.minutes !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="warning-metadata">
                <div className="warning-metadata-item">
                  <span className="warning-metadata-label">Is repeatable:</span>
                  <span className={`warning-metadata-value ${warning.isRepeatable ? 'value-true' : 'value-false'}`}>
                    {warning.isRepeatable ? 'Yes' : 'No'}
                  </span>
                </div>
                <div className="warning-metadata-item">
                  <span className="warning-metadata-label">Must be logged at end of day:</span>
                  <span className={`warning-metadata-value ${warning.mustBeLoggedAtEndOfDay ? 'value-true' : 'value-false'}`}>
                    {warning.mustBeLoggedAtEndOfDay ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
              {showJsonDetails && warning.fullAction && (
                <div className="warning-json-details">
                  <pre className="warning-json-content">
                    {JSON.stringify(warning.fullAction, null, 2)}
                  </pre>
                </div>
              )}
              <div className="warning-actions">
                <button
                  className="warning-button warning-button-cancel"
                  onClick={handleWarningCancel}
                >
                  {warning.isDisabled ? 'Close' : 'Cancel'}
                </button>
                <button
                  className="warning-button warning-button-confirm"
                  onClick={handleWarningConfirm}
                  disabled={warning.isDisabled}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

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

