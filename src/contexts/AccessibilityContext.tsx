import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark';
export type TextScale = 'normal' | 'large' | 'extra-large';

export interface AccessibilityPreferences {
  theme: ThemeMode;
  textScale: TextScale;
  highContrast: boolean;
  reducedMotion: boolean;
}

interface AccessibilityContextType extends AccessibilityPreferences {
  setTheme: (theme: ThemeMode) => void;
  setTextScale: (scale: TextScale) => void;
  setHighContrast: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  resetPreferences: () => void;
}

const STORAGE_KEY = 'schoolcare_accessibility';

const defaultPreferences: AccessibilityPreferences = {
  theme: 'light',
  textScale: 'normal',
  highContrast: false,
  reducedMotion: false
};

const AccessibilityContext = createContext<AccessibilityContextType | undefined>(undefined);

const getSavedPreferences = (): AccessibilityPreferences => {
  if (typeof window === 'undefined') return defaultPreferences;

  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return defaultPreferences;

    const parsed = JSON.parse(saved) as Partial<AccessibilityPreferences>;
    return {
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      textScale: parsed.textScale === 'large' || parsed.textScale === 'extra-large' ? parsed.textScale : 'normal',
      highContrast: Boolean(parsed.highContrast),
      reducedMotion: Boolean(parsed.reducedMotion)
    };
  } catch {
    return defaultPreferences;
  }
};

export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(defaultPreferences.theme);
  const [textScale, setTextScaleState] = useState<TextScale>(defaultPreferences.textScale);
  const [highContrast, setHighContrastState] = useState<boolean>(defaultPreferences.highContrast);
  const [reducedMotion, setReducedMotionState] = useState<boolean>(defaultPreferences.reducedMotion);

  useEffect(() => {
    const saved = getSavedPreferences();
    setThemeState(saved.theme);
    setTextScaleState(saved.textScale);
    setHighContrastState(saved.highContrast);
    setReducedMotionState(saved.reducedMotion);
  }, []);

  useEffect(() => {
    const preferences: AccessibilityPreferences = {
      theme,
      textScale,
      highContrast,
      reducedMotion
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));

    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.textScale = textScale;
    document.documentElement.dataset.highContrast = String(highContrast);
    document.documentElement.dataset.reducedMotion = String(reducedMotion);
    document.body.classList.toggle('schoolcare-high-contrast', highContrast);
    document.body.classList.toggle('schoolcare-reduced-motion', reducedMotion);
  }, [theme, textScale, highContrast, reducedMotion]);

  const setTheme = (nextTheme: ThemeMode) => setThemeState(nextTheme);
  const setTextScale = (nextScale: TextScale) => setTextScaleState(nextScale);
  const setHighContrast = (enabled: boolean) => setHighContrastState(enabled);
  const setReducedMotion = (enabled: boolean) => setReducedMotionState(enabled);

  const resetPreferences = () => {
    setThemeState(defaultPreferences.theme);
    setTextScaleState(defaultPreferences.textScale);
    setHighContrastState(defaultPreferences.highContrast);
    setReducedMotionState(defaultPreferences.reducedMotion);
  };

  const value = useMemo<AccessibilityContextType>(() => ({
    theme,
    textScale,
    highContrast,
    reducedMotion,
    setTheme,
    setTextScale,
    setHighContrast,
    setReducedMotion,
    resetPreferences
  }), [theme, textScale, highContrast, reducedMotion]);

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export const useAccessibility = (): AccessibilityContextType => {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within an AccessibilityProvider');
  }
  return context;
};
