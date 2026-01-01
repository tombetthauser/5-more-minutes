import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import './Home.css'
import '../pages/Auth.css'

function Home({ user, onLogout }) {
  const { currentTheme, cycleTheme } = useTheme()
  const [timeData, setTimeData] = useState({ days: 0, hours: 0, minutes: 0 })
  const [todayTimeData, setTodayTimeData] = useState({ days: 0, hours: 0, minutes: 0 })
  const [showTodayTime, setShowTodayTime] = useState(false)
  const [isFading, setIsFading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [buttonActions, setButtonActions] = useState([])
  const [warning, setWarning] = useState(null)
  const [actionsTakenToday, setActionsTakenToday] = useState(new Set())
  const [actionCountsToday, setActionCountsToday] = useState({})
  const [showJsonDetails, setShowJsonDetails] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [showCustomActionForm, setShowCustomActionForm] = useState(false)
  const [customActionForm, setCustomActionForm] = useState({
    text: '',
    minutes: '',
    isRepeatable: true,
    mustBeLoggedAtEndOfDay: false,
    warning: '',
  })
  const [creatingAction, setCreatingAction] = useState(false)
  const [showResetTodayModal, setShowResetTodayModal] = useState(false)
  const [resettingToday, setResettingToday] = useState(false)
  const [holdTimer, setHoldTimer] = useState(null)
  const [isHolding, setIsHolding] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Scroll to top and reset zoom on mount
    window.scrollTo(0, 0)
    document.body.style.zoom = '1'
    
    fetchTime()
    fetchTodayTime()
    loadButtonActions()
    fetchTodayActions()
  }, [])

  useEffect(() => {
    // Cleanup timer on unmount or when holdTimer changes
    return () => {
      if (holdTimer) {
        clearTimeout(holdTimer)
      }
    }
  }, [holdTimer])

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
        setActionCountsToday(data.action_counts || {})
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

  const fetchTodayTime = async () => {
    try {
      // Get timezone offset in minutes
      const timezoneOffset = new Date().getTimezoneOffset() * -1
      const response = await fetch(`/api/time/today?timezone_offset=${timezoneOffset}`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setTodayTimeData(data)
      }
    } catch (error) {
      console.error('Failed to fetch today time:', error)
    }
  }

  const handleTimeDisplayClick = (e) => {
    // Don't toggle if we just completed a long press
    if (isHolding) {
      setIsHolding(false)
      return
    }
    setIsFading(true)
    setTimeout(() => {
      setShowTodayTime(!showTodayTime)
      setIsFading(false)
    }, 200) // Half of the fade duration
  }

  const handleTimeDisplayMouseDown = () => {
    setIsHolding(false)
    const timer = setTimeout(() => {
      setIsHolding(true)
      setShowResetTodayModal(true)
    }, 5000) // 5 seconds
    setHoldTimer(timer)
  }

  const handleTimeDisplayMouseUp = () => {
    if (holdTimer) {
      clearTimeout(holdTimer)
      setHoldTimer(null)
    }
  }

  const handleTimeDisplayMouseLeave = () => {
    if (holdTimer) {
      clearTimeout(holdTimer)
      setHoldTimer(null)
    }
    setIsHolding(false)
  }

  const handleResetToday = async () => {
    setResettingToday(true)
    try {
      const timezoneOffset = new Date().getTimezoneOffset() * -1
      const response = await fetch('/api/actions/today/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ timezone_offset: timezoneOffset }),
      })

      const data = await response.json()

      if (response.ok) {
        setShowResetTodayModal(false)
        // Refresh all data
        fetchTime()
        fetchTodayTime()
        fetchTodayActions()
        // Show success message briefly
        alert('Today\'s actions have been reset successfully!')
      } else {
        alert(data.error || 'Failed to reset today\'s actions')
        setShowResetTodayModal(false)
      }
    } catch (error) {
      alert('Network error. Please try again.')
      setShowResetTodayModal(false)
    } finally {
      setResettingToday(false)
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
        // Refresh today's actions and today's time after adding
        fetchTodayActions()
        fetchTodayTime()
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
          // Refresh today's actions and today's time
          fetchTodayActions()
          fetchTodayTime()
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

  const handleCustomActionSubmit = async (e) => {
    e.preventDefault()
    setCreatingAction(true)
    
    try {
      const response = await fetch('/api/custom-actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          text: customActionForm.text.trim(),
          minutes: parseInt(customActionForm.minutes) || 0,
          'is-repeatable-daily': customActionForm.isRepeatable,
          'must-be-logged-at-end-of-day': customActionForm.mustBeLoggedAtEndOfDay,
          warning: customActionForm.warning.trim() || null,
          'similar-to': [],
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setShowCustomActionForm(false)
        setCustomActionForm({
          text: '',
          minutes: '',
          isRepeatable: true,
          mustBeLoggedAtEndOfDay: false,
          warning: '',
        })
        // Reload button actions to include the new one
        loadButtonActions()
      } else {
        alert(data.error || 'Failed to create custom action')
      }
    } catch (error) {
      console.error('Failed to create custom action:', error)
      alert('Network error. Please try again.')
    } finally {
      setCreatingAction(false)
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

        <div 
          className="time-display-container" 
          onClick={handleTimeDisplayClick}
          onMouseDown={handleTimeDisplayMouseDown}
          onMouseUp={handleTimeDisplayMouseUp}
          onMouseLeave={handleTimeDisplayMouseLeave}
          onTouchStart={handleTimeDisplayMouseDown}
          onTouchEnd={handleTimeDisplayMouseUp}
          style={{ cursor: 'pointer' }}
        >
          <div className={`time-display ${isAnimating ? 'time-display-animating' : ''} ${isFading ? 'time-display-fading' : ''}`}>
            +{' '}
            {showTodayTime ? (
              <>
                {todayTimeData.days > 0 && `${todayTimeData.days} ${todayTimeData.days !== 1 ? 'dys' : 'dy'} `}
                {todayTimeData.hours > 0 && `${todayTimeData.hours} hrs `}
                {todayTimeData.minutes > 0 && `${todayTimeData.minutes} mins`}
                {todayTimeData.days === 0 && todayTimeData.hours === 0 && todayTimeData.minutes === 0 && '0 mins'}
              </>
            ) : (
              <>
                {timeData.days > 0 && `${timeData.days} ${timeData.days !== 1 ? 'dys' : 'dy'} `}
                {timeData.hours > 0 && `${timeData.hours} hrs `}
                {timeData.minutes > 0 && `${timeData.minutes} mins`}
                {timeData.days === 0 && timeData.hours === 0 && timeData.minutes === 0 && '0 mins'}
              </>
            )}
          </div>
          <div className={`time-display-label ${isFading ? 'time-display-fading' : ''}`}>
            {showTodayTime ? '[ time added today ]' : '[ total added time ]'}
          </div>
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
            
            const actionCount = actionCountsToday[action.text] || 0
            const isClickedButRepeatable = actionCount > 0 && isRepeatable && !isGrayed
            
            // Determine button style based on theme
            let buttonStyle = {}
            if (!isGrayed) {
              if (isClickedButRepeatable) {
                // Button has been clicked but is still repeatable - use darker colors
                if (currentTheme.id === 'dark' || currentTheme.id === 'terracotta' || currentTheme.id === 'claude' || currentTheme.id === 'french-gray') {
                  buttonStyle = {
                    backgroundColor: currentTheme.colors.clickedButRepeatableBackgroundColor,
                    color: currentTheme.colors.clickedButRepeatableTextColor,
                    borderColor: currentTheme.colors.clickedButRepeatableBorder,
                  }
                } else {
                  // Light mode: darker pastel colors
                  const darkerPastelColors = [
                    '#E0C8CC', // Darker pink
                    '#E0D4C0', // Darker peach
                    '#E0E0C0', // Darker yellow
                    '#C0E0CD', // Darker mint
                    '#C0D4E0', // Darker blue
                    '#D4C0E0', // Darker lavender
                  ]
                  const colorIndex = index % darkerPastelColors.length
                  buttonStyle = {
                    backgroundColor: darkerPastelColors[colorIndex],
                    color: currentTheme.colors.clickedButRepeatableTextColor,
                    borderColor: currentTheme.colors.clickedButRepeatableBorder,
                  }
                }
              } else {
                // Normal button styling
                if (currentTheme.id === 'dark' || currentTheme.id === 'terracotta' || currentTheme.id === 'claude' || currentTheme.id === 'french-gray') {
                  // Dark, Terracotta, Claude, and French Gray themes: use theme's button colors
                  buttonStyle = {
                    backgroundColor: currentTheme.colors.buttonBg,
                    color: currentTheme.colors.buttonText,
                  }
                } else {
                  // Light mode: pastel rainbow colors
                  const pastelColors = [
                    '#F5D0D4', // Subtle pink
                    '#F5E4D0', // Subtle peach
                    '#F5F5D0', // Subtle yellow
                    '#D0F5DD', // Subtle mint
                    '#D0E4F5', // Subtle blue
                    '#E4D0F5', // Subtle lavender
                  ]
                  const colorIndex = index % pastelColors.length
                  buttonStyle = {
                    backgroundColor: pastelColors[colorIndex],
                    color: currentTheme.colors.buttonText,
                  }
                }
              }
            }
            
            return (
              <button
                key={action.text}
                className={`action-button ${isGrayed ? 'action-button-taken' : ''}`}
                onClick={() => handleButtonClick(action)}
                disabled={loading}
                style={buttonStyle}
              >
                <div className="action-button-content">
                  <span className="action-button-text">
                    {action.text} (+{action.minutes})
                  </span>
                  {actionCount > 0 && (
                    <div className="action-dots">
                      {Array.from({ length: actionCount }).map((_, i) => (
                        <span key={i} className="action-dot" />
                      ))}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
          <button
            className="action-button action-button-add-new"
            onClick={() => setShowCustomActionForm(true)}
            disabled={loading}
          >
            add a new button...
          </button>
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

        {showCustomActionForm && (
          <div className="warning-overlay" onClick={() => setShowCustomActionForm(false)}>
            <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
              <div className="warning-header">
                <div>
                  <h3 className="warning-title">Add a new custom action to your list!</h3>
                </div>
              </div>
              <form onSubmit={handleCustomActionSubmit}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--color-surfaceText, var(--color-text))'
                  }}>
                    Action Text *
                  </label>
                  <input
                    type="text"
                    value={customActionForm.text}
                    onChange={(e) => setCustomActionForm({ ...customActionForm, text: e.target.value })}
                    placeholder="e.g., did yoga!"
                    required
                    className="auth-input"
                    style={{ width: '100%', marginBottom: '12px' }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--color-surfaceText, var(--color-text))'
                  }}>
                    Minutes to Add *
                  </label>
                  <input
                    type="number"
                    value={customActionForm.minutes}
                    onChange={(e) => setCustomActionForm({ ...customActionForm, minutes: e.target.value })}
                    placeholder="e.g., 30"
                    required
                    min="0"
                    className="auth-input"
                    style={{ width: '100%', marginBottom: '12px' }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    color: 'var(--color-surfaceText, var(--color-text))',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={customActionForm.isRepeatable}
                      onChange={(e) => setCustomActionForm({ ...customActionForm, isRepeatable: e.target.checked })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Can be repeated daily</span>
                  </label>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    color: 'var(--color-surfaceText, var(--color-text))',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      checked={customActionForm.mustBeLoggedAtEndOfDay}
                      onChange={(e) => setCustomActionForm({ ...customActionForm, mustBeLoggedAtEndOfDay: e.target.checked })}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>Must be logged at end of day</span>
                  </label>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    color: 'var(--color-surfaceText, var(--color-text))'
                  }}>
                    Warning (optional)
                  </label>
                  <textarea
                    value={customActionForm.warning}
                    onChange={(e) => setCustomActionForm({ ...customActionForm, warning: e.target.value })}
                    placeholder="Optional warning message to show when user clicks this action"
                    className="auth-textarea"
                    rows={3}
                    style={{ width: '100%', marginBottom: '12px' }}
                  />
                </div>
                <div className="warning-actions">
                  <button
                    type="button"
                    className="warning-button warning-button-cancel"
                    onClick={() => setShowCustomActionForm(false)}
                    disabled={creatingAction}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="warning-button warning-button-confirm"
                    disabled={creatingAction}
                  >
                    {creatingAction ? 'Creating...' : 'Create Action'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showResetTodayModal && (
          <div className="warning-overlay" onClick={() => setShowResetTodayModal(false)}>
            <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
              <div className="warning-header">
                <div>
                  <h3 className="warning-title">Reset Today's Actions</h3>
                  <p className="warning-action-name">This action cannot be undone</p>
                </div>
              </div>
              <p className="warning-message">
                Are you sure you want to reset all actions from today (since previous midnight)? This will:
              </p>
              <ul style={{ 
                margin: '0 0 16px 0', 
                paddingLeft: '20px',
                color: 'var(--color-surfaceText, var(--color-text))',
                fontSize: '14px',
                lineHeight: '1.5'
              }}>
                <li>Delete all actions logged today</li>
                <li>Subtract today's time from your total time</li>
              </ul>
              <p className="warning-message" style={{ marginBottom: '0' }}>
                Your total time before today will remain unchanged.
              </p>
              <div className="warning-actions">
                <button
                  className="warning-button warning-button-cancel"
                  onClick={() => setShowResetTodayModal(false)}
                  disabled={resettingToday}
                >
                  Cancel
                </button>
                <button
                  className="warning-button warning-button-reset"
                  onClick={handleResetToday}
                  disabled={resettingToday}
                >
                  {resettingToday ? 'Resetting...' : 'Reset Today'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="footer-links">
          <button className="link-button" onClick={onLogout}>
            Log Out
          </button>
          <span className="link-separator">•</span>
          <button
            className="link-button"
            onClick={() => navigate('/edit-profile')}
          >
            Edit Profile
          </button>
          <span className="link-separator">•</span>
          <button
            className="link-button"
            onClick={() => navigate('/edit-actions')}
          >
            Edit Actions
          </button>
          <span className="link-separator">•</span>
          <button
            className="link-button"
            onClick={cycleTheme}
          >
            Change Colors
          </button>
        </div>
      </div>
    </div>
  )
}

export default Home

