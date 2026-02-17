import { createContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '@lib/api';
import { STORAGE_KEYS } from '@lib/constants';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Initialize auth state from localStorage
  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      const savedUser = localStorage.getItem(STORAGE_KEYS.USER);

      if (token && savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          setUser(parsedUser);
          setIsAuthenticated(true);

          // Verify token is still valid
          const { data } = await authAPI.getProfile();
          setUser(data.user);
        } catch (error) {
          console.error('Auth initialization failed:', error);
          // Clear invalid auth
          localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
          localStorage.removeItem(STORAGE_KEYS.USER);
          setUser(null);
          setIsAuthenticated(false);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  // Login function
  const login = useCallback(async (email, password) => {
    try {
      const { data } = await authAPI.login({ email, password });

      // Save tokens
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));

      // Update state
      setUser(data.user);
      setIsAuthenticated(true);

      return { success: true };
    } catch (error) {
      console.error('Login failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Login failed'
      };
    }
  }, []);

  // Register function
  const register = useCallback(async (name, email, password) => {
    try {
      const { data } = await authAPI.register({ name, email, password });

      // Save tokens
      localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, data.accessToken);
      localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, data.refreshToken);
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));

      // Update state
      setUser(data.user);
      setIsAuthenticated(true);

      return { success: true };
    } catch (error) {
      console.error('Registration failed:', error);
      return {
        success: false,
        error: error.response?.data?.message || 'Registration failed'
      };
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear everything
      localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.USER);
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}