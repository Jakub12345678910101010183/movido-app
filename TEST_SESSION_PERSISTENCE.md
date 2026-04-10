# Session Persistence Testing Guide

## Quick Browser Console Tests

After implementing the emergency override, you can verify the fix works by running these tests in the browser DevTools console.

### Test 1: Verify localStorage Key After Login
```javascript
// After successful login, run:
const sessionData = localStorage.getItem('sb-zjvozjnbvrtrrpehqdpf-auth-token');
if (sessionData) {
  const session = JSON.parse(sessionData);
  console.log('✓ Session found in localStorage');
  console.log('  User ID:', session.user.id);
  console.log('  User Email:', session.user.email);
  console.log('  Access Token exists:', !!session.access_token);
  console.log('  Expires At:', new Date(session.expires_at * 1000).toISOString());
} else {
  console.log('✗ No session found in localStorage - FIX FAILED');
}
```

### Test 2: Verify Session on Page Refresh
```javascript
// Open DevTools BEFORE refreshing
// Run this immediately after refresh (F5):
const sessionData = localStorage.getItem('sb-zjvozjnbvrtrrpehqdpf-auth-token');
console.log('After refresh - session exists:', !!sessionData);

// Check browser console for auth logs:
// Should see: "[Auth] Initial session detected: [email]"
// Should NOT see: "[Auth] No valid session found"
```

### Test 3: Monitor Console During Login
1. Open DevTools > Console tab
2. Clear any existing logs
3. Log out (if already logged in)
4. Log in with valid credentials
5. Watch for these messages (in order):
   ```
   [Auth] User signed in: user@example.com
   [Auth] Emergency session save to localStorage: SUCCESS
   [Auth] Saved to key: sb-zjvozjnbvrtrrpehqdpf-auth-token
   [Auth] Session user: user@example.com
   ```

### Test 4: Validate Session Token Format
```javascript
// Verify the stored session is valid JSON:
try {
  const sessionData = localStorage.getItem('sb-zjvozjnbvrtrrpehqdpf-auth-token');
  const session = JSON.parse(sessionData);

  // Check required fields
  const hasRequired = session.user && session.access_token && session.expires_at;
  console.log('Session is valid JSON:', hasRequired);

  if (hasRequired) {
    // Check if token is expired
    const expiresAt = new Date(session.expires_at * 1000);
    const isExpired = expiresAt < new Date();
    console.log('Token expired:', isExpired);
    console.log('Token expires at:', expiresAt.toISOString());
  }
} catch (e) {
  console.error('Session JSON is invalid:', e.message);
}
```

### Test 5: Clear Session and Verify Logout
```javascript
// This clears the persisted session (simulates logout):
localStorage.removeItem('sb-zjvozjnbvrtrrpehqdpf-auth-token');
console.log('Session cleared from localStorage');
// The app should now redirect to login on next action
```

## Manual Testing Workflow

### Scenario 1: Basic Login Flow
1. **Start**: Open app, not logged in
2. **Action**: Fill login form and click "Sign In"
3. **Expected**:
   - User is logged in
   - Redirected to dashboard/home
   - Console shows SUCCESS message
4. **Verify**: Run Test 1 console command above

### Scenario 2: Session Persistence
1. **Start**: User is logged in (completed Scenario 1)
2. **Action**: Press F5 or Cmd+R to refresh the page
3. **Expected**:
   - User remains logged in
   - Dashboard/home is shown
   - NO redirect to login
4. **Verify**: Run Test 2 console command above

### Scenario 3: Multiple Tabs
1. **Start**: Log in on Tab 1
2. **Action**: Open Tab 2 and navigate to the app
3. **Expected**:
   - Tab 2 automatically logs you in
   - Session is shared via localStorage
4. **Verify**: Both tabs show user as logged in

### Scenario 4: Browser Restart
1. **Start**: Log in and verify session in localStorage
2. **Action**: Close browser completely, then reopen
3. **Expected**:
   - Session persists from localStorage
   - User is automatically logged in
4. **Verify**: App loads with user authenticated

### Scenario 5: Logout Cleanup
1. **Start**: User is logged in
2. **Action**: Click logout/sign out button
3. **Expected**:
   - User is logged out
   - Session cleared from localStorage
4. **Verify**:
   ```javascript
   localStorage.getItem('sb-zjvozjnbvrtrrpehqdpf-auth-token') === null
   ```

## Troubleshooting

### Issue: Session not saving after login
**Check:**
1. Browser console shows error: `[Auth] Emergency session save to localStorage: FAILED`
2. Run: `localStorage.getItem('sb-zjvozjnbvrtrrpehqdpf-auth-token')`
3. If null, check:
   - Is localStorage disabled in browser settings?
   - Is app running in private/incognito mode?
   - Any browser extensions blocking storage?

### Issue: User logs out on refresh
**Check:**
1. Is the localStorage key present after login?
2. Run: `JSON.parse(localStorage.getItem('sb-zjvozjnbvrtrrpehqdpf-auth-token'))`
3. Does it have valid JSON with `user`, `access_token`, `expires_at`?
4. Is the token expired? Check `expires_at` value

### Issue: Multiple login prompts
**Check:**
1. Clear console
2. Perform login
3. Count how many times `[Auth] Emergency session save to localStorage: SUCCESS` appears
4. Should be exactly once per login
5. If appearing multiple times, may indicate duplicate event listeners

## Performance Metrics

Monitor console for timing information:
```javascript
// Add this to check localStorage write performance:
const start = performance.now();
localStorage.setItem('sb-zjvozjnbvrtrrpehqdpf-auth-token', JSON.stringify({test: true}));
const duration = performance.now() - start;
console.log(`localStorage.setItem took ${duration.toFixed(2)}ms`);
// Should be < 5ms in normal conditions
```

## Success Criteria

The fix is working correctly when:
1. ✓ Login works as before
2. ✓ Console shows `[Auth] Emergency session save to localStorage: SUCCESS` after login
3. ✓ `sb-zjvozjnbvrtrrpehqdpf-auth-token` exists in localStorage with valid JSON
4. ✓ Pressing F5 keeps user logged in
5. ✓ Closing and reopening browser preserves login
6. ✓ Token refresh updates the localStorage entry
7. ✓ Logout clears the localStorage entry

## Cleanup Commands

If you need to clear all auth-related data:
```javascript
// Clear the main session
localStorage.removeItem('sb-zjvozjnbvrtrrpehqdpf-auth-token');

// Clear other possible Supabase keys
localStorage.removeItem('supabase.auth.token');
localStorage.removeItem('supabase.auth.user');

// Full clear (if needed):
localStorage.clear();
console.log('All localStorage data cleared');
```
