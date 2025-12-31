import { useTheme } from '../contexts/ThemeContext'
import './ThemeToggle.css'

function ThemeToggle() {
  const { cycleTheme, currentTheme } = useTheme()

  return (
    <button 
      className="theme-toggle" 
      onClick={cycleTheme}
      title={`Current theme: ${currentTheme.name}. Click to cycle themes.`}
      aria-label="Toggle theme"
    >
      ☀
    </button>
  )
}

export default ThemeToggle

