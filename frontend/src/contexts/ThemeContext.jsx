import { createContext, useContext, useState, useEffect } from 'react'

const ThemeContext = createContext()

// Theme definitions - easy to add more themes by adding to this array
const themes = [
  {
    id: 'french-gray',
    name: 'French Gray',
    colors: {
      background: '#8e8e93', // Muted French gray
      surface: '#ffffff', // White for modals and cards
      text: '#ffffff', // White text for contrast on gray background
      textSecondary: '#e5e5ea', // Light gray for secondary text
      textMuted: '#c7c7cc', // Muted gray
      border: '#636366', // Darker gray for borders
      buttonBg: '#ffffff', // White buttons
      buttonText: '#1c1c1e', // Dark text on white buttons
      buttonDisabledBg: 'transparent',
      buttonDisabledText: '#c7c7cc',
      buttonDisabledBorder: '#aaa',
      primary: '#007aff', // iOS blue
      primaryHover: '#0051d5',
      error: '#ff3b30', // Red
      success: '#34c759', // Green
      warningBg: '#ffffff', // White for modals
      warningBorder: '#636366',
      overlay: 'rgba(0, 0, 0, 0.4)', // Dark overlay
      placeholder: '#c7c7cc',
      surfaceText: '#1c1c1e', // Dark text for white surfaces (modals, auth boxes)
      plainTextLinkTextColorUnclicked: '#fff', // Light blue for contrast on gray
      plainTextLinkTextColorClicked: '#fff', // iOS blue (slightly darker when clicked)
      imageBorder: '5px solid #ccc',
    }
  },
  {
    id: 'terracotta',
    name: 'Terracotta',
    colors: {
      background: '#c15f3c', // Terracotta orange
      surface: '#f5e6d3', // Light cream/beige for modals and cards
      text: '#ffffff', // White text for contrast on terracotta background
      textSecondary: '#f5e6d3', // Light cream for secondary text (good contrast on terracotta)
      textMuted: '#d4a574', // Muted terracotta
      border: '#a54d2e', // Darker terracotta for borders
      buttonBg: '#f5e6d3', // Light cream buttons
      buttonText: '#8b3e1f', // Dark terracotta text on buttons
      buttonDisabledBg: 'transparent',
      buttonDisabledText: '#d4a574',
      buttonDisabledBorder: '#a54d2e',
      primary: '#4a90e2', // Complementary blue
      primaryHover: '#357abd',
      error: '#d32f2f', // Red
      success: '#2e7d32', // Green
      warningBg: '#f5e6d3', // Light cream for modals
      warningBorder: '#a54d2e',
      overlay: 'rgba(0, 0, 0, 0.5)', // Dark overlay for better contrast
      placeholder: '#d4a574',
      surfaceText: '#8b3e1f', // Dark text for light surfaces (modals, auth boxes)
      plainTextLinkTextColorUnclicked: '#6bb3ff', // Light blue for contrast on terracotta
      plainTextLinkTextColorClicked: '#4a90e2', // Primary blue (darker when clicked)
      imageBorder: '',
    }
  },
  {
    id: 'dark',
    name: 'Dark Mode',
    colors: {
      background: '#000000',
      surface: '#1a1a1a',
      text: '#ffffff',
      textSecondary: '#b0b0b0',
      textMuted: '#808080',
      border: '#333333',
      buttonBg: '#e0e0e0',
      buttonText: '#000000',
      buttonDisabledBg: 'transparent',
      buttonDisabledText: '#808080',
      buttonDisabledBorder: '#333333',
      primary: '#0095f6',
      primaryHover: '#1877f2',
      error: '#ed4956',
      success: '#42b883',
      warningBg: '#1a1a1a',
      warningBorder: '#333333',
      overlay: 'rgba(255, 255, 255, 0.1)',
      placeholder: '#404040',
      surfaceText: '#ffffff', // White text on dark surfaces
      plainTextLinkTextColorUnclicked: '#0095f6', // Primary blue
      plainTextLinkTextColorClicked: '#1877f2', // Primary hover (darker when clicked)
      imageBorder: '',
    }
  },
  {
    id: 'light',
    name: 'Light Mode',
    colors: {
      background: '#ffffff',
      surface: '#fafafa',
      text: '#262626',
      textSecondary: '#8e8e8e',
      textMuted: '#8e8e8e',
      border: '#dbdbdb',
      buttonBg: '#F5D0D4', // Pastel colors will be applied dynamically
      buttonText: '#262626',
      buttonDisabledBg: 'transparent',
      buttonDisabledText: '#8e8e8e',
      buttonDisabledBorder: '#dbdbdb',
      primary: '#0095f6',
      primaryHover: '#1877f2',
      error: '#ed4956',
      success: '#42b883',
      warningBg: '#fafafa',
      warningBorder: '#dbdbdb',
      overlay: 'rgba(0, 0, 0, 0.5)',
      placeholder: '#dbdbdb',
      surfaceText: '#262626', // Dark text on light surfaces
      plainTextLinkTextColorUnclicked: '#0095f6', // Primary blue
      plainTextLinkTextColorClicked: '#1877f2', // Primary hover (darker when clicked)
      imageBorder: '',
    }
  },
  {
    id: 'claude',
    name: 'Claude Style',
    colors: {
      background: '#f7f5f0', // Warm beige/cream
      surface: '#ffffff',
      text: '#1a1a1a',
      textSecondary: '#4a4a4a',
      textMuted: '#6a6a6a',
      border: '#d4c5b9', // Warm beige border
      buttonBg: '#e8e3dc', // Light warm gray
      buttonText: '#1a1a1a',
      buttonDisabledBg: 'transparent',
      buttonDisabledText: '#9a9a9a',
      buttonDisabledBorder: '#d4c5b9',
      primary: '#c99a5c', // Warm brown/gold
      primaryHover: '#b88a4c',
      error: '#c94a2d',
      success: '#5a8a5a',
      warningBg: '#ffffff',
      warningBorder: '#d4c5b9',
      overlay: 'rgba(0, 0, 0, 0.3)',
      placeholder: '#d4c5b9',
      surfaceText: '#1a1a1a', // Dark text on light surfaces
      plainTextLinkTextColorUnclicked: '#c99a5c', // Warm brown/gold primary
      plainTextLinkTextColorClicked: '#b88a4c', // Primary hover (darker when clicked)
      imageBorder: '',
    }
  }
]

export function ThemeProvider({ children }) {
  const [currentThemeIndex, setCurrentThemeIndex] = useState(() => {
    // Default to French gray theme (index 0)
    const saved = localStorage.getItem('themeIndex')
    return saved ? parseInt(saved, 10) : 0
  })

  const currentTheme = themes[currentThemeIndex]

  useEffect(() => {
    // Save theme preference
    localStorage.setItem('themeIndex', currentThemeIndex.toString())
    
    // Apply theme to document root
    const root = document.documentElement
    Object.entries(currentTheme.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value)
    })
  }, [currentThemeIndex, currentTheme])

  const cycleTheme = () => {
    setCurrentThemeIndex((prev) => (prev + 1) % themes.length)
  }

  const value = {
    currentTheme,
    currentThemeIndex,
    cycleTheme,
    themes,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return context
}

