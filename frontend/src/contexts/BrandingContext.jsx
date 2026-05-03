import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const BrandingContext = createContext({});

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(null);

  useEffect(() => {
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
      .catch(() => {});
  }, []);

  return (
    <BrandingContext.Provider value={{ branding, setBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export const useBranding = () => useContext(BrandingContext);
