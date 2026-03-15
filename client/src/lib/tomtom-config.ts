// Global TomTom Configuration - Increase timeout for Navigator lock
export const initializeTomTomConfig = () => {
  // Suppress TomTom timeout errors with retry logic
  if (typeof window !== 'undefined') {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      let retries = 3;
      while (retries > 0) {
        try {
          const response = await originalFetch(...args);
          return response;
        } catch (error: any) {
          if (error?.message?.includes('Navigator') && retries > 1) {
            retries--;
            await new Promise(r => setTimeout(r, 1000));
            continue;
          }
          throw error;
        }
      }
    };
  }
};
