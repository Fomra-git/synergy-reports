import React, { createContext, useContext, useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

const ConfigContext = createContext();

export const useConfig = () => useContext(ConfigContext);

// Default base configuration
export const DEFAULT_CONFIG = {
  appName: 'Synergy',
  appSubtitle: 'Reports Engine',
  logoBase64: null,
  faviconBase64: null,
  primaryColor: '#6366f1',
  secondaryColor: '#ec4899',
  fontFamily: "'Outfit', 'Inter', system-ui, sans-serif"
};

export const ConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    const configDocRef = doc(db, 'system_config', 'branding');
    
    // Listen for global configuration changes automatically
    const unsubscribe = onSnapshot(configDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setConfig(prev => ({ ...prev, ...data }));
        applyConfigToDOM(data);
      } else {
        // Doc doesn't exist yet, we apply default
        applyConfigToDOM(DEFAULT_CONFIG);
      }
      setLoadingConfig(false);
    }, (error) => {
      console.error('Error fetching global config:', error);
      applyConfigToDOM(DEFAULT_CONFIG);
      setLoadingConfig(false);
    });

    return () => unsubscribe();
  }, []);

  const applyConfigToDOM = (data) => {
    const root = document.documentElement;
    // Apply Colors
    if (data.primaryColor) root.style.setProperty('--primary', data.primaryColor);
    if (data.secondaryColor) root.style.setProperty('--secondary', data.secondaryColor);
    // Apply Font
    if (data.fontFamily) root.style.setProperty('--font-family', data.fontFamily);

    // Apply Favicon
    if (data.faviconBase64) {
      let link = document.querySelector("link[rel~='icon']");
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = data.faviconBase64;
    }

    // Apply App Title safely
    if (data.appName) {
      document.title = data.appName;
    }
  };

  return (
    <ConfigContext.Provider value={{ config, loadingConfig }}>
      {children}
    </ConfigContext.Provider>
  );
};
