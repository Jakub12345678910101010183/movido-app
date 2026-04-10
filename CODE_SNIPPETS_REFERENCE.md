# Code Snippets Reference

Quick copy-paste reference for key implementations in the critical fixes.

## Fix 1: Supabase Client Configuration

### Lock Timeout Handler
```typescript
// File: client/src/lib/supabase.ts
// Location: Lines 53-82

const LOCK_TIMEOUT_MS = 30000; // 30 seconds - extended for robust operation

const getLockWithTimeout = (name: string): Promise<LockManager | null> => {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.warn(`[Supabase Lock] Lock acquisition timeout for "${name}", proceeding without lock`);
      resolve(null);
    }, LOCK_TIMEOUT_MS);

    if (typeof navigator !== 'undefined' && navigator.locks) {
      navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, (lock) => {
        clearTimeout(timeout);
        resolve(lock || null);
      }).catch((error) => {
        clearTimeout(timeout);
        console.warn(`[Supabase Lock] Lock request failed for "${name}":`, error);
        resolve(null);
      });
    } else {
      clearTimeout(timeout);
      resolve(null);
    }
  });
};
```

### Error-Safe Custom Storage
```typescript
// File: client/src/lib/supabase.ts
// Location: Lines 24-51

const customStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`[Supabase Storage] Failed to read key "${key}":`, error);
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`[Supabase Storage] Failed to write key "${key}":`, error);
    }
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn(`[Supabase Storage] Failed to remove key "${key}":`, error);
    }
  },
};
```

### Auth Configuration
```typescript
// File: client/src/lib/supabase.ts
// Location: Lines 117-142

export const supabase = createClient<Database>(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder",
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: customStorage,
      flowType: 'implicit', // Disables lock-based session synchronization
      detectSessionInUrl: true,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
    db: {
      schema: 'public',
    },
  }
);

export { getLockWithTimeout, LOCK_TIMEOUT_MS };
```

---

## Fix 2: useAuth Hook Retry & Fallback Logic

### Retry with Exponential Backoff
```typescript
// File: client/src/hooks/useAuth.ts
// Location: Lines 27-57

const retryWithBackoff = async <T,>(
  fn: () => Promise<T>,
  maxRetries: number = 5,
  initialDelayMs: number = 500
): Promise<T> => {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        const delayMs = initialDelayMs * Math.pow(2, attempt);
        console.warn(
          `[Auth Retry] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delayMs}ms:`,
          lastError.message
        );
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error(
    `[Auth Retry] Failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
};
```

### localStorage Session Restoration
```typescript
// File: client/src/hooks/useAuth.ts
// Location: Lines 59-91

const restoreSessionFromStorage = (): Session | null => {
  try {
    const sessionStr = localStorage.getItem('supabase.auth.token');
    if (!sessionStr) {
      console.log('[Auth Storage] No session token found in localStorage');
      return null;
    }

    const session = JSON.parse(sessionStr) as Session;

    // Validate session structure
    if (!session || !session.user || !session.access_token) {
      console.warn('[Auth Storage] Invalid session structure in localStorage');
      return null;
    }

    // Check if access token is expired
    if (session.expires_at && session.expires_at * 1000 < Date.now()) {
      console.warn('[Auth Storage] Session access token is expired');
      return null;
    }

    console.log('[Auth Storage] Successfully restored session from localStorage');
    return session;
  } catch (error) {
    console.warn('[Auth Storage] Failed to restore session from localStorage:', error);
    return null;
  }
};
```

### Session Validation
```typescript
// File: client/src/hooks/useAuth.ts
// Location: Lines 119-133

const isValidSession = (session: Session | null): boolean => {
  if (!session || !session.user || !session.access_token) {
    return false;
  }

  // Check token expiration
  if (session.expires_at && session.expires_at * 1000 < Date.now()) {
    console.warn('[Auth Validation] Session token is expired');
    return false;
  }

  return true;
};
```

### JWT Token Parsing (Emergency Fallback)
```typescript
// File: client/src/hooks/useAuth.ts
// Location: Lines 93-117

const parseJwtToken = (token: string): Partial<User> | null => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));

    return {
      id: payload.sub,
      email: payload.email,
      user_metadata: payload.user_metadata || {},
      app_metadata: payload.app_metadata || {},
      aud: payload.aud,
      created_at: new Date(payload.iat * 1000).toISOString(),
    } as Partial<User>;
  } catch (error) {
    console.warn('[Auth JWT] Failed to parse JWT token:', error);
    return null;
  }
};
```

### Enhanced initAuth Effect
```typescript
// File: client/src/hooks/useAuth.ts
// Location: Lines 163-236 (initialization part)

// Initialize auth state with retry logic and fallback
useEffect(() => {
  let mounted = true;

  const initAuth = async () => {
    try {
      console.log("[Auth] Starting initialization...");

      let session: Session | null = null;
      let initError: Error | null = null;

      // Attempt 1: Try getSession() with retry logic
      try {
        console.log("[Auth] Attempting to get session from Supabase...");
        const result = await retryWithBackoff(
          async () => {
            const { data: { session: sess }, error } = await supabase.auth.getSession();
            if (error) throw error;
            return sess;
          },
          5, // max 5 retries
          500 // initial 500ms delay
        );
        session = result;
        console.log("[Auth] getSession() succeeded");
      } catch (error) {
        initError = error as Error;
        console.warn("[Auth] getSession() failed with retries:", initError.message);

        // Attempt 2: Try to restore from localStorage
        console.log("[Auth] Attempting to restore session from localStorage...");
        const storedSession = restoreSessionFromStorage();

        if (storedSession && isValidSession(storedSession)) {
          session = storedSession;
          console.log("[Auth] Session restored from localStorage");
        } else {
          console.warn("[Auth] Failed to restore valid session from localStorage");
        }
      }

      if (!mounted) return;

      // Process the session
      if (session && session.user && isValidSession(session)) {
        console.log("[Auth] Valid session found, fetching profile...");
        const profile = await fetchProfile(session.user.id);
        if (mounted) {
          setState({
            user: session.user,
            profile,
            session,
            isLoading: false,
            isAuthenticated: true,
          });
        }
      } else {
        console.log("[Auth] No valid session found, waiting for auth state changes");
        if (mounted) {
          setState(prev => ({ ...prev, isLoading: false }));
        }
      }
    } catch (err) {
      console.error("[Auth] Critical initialization error:", err);
      if (mounted) {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }
  };

  initAuth();

  // Listen for auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {
      // ... rest of listener
    }
  );

  return () => {
    mounted = false;
    subscription?.unsubscribe();
  };
}, [fetchProfile]);
```

---

## Fix 3: Global Error Handling & Auto-Recovery

### Error Recovery Function
```typescript
// File: client/src/main.tsx
// Location: Lines 25-63

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

    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('auth-recovery-attempt', { detail: { attempt: authRetryCount } }));
  }, delayMs);
};
```

### Unhandled Promise Rejection Handler
```typescript
// File: client/src/main.tsx
// Location: Lines 65-125

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
    event.preventDefault();
  } else if (isAuthError) {
    console.error('[Global] Auth-related error detected:', errorMsg);
    console.log('[Global] Error stack:', errorStack);

    // Attempt recovery for critical auth errors
    if (errorMsg.includes('getSession') || errorMsg.includes('session')) {
      attemptAuthRecovery();
    }

    event.preventDefault();
  } else if (isNetworkError) {
    console.warn('[Global] Network error detected:', errorMsg);
    console.log('[Global] Error stack:', errorStack);
    event.preventDefault();
  } else {
    console.error('[Global] Unhandled promise rejection:', error);
    console.log('[Global] Error message:', errorMsg);
    console.log('[Global] Error stack:', errorStack);
    event.preventDefault();
  }
});
```

### Synchronous Error Handler
```typescript
// File: client/src/main.tsx
// Location: Lines 127-140

window.addEventListener('error', (event) => {
  const error = event.error;
  const errorMsg = error?.message || event.message || String(event);

  if (errorMsg.includes('Navigator') || errorMsg.includes('lock')) {
    console.warn('[Global] Navigator error:', errorMsg);
  } else {
    console.error('[Global] Unhandled error:', errorMsg);
  }
});
```

### Manual Recovery Function
```typescript
// File: client/src/main.tsx
// Location: Lines 142-151

(window as any).__recoverAuth = () => {
  console.log('[Global] Manual auth recovery triggered');
  authRetryCount = 0;
  retryScheduled = false;
  attemptAuthRecovery();
};

console.log('[Global] Error handling system initialized');
```

---

## Usage Examples in Console

### Check if session exists
```javascript
localStorage.getItem('supabase.auth.token')
```

### Parse and view session data
```javascript
const session = JSON.parse(localStorage.getItem('supabase.auth.token'))
console.log(session)
```

### Manually trigger recovery
```javascript
window.__recoverAuth()
```

### Clear session (for testing)
```javascript
localStorage.removeItem('supabase.auth.token')
location.reload()
```

### Monitor all auth logs
```javascript
// Filter console to show only auth logs
// In DevTools: Type in filter box "^\[Auth\]"
```

### Monitor all global error logs
```javascript
// In DevTools: Type in filter box "^\[Global\]"
```

### Monitor all Supabase logs
```javascript
// In DevTools: Type in filter box "^\[Supabase\]"
```

---

## Configuration Customization

### Change Lock Timeout
```typescript
// In client/src/lib/supabase.ts, line 55:
const LOCK_TIMEOUT_MS = 60000; // Change from 30000 to 60000 (60 seconds)
```

### Change Retry Attempts
```typescript
// In client/src/hooks/useAuth.ts, in initAuth(), change:
const result = await retryWithBackoff(fn, 3, 1000); // 3 retries instead of 5, 1s initial delay
```

### Change Recovery Attempts
```typescript
// In client/src/main.tsx, line 22:
const MAX_AUTH_RETRIES = 5; // Change from 3 to 5
// Delays will be: 1s, 2s, 3s, 4s, 5s
```

---

## Key Logging Patterns

### Initialize pattern to look for
```
[Global] Error handling system initialized
[Auth] Starting initialization...
[Auth] Attempting to get session from Supabase...
[Auth] getSession() succeeded
```

### Retry pattern (when network is slow)
```
[Auth Retry] Attempt 1/5 failed, retrying in 500ms: Network timeout
[Auth Retry] Attempt 2/5 failed, retrying in 1000ms: Network timeout
[Auth Retry] Attempt 3/5 failed, retrying in 2000ms: Network timeout
[Auth] getSession() failed with retries: Failed after 5 attempts
[Auth] Attempting to restore session from localStorage...
[Auth Storage] Successfully restored session from localStorage
```

### Fallback pattern (localStorage recovery)
```
[Auth] getSession() failed with retries: Lock acquisition timeout
[Auth] Attempting to restore session from localStorage...
[Auth Storage] Successfully restored session from localStorage
[Auth] Valid session found, fetching profile...
```

### Recovery pattern (auto-recovery triggered)
```
[Global] Auth-related error detected: getSession timeout
[Global] Scheduling auth recovery attempt 1/3 in 1000ms
[Global] Attempting auth recovery...
[Global] Found session in localStorage, app may self-recover
```

---

## Error Detection Keywords

### Navigator Lock Errors
- `Navigator`
- `LockManager`
- `timeout`
- `lock`

### Auth Errors
- `auth`
- `session`
- `token`
- `supabase` (in stack trace)

### Network Errors
- `fetch`
- `network`
- `CORS`
- `timeout`

---

## Testing Commands

### Full build
```bash
cd client && pnpm build
```

### Run dev server
```bash
cd client && pnpm dev
```

### Type check
```bash
cd client && pnpm tsc --noEmit
```

### Clean install
```bash
cd client && rm -rf node_modules && pnpm install
```

