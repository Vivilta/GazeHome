/**
 * WebGazer Dynamic Loader & Lifecycle Controller
 * Manages script injection, video cleanup, and error resilience
 */

// Declare ambient type for webgazer global
declare global {
  interface Window {
    webgazer: any;
  }
}

let scriptLoadPromise: Promise<any> | null = null;

const SCRIPT_TIMEOUT_MS = 15000;

function loadScriptWithTimeout(script: HTMLScriptElement, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      reject(new Error('WebGazer script loading timed out. Please check your network connection.'));
    }, timeoutMs);

    script.onload = () => {
      window.clearTimeout(timeoutId);
      resolve();
    };

    script.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(new Error('Failed to load WebGazer script.'));
    };

    document.head.appendChild(script);
  });
}

export async function loadWebGazerScript(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('WebGazer can only be loaded in a browser environment');
  }

  if (window.webgazer) {
    return window.webgazer;
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    // Check if script already exists
    const existing = document.querySelector('script[data-webgazer="true"]');
    if (existing && window.webgazer) {
      resolve(window.webgazer);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/webgazer@3.3.0/dist/webgazer.js';
    script.dataset.webgazer = 'true';
    script.async = true;
    script.crossOrigin = 'anonymous';

    loadScriptWithTimeout(script, SCRIPT_TIMEOUT_MS)
      .then(() => {
        if (window.webgazer) {
          resolve(window.webgazer);
          return;
        }

        reject(new Error('WebGazer script loaded but window.webgazer object is missing.'));
      })
      .catch(() => {
        // Attempt fallback to secondary CDN, with the same finite timeout.
        const fallbackScript = document.createElement('script');
        fallbackScript.src = 'https://webgazer.cs.brown.edu/webgazer.js';
        fallbackScript.dataset.webgazer = 'fallback';
        fallbackScript.async = true;

        loadScriptWithTimeout(fallbackScript, SCRIPT_TIMEOUT_MS)
          .then(() => {
            if (window.webgazer) {
              resolve(window.webgazer);
              return;
            }

            reject(new Error('Fallback WebGazer script loaded but window.webgazer object is missing.'));
          })
          .catch(() => {
            reject(new Error('Failed to load WebGazer from both CDNs. Check your network connection and try again.'));
          });
      });
  });

  const pendingLoad = scriptLoadPromise;
  return pendingLoad.catch((error) => {
    if (scriptLoadPromise === pendingLoad) {
      scriptLoadPromise = null;
    }
    throw error;
  });
}

/**
 * Completely stops webcam tracks and purges DOM elements injected by WebGazer
 */
export function cleanupWebGazerDOM() {
  try {
    if (window.webgazer && typeof window.webgazer.end === 'function') {
      try {
        window.webgazer.end();
      } catch {
        // Ignore internal cleanup error
      }
    }
  } catch {
    // Ignore
  }

  // Force stop any hanging video tracks from getUserMedia
  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    navigator.mediaDevices.enumerateDevices().then(() => {
      // Find all video elements in DOM and stop their streams
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach((video) => {
        if (video.srcObject && 'getTracks' in (video.srcObject as MediaStream)) {
          (video.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
          video.srcObject = null;
        }
      });
    }).catch(() => {});
  }

  // Hide or remove WebGazer injected containers
  const idsToRemove = [
    'webgazerVideoContainer',
    'webgazerVideoFeed',
    'webgazerFaceOverlay',
    'webgazerFaceFeedbackBox',
    'webgazerGazeDot',
  ];

  idsToRemove.forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      if (el.parentNode) {
        try {
          el.parentNode.removeChild(el);
        } catch {
          // Ignore
        }
      }
    }
  });
}
