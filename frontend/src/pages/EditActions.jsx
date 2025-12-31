import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import './EditActions.css'

function EditActions() {
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingAction, setEditingAction] = useState(null)
  const [editForm, setEditForm] = useState({
    text: '',
    minutes: '',
    isRepeatable: true,
    mustBeLoggedAtEndOfDay: false,
    warning: '',
  })
  const navigate = useNavigate()

  useEffect(() => {
    fetchActions()
  }, [])

  const fetchActions = async () => {
    try {
      const response = await fetch('/api/button-actions', {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setActions(data.actions || [])
      }
    } catch (error) {
      console.error('Failed to fetch actions:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (action) => {
    if (!confirm(`Are you sure you want to delete "${action.text}"? This will only delete it for you.`)) {
      return
    }

    try {
      if (action.is_custom) {
        // Delete custom action - need to get the ID first
        // For now, we'll need to add an endpoint that accepts text
        // Or we can modify the API to return IDs
        const response = await fetch(`/api/custom-actions/delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ text: action.text }),
        })
        if (response.ok) {
          fetchActions()
        } else {
          alert('Failed to delete action')
        }
      } else {
        // Delete default action (user-specific)
        const response = await fetch('/api/actions/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action_text: action.original_text || action.text }),
        })
        if (response.ok) {
          fetchActions()
        } else {
          const data = await response.json()
          alert(data.error || 'Failed to delete action')
        }
      }
    } catch (error) {
      alert('Network error. Please try again.')
    }
  }

  const handleEdit = (action) => {
    setEditingAction(action)
    setEditForm({
      text: action.text,
      minutes: action.minutes,
      isRepeatable: action['is-repeatable-daily'] !== false,
      mustBeLoggedAtEndOfDay: action['must-be-logged-at-end-of-day'] === true,
      warning: action.warning || '',
    })
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    
    try {
      const isCustom = editingAction.is_custom
      const endpoint = isCustom ? '/api/custom-actions/edit' : '/api/actions/edit'
      const originalText = isCustom ? editingAction.text : (editingAction.original_text || editingAction.text)
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          original_text: originalText,
          text: editForm.text.trim(),
          minutes: parseInt(editForm.minutes) || 0,
          'is-repeatable-daily': editForm.isRepeatable,
          'must-be-logged-at-end-of-day': editForm.mustBeLoggedAtEndOfDay,
          warning: editForm.warning.trim() || null,
          'similar-to': editingAction['similar-to'] || [],
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setEditingAction(null)
        fetchActions()
      } else {
        alert(data.error || 'Failed to edit action')
      }
    } catch (error) {
      alert('Network error. Please try again.')
    }
  }

  const handleRestore = async (actionText) => {
    try {
      const response = await fetch('/api/actions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action_text: actionText }),
      })

      if (response.ok) {
        fetchActions()
      } else {
        const data = await response.json()
        alert(data.error || 'Failed to restore action')
      }
    } catch (error) {
      alert('Network error. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="edit-actions-container">
        <div className="edit-actions-box">
          <div className="loading">Loading actions...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="edit-actions-container">
      <div className="edit-actions-box">
        <h1 className="edit-actions-title">Edit Actions</h1>
        <p className="edit-actions-description">
          Edit or delete actions. Changes only apply to your account.
        </p>

        <div className="actions-list">
          {actions.map((action, index) => (
            <div key={index} className="action-item">
              <div className="action-info">
                <div className="action-text">{action.text}</div>
                <div className="action-minutes">+{action.minutes} minutes</div>
                {action.is_custom && (
                  <span className="action-badge">Custom</span>
                )}
                {action.is_edited && (
                  <span className="action-badge">Edited</span>
                )}
              </div>
              <div className="action-buttons">
                <button
                  className="action-button-edit"
                  onClick={() => handleEdit(action)}
                >
                  Edit
                </button>
                <button
                  className="action-button-delete"
                  onClick={() => handleDelete(action)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="edit-actions-footer">
          <button
            className="edit-actions-back-button"
            onClick={() => navigate('/')}
          >
            Back to Home
          </button>
        </div>
      </div>

      {editingAction && (
        <div className="warning-overlay" onClick={() => setEditingAction(null)}>
          <div className="warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="warning-header">
              <div>
                <h3 className="warning-title">Edit Action</h3>
                <p className="warning-action-name">
                  {editingAction.is_custom ? 'Custom Action' : (editingAction.original_text || editingAction.text)}
                </p>
              </div>
            </div>
            <form onSubmit={handleEditSubmit}>
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
                  value={editForm.text}
                  onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
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
                  value={editForm.minutes}
                  onChange={(e) => setEditForm({ ...editForm, minutes: e.target.value })}
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
                    checked={editForm.isRepeatable}
                    onChange={(e) => setEditForm({ ...editForm, isRepeatable: e.target.checked })}
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
                    checked={editForm.mustBeLoggedAtEndOfDay}
                    onChange={(e) => setEditForm({ ...editForm, mustBeLoggedAtEndOfDay: e.target.checked })}
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
                  value={editForm.warning}
                  onChange={(e) => setEditForm({ ...editForm, warning: e.target.value })}
                  className="auth-textarea"
                  rows={3}
                  style={{ width: '100%', marginBottom: '12px' }}
                />
              </div>
              <div className="warning-actions">
                <button
                  type="button"
                  className="warning-button warning-button-cancel"
                  onClick={() => setEditingAction(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="warning-button warning-button-confirm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default EditActions

