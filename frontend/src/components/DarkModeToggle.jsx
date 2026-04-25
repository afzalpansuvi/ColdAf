import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';
import api from '../api/client';

const THEME_KEY = 'coldaf-theme';

export default function DarkModeToggle() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) return stored === 'dark';
    return false;
  });

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    api.put('/users/me/theme', { theme: next ? 'dark' : 'light' }).catch(() => {});
  };

  return (
    <button
      onClick={toggle}
      className="p-2.5 text-gray-400 hover:text-brand-600 rounded-xl hover:bg-brand-50 transition-all duration-200"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
