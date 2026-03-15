// Global TomTom Configuration - Handle Navigator lock timeout globally
export const initializeTomTomConfig = () => {
  if (typeof window === 'undefined') return;

  const originalFetch = window.fetch;
  let lockAcquisitionDelay = 0;

  // Wrap fetch to add delays and retry logic for lock timeouts
  window.fetch = async (...args) => {
    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
      try {
        // Add adaptive delay to avoid lock contention
        if (lockAcquisitionDelay > 0) {
          await new Promise(resolve => setTimeout(resolve, lockAcquisitionDelay));
        }

        const response = await originalFetch(...args);

        // Reset delay on success
        if (response.ok) {
          lockAcquisitionDelay = Math.max(0, lockAcquisitionDelay - 100);
        }

        return response;
      } catch (error: any) {
        const isNavigatorLockError = error?.message?.includes('Navigator') ||
                                     error?.message?.includes('LockManager') ||
                                     error?.message?.includes('timeout');

        if (isNavigatorLockError && retries < maxRetries) {
          retries++;
          // Exponential backoff: 200ms, 500ms, 1000ms
          const backoffDelay = 200 * Math.pow(1.5, retries - 1);
          lockAcquisitionDelay = Math.min(2000, backoffDelay);

          console.warn(`[TomTom] Navigator lock timeout, retrying in ${backoffDelay}ms (attempt ${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }

        throw error;
      }
    }
  };

  console.log('[TomTom] Global Navigator lock timeout handling initialized');
};
