import { initializeTomTomConfig } from './lib/tomtom-config';
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Initialize TomTom configuration
initializeTomTomConfig();

/**
 * Global error handlers for robust initialization
 *
 * This system:
 * - Handles Navigator lock timeout errors gracefully
 * - Implements automatic retry mechanism for failed auth operations
 * - Logs errors for debugging without crashing the app
 * - Provides recovery mechanism for session restoration
 */

if (typeof window !== 'undefined') {
  // Track failed auth operations for potential recovery
  let authRetryCount = 0;
  const MAX_AUTH_RETRIES = 3;
  let retryScheduled = false;

  /**
   * Attempt to recover from auth initialization failure
   * Called when critical auth errors occur
   */
  const attemptAuthRecovery = () => {
    if (authRetryCount >= MAX_AUTH_RETRIES || retryScheduled) {
      console.error('[Global] Max auth recovery attempts reached or recovery already scheduled');
      return;
    }

    retryScheduled = true;
    authRetryCount++;

    const delayMs = 1000 * authRetryCount; // Exponential backoff: 1s, 2s, 3s
    console.warn(
      `[Global] Scheduling auth recovery attempt ${authRetryCount}/${MAX_AUTH_RETRIES} in ${delayMs}ms`
    );

    setTimeout(() => {
      retryScheduled = false;
      console.log('[Global] Attempting auth recovery...');

      // Try to restore session from localStorage
      try {
        const sessionStr = localStorage.getItem('supabase.auth.token');
        if (sessionStr) {
          const session = JSON.parse(sessionStr);
          if (session && session.access_token) {
            console.log('[Global] Found session in localStorage, app may self-recover');
          }
        }
      } catch (error) {
        console.warn('[Global] Failed to check localStorage during recovery:', error);
      }

      // Dispatch custom event that the auth hook can listen to
      window.dispatchEvent(new CustomEvent('auth-recovery-attempt', { detail: { attempt: authRetryCount } }));
    }, delayMs);
  };

  /**
   * Handle unhandled promise rejections
   * These can come from Web Locks API timeouts or other async failures
   */
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason;
    const errorMsg = error?.message || String(error);
    const errorStack = error?.stack || '';

    // Categorize the error
    const isNavigatorLockError =
      errorMsg.includes('Navigator') ||
      errorMsg.includes('LockManager') ||
      errorMsg.includes('timeout') ||
      errorMsg.includes('lock');

    const isAuthError =
      errorMsg.includes('auth') ||
      errorMsg.includes('session') ||
      errorMsg.includes('token') ||
      errorStack.includes('supabase');

    const isNetworkError =
      errorMsg.includes('fetch') ||
      errorMsg.includes('network') ||
      errorMsg.includes('CORS') ||
      errorMsg.includes('timeout');

    // Log with context
    if (isNavigatorLockError) {
      console.warn(
        '[Global] Navigator lock timeout detected - this is expected in some environments',
        `Error: ${errorMsg}`
      );
      event.preventDefault(); // Prevent crash
    } else if (isAuthError) {
      console.error('[Global] Auth-related error detected:', errorMsg);
      console.log('[Global] Error stack:', errorStack);

      // Attempt recovery for critical auth errors
      if (errorMsg.includes('getSession') || errorMsg.includes('session')) {
        attemptAuthRecovery();
      }

      event.preventDefault(); // Allow app to continue
    } else if (isNetworkError) {
      console.warn('[Global] Network error detected:', errorMsg);
      console.log('[Global] Error stack:', errorStack);

      // Network errors are often temporary, allow app to continue
      event.preventDefault();
    } else {
      // Unknown error - log but allow app to continue
      console.error('[Global] Unhandled promise rejection:', error);
      console.log('[Global] Error message:', errorMsg);
      console.log('[Global] Error stack:', errorStack);

      // For unexpected errors, prevent crash but log thoroughly
      event.preventDefault();
    }
  });

  /**
   * Handle global errors (synchronous errors, errors in event handlers, etc.)
   */
  window.addEventListener('error', (event) => {
    const error = event.error;
    const errorMsg = error?.message || event.message || String(event);

    if (errorMsg.includes('Navigator') || errorMsg.includes('lock')) {
      console.warn('[Global] Navigator error:', errorMsg);
      // Don't prevent default for synchronous errors, but log it
    } else {
      console.error('[Global] Unhandled error:', errorMsg);
    }
  });

  /**
   * Provide global recovery function accessible from console
   * Users can call window.__recoverAuth() if needed for debugging
   */
  (window as any).__recoverAuth = () => {
    console.log('[Global] Manual auth recovery triggered');
    authRetryCount = 0;
    retryScheduled = false;
    attemptAuthRecovery();
  };

  console.log('[Global] Error handling system initialized');
}

createRoot(document.getElementById("root")!).render(<App />);
