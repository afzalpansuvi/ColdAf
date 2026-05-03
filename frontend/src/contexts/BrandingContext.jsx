import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const BrandingContext = createContext({});

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(null);
  // Wait until AuthProvider has resolved the session before calling the API.
  // Without this guard, the call fires before the auth cookie is validated,
  // gets a 401, and client.js redirects to /login → infinite reload loop.
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading || !user) return; // not authenticated yet — skip
    api.get('/organizations/branding')
      .then(res => {
        const b = res.data?.branding || res.data || {};
        setBranding(b);
        if (b.primaryColor) {
          document.documentElement.style.setProperty('--brand-color', b.primaryColor);
        }
        if (b.companyName) {
          document.title = b.companyName;
        }
      })
      .catch(() => {}); // silently ignore — use platform defaults
  }, [user, authLoading]);

  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
