# Exact Code Changes - Session Persistence Fix

## Summary
Modified one file: `client/src/hooks/useAuth.ts`
- Added 1 new function (26 lines)
- Modified 3 event handlers (3 lines added)

## Change 1: New Function (Lines 135-160)

### Location
Before the `export function useAuth()` declaration

### Code Added
```typescript
/**
 * Emergency override: Force save session to localStorage
 * Bypasses Supabase's lock-based persistence that may timeout
 * Uses the exact same key that Supabase uses internally
 */
const forceSessionToLocalStorage = async (session: Session | null): Promise<void> => {
  if (!session || !session.user || !session.access_token) {
    console.warn('[Auth] Cannot save invalid session to localStorage');
    return;
  }

  try {
    // Supabase project ID: zjvozjnbvrtrrpehqdpf
    const storageKey = 'sb-zjvozjnbvrtrrpehqdpf-auth-token';

    // Save the full session object as JSON
    const sessionJson = JSON.stringify(session);
    localStorage.setItem(storageKey, sessionJson);

    console.log('[Auth] Emergency session save to localStorage: SUCCESS');
    console.log('[Auth] Saved to key:', storageKey);
    console.log('[Auth] Session user:', session.user.email);
  } catch (error) {
    console.error('[Auth] Emergency session save to localStorage: FAILED', error);
  }
};
```

## Change 2: SIGNED_IN Event Handler (Line 274)

### Before
```typescript
if (event === "SIGNED_IN" && session?.user) {
  console.log("[Auth] User signed in:", session.user.email);
  const profile = await fetchProfile(session.user.id);
  setState({
    user: session.user,
    profile,
    session,
    isLoading: false,
    isAuthenticated: true,
  });
```

### After
```typescript
if (event === "SIGNED_IN" && session?.user) {
  console.log("[Auth] User signed in:", session.user.email);
  // Emergency override: force save session to localStorage
  await forceSessionToLocalStorage(session);
  const profile = await fetchProfile(session.user.id);
  setState({
    user: session.user,
    profile,
    session,
    isLoading: false,
    isAuthenticated: true,
  });
```

### Change Details
- Location: Inside onAuthStateChange callback, SIGNED_IN event
- Added: One async call to `forceSessionToLocalStorage(session)`
- Position: After logging the sign-in event, before fetching profile

## Change 3: TOKEN_REFRESHED Event Handler (Line 295)

### Before
```typescript
} else if (event === "TOKEN_REFRESHED" && session) {
  console.log("[Auth] Token refreshed");
  setState(prev => ({
    ...prev,
    session,
    user: session.user,
  }));
```

### After
```typescript
} else if (event === "TOKEN_REFRESHED" && session) {
  console.log("[Auth] Token refreshed");
  // Emergency override: update session in localStorage when token is refreshed
  await forceSessionToLocalStorage(session);
  setState(prev => ({
    ...prev,
    session,
    user: session.user,
  }));
```

### Change Details
- Location: Inside onAuthStateChange callback, TOKEN_REFRESHED event
- Added: One async call to `forceSessionToLocalStorage(session)`
- Position: After logging the token refresh, before updating state

## Change 4: INITIAL_SESSION Event Handler (Line 304)

### Before
```typescript
} else if (event === "INITIAL_SESSION" && session?.user) {
  console.log("[Auth] Initial session detected:", session.user.email);
  const profile = await fetchProfile(session.user.id);
  setState({
    user: session.user,
    profile,
    session,
    isLoading: false,
    isAuthenticated: true,
  });
```

### After
```typescript
} else if (event === "INITIAL_SESSION" && session?.user) {
  console.log("[Auth] Initial session detected:", session.user.email);
  // Emergency override: force save session to localStorage
  await forceSessionToLocalStorage(session);
  const profile = await fetchProfile(session.user.id);
  setState({
    user: session.user,
    profile,
    session,
    isLoading: false,
    isAuthenticated: true,
  });
```

### Change Details
- Location: Inside onAuthStateChange callback, INITIAL_SESSION event
- Added: One async call to `forceSessionToLocalStorage(session)`
- Position: After logging initial session detection, before fetching profile

## Line-by-Line Breakdown

### New Lines (26 total)
```
135-139: Comment block
140-144: Function signature and validation
145-149: Try block opening
146-148: Storage key definition
150-152: Session serialization and save
154-156: Success logging (3 console.log calls)
157-159: Error handling
160: Closing brace
```

### Modified Lines (3 total)
- Line 274: `await forceSessionToLocalStorage(session);`
- Line 295: `await forceSessionToLocalStorage(session);`
- Line 304: `await forceSessionToLocalStorage(session);`

### Comment Lines (3 total)
- Comment before line 274
- Comment before line 295
- Comment before line 304

## Function Signature

```typescript
const forceSessionToLocalStorage = async (session: Session | null): Promise<void>
```

**Parameters:**
- `session`: Supabase Session object or null

**Return Type:**
- `Promise<void>` - No return value, async function

**Dependencies:**
- Uses browser's `localStorage` API (native)
- Uses `JSON.stringify()` (native)
- Uses `console` (native)
- Expects Supabase `Session` type from imports

## Type Safety

All changes are fully typed:
```typescript
session: Session | null  // From Supabase, properly typed
```

The function validates:
1. `session` exists
2. `session.user` exists
3. `session.access_token` exists

Before attempting localStorage write.

## Error Handling

The function includes try-catch:
- Catches any localStorage errors
- Logs errors with `[Auth]` prefix
- Does not throw errors (graceful failure)
- App continues functioning if save fails

## Logging

Three success log messages:
```
[Auth] Emergency session save to localStorage: SUCCESS
[Auth] Saved to key: sb-zjvozjnbvrtrrpehqdpf-auth-token
[Auth] Session user: user@example.com
```

Two warning messages:
```
[Auth] Cannot save invalid session to localStorage        // Invalid session
[Auth] Emergency session save to localStorage: FAILED     // Save error
```

## Async/Await Usage

All three calls use `await`:
```typescript
await forceSessionToLocalStorage(session);
```

This ensures:
1. Session is saved before moving to next step
2. Proper async function handling
3. Errors can be caught in parent try-catch (if added)

## localStorage Key Details

**Key:** `sb-zjvozjnbvrtrrpehqdpf-auth-token`

Hardcoded in line 148:
```typescript
const storageKey = 'sb-zjvozjnbvrtrrpehqdpf-auth-token';
```

**Format:**
- `sb-` = Supabase prefix
- `zjvozjnbvrtrrpehqdpf` = Supabase project ID
- `-auth-token` = Suffix

**Data Stored:**
Full session object JSON containing:
- user (object with id, email, metadata, etc.)
- access_token (JWT)
- refresh_token (for renewal)
- expires_at (Unix timestamp)
- token_type (bearer)
- And other session fields

## Code Quality

- Follows existing code style
- Consistent with React hooks patterns
- Proper TypeScript typing
- No external dependencies
- Error handling included
- Logging for debugging
- Comments explaining purpose

## Files Affected

**Modified:** 1 file
- `/client/src/hooks/useAuth.ts`

**Created:** 0 files
(Documentation files created separately)

**Deleted:** 0 files

## Backward Compatibility

- 100% backward compatible
- No breaking changes
- Existing functionality preserved
- Only adds safety layer
- Can be removed if needed

## Testing Points

1. Function exists and is callable
2. Function validates session input
3. Function saves to correct localStorage key
4. Function logs success/failure
5. Function is called on SIGNED_IN
6. Function is called on TOKEN_REFRESHED
7. Function is called on INITIAL_SESSION
8. Session persists across page reload
9. Multiple tabs share session via localStorage
10. Logout clears localStorage entry

---

**Total Changes:** 30 lines of code (26 new, 3 modified, 1 comment added)
**Files Modified:** 1
**Complexity Added:** Minimal
**Risk Level:** Low (additive changes only)
