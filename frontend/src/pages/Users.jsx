import { useState, useEffect } from 'react'
import './Users.css'

function Users() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedUsers, setExpandedUsers] = useState(new Set())
  const [userActions, setUserActions] = useState({})
  const [loadingActions, setLoadingActions] = useState({})
  const [resettingUsers, setResettingUsers] = useState(new Set())

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setUsers(data.users || [])
      } else {
        setError('Failed to load users')
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const minutesToDaysHoursMinutes = (totalMinutes) => {
    const days = Math.floor(totalMinutes / (24 * 60))
    const remaining = totalMinutes % (24 * 60)
    const hours = Math.floor(remaining / 60)
    const minutes = remaining % 60
    return { days, hours, minutes }
  }

  const formatTime = (totalMinutes) => {
    const time = minutesToDaysHoursMinutes(totalMinutes)
    const parts = []
    if (time.days > 0) {
      parts.push(`${time.days} day${time.days !== 1 ? 's' : ''}`)
    }
    if (time.hours > 0) {
      parts.push(`${time.hours} hour${time.hours !== 1 ? 's' : ''}`)
    }
    if (time.minutes > 0) {
      parts.push(`${time.minutes} minute${time.minutes !== 1 ? 's' : ''}`)
    }
    if (parts.length === 0) {
      return '0 minutes'
    }
    return parts.join(' ')
  }

  const toggleUserExpanded = async (userId) => {
    const newExpanded = new Set(expandedUsers)
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId)
    } else {
      newExpanded.add(userId)
      // Fetch actions if not already loaded
      if (!userActions[userId]) {
        await fetchUserActions(userId)
      }
    }
    setExpandedUsers(newExpanded)
  }

  const fetchUserActions = async (userId) => {
    setLoadingActions(prev => ({ ...prev, [userId]: true }))
    try {
      const response = await fetch(`/api/users/${userId}/actions`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setUserActions(prev => ({
          ...prev,
          [userId]: data.actions || [],
        }))
      }
    } catch (error) {
      console.error(`Failed to fetch actions for user ${userId}:`, error)
    } finally {
      setLoadingActions(prev => ({ ...prev, [userId]: false }))
    }
  }

  const handleResetUser = async (userId) => {
    if (!window.confirm('Are you sure you want to reset this user? This will delete all their actions and reset their total minutes to 0.')) {
      return
    }

    setResettingUsers(prev => new Set(prev).add(userId))
    try {
      const response = await fetch(`/api/users/${userId}/reset`, {
        method: 'POST',
        credentials: 'include',
      })
      if (response.ok) {
        // Refresh users list
        await fetchUsers()
        // Clear actions for this user
        setUserActions(prev => {
          const newActions = { ...prev }
          delete newActions[userId]
          return newActions
        })
        // Collapse if expanded
        setExpandedUsers(prev => {
          const newExpanded = new Set(prev)
          newExpanded.delete(userId)
          return newExpanded
        })
      } else {
        alert('Failed to reset user')
      }
    } catch (error) {
      console.error('Failed to reset user:', error)
      alert('Failed to reset user')
    } finally {
      setResettingUsers(prev => {
        const newSet = new Set(prev)
        newSet.delete(userId)
        return newSet
      })
    }
  }

  const formatDateTime = (dateString) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleString()
    } catch (error) {
      return dateString
    }
  }

  if (loading) {
    return (
      <div className="users-container">
        <div className="users-content">
          <div className="loading">Loading users...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="users-container">
        <div className="users-content">
          <div className="error">{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="users-container">
      <div className="users-content">
        <h1 className="users-title">All Users</h1>
        <p className="users-subtitle">Total: {users.length} user{users.length !== 1 ? 's' : ''}</p>

        <div className="users-list">
          {users.map((user) => {
            const isExpanded = expandedUsers.has(user.id)
            const actions = userActions[user.id] || []
            const isLoadingActions = loadingActions[user.id]
            const isResetting = resettingUsers.has(user.id)

            return (
              <div key={user.id} className="user-card">
                <div className="user-header">
                  <div className="user-profile-section">
                    {user.profile_picture ? (
                      <img
                        src={`/api/uploads/${user.profile_picture}`}
                        alt={user.display_name}
                        className="user-profile-picture"
                      />
                    ) : (
                      <div className="user-profile-placeholder" />
                    )}
                    <div className="user-info">
                      <h2 className="user-display-name">{user.display_name}</h2>
                      <p className="user-username">@{user.username}</p>
                      <p className="user-email">{user.email}</p>
                    </div>
                  </div>
                  <div className="user-stats">
                    <div className="user-stat">
                      <span className="stat-label">Total Time:</span>
                      <span className="stat-value">{formatTime(user.total_minutes)}</span>
                    </div>
                    <div className="user-stat">
                      <span className="stat-label">Total Minutes:</span>
                      <span className="stat-value">{user.total_minutes}</span>
                    </div>
                  </div>
                </div>
                <div className="user-actions-header">
                  {user.created_at && (
                    <p className="user-created">
                      Joined: {new Date(user.created_at).toLocaleDateString()}
                    </p>
                  )}
                  <div className="user-controls">
                    <button
                      className="user-toggle-button"
                      onClick={() => toggleUserExpanded(user.id)}
                    >
                      {isExpanded ? '▼ Hide Actions' : '▶ Show Actions'}
                    </button>
                    <button
                      className="user-reset-button"
                      onClick={() => handleResetUser(user.id)}
                      disabled={isResetting}
                    >
                      {isResetting ? 'Resetting...' : 'Reset User'}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="user-actions-section">
                    {isLoadingActions ? (
                      <div className="actions-loading">Loading actions...</div>
                    ) : actions.length === 0 ? (
                      <div className="no-actions">No actions recorded.</div>
                    ) : (
                      <div className="actions-list">
                        {actions.map((action) => (
                          <div key={action.id} className="action-item">
                            <div className="action-main">
                              <span className="action-text">{action.action}</span>
                              <span className="action-minutes">+{action.minutes_added} min</span>
                            </div>
                            <div className="action-time">
                              {formatDateTime(action.created_at)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {users.length === 0 && (
          <div className="no-users">No users found.</div>
        )}
      </div>
    </div>
  )
}

export default Users

