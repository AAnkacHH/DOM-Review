/**
 * DOM Review — Service Worker (Background)
 * Handles message relay between popup and content scripts,
 * and dynamic content script registration for custom URL patterns.
 */

const ENABLED_KEY = 'dr_enabled';
const DEFAULT_ORIGINS = ['http://localhost/*', 'http://127.0.0.1/*'];

const MAIN_WORLD_SCRIPTS = ['content/modules/framework-bridge.js', 'content/modules/agent-api-bridge.js'];
const ISOLATED_WORLD_SCRIPTS = [
  'content/modules/review-store.js',
  'content/modules/selector-generator.js',
  'content/modules/framework-detector.js',
  'content/modules/context-capture.js',
  'content/modules/shadow-ui.js',
  'content/modules/comment-panel.js',
  'content/modules/badges.js',
  'content/modules/sidebar.js',
  'content/modules/selector-mode.js',
  'content/modules/export-import.js',
  'content/modules/agent-api-handler.js',
  'content/content-script.js'
];
const ISOLATED_WORLD_CSS = ['content/content-style.css'];

// Custom sites are the host permissions the user granted, nothing is stored separately.
// The popup closes as soon as Chrome shows its permission prompt, so it never got to save
// the site itself: the permission was granted but the scripts were not registered.
async function getCustomPatterns() {
  const granted = await chrome.permissions.getAll();
  return (granted.origins || []).filter(origin => !DEFAULT_ORIGINS.includes(origin));
}

// A permission event and a popup message can arrive together; registering twice at once
// fails with a duplicate id, so the runs go one after another.
let registration = Promise.resolve();

function registerDynamicScripts() {
  registration = registration.then(replaceDynamicScripts, replaceDynamicScripts);
  return registration;
}

async function replaceDynamicScripts() {
  // Unregister existing dynamic scripts first
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['dr-custom-main', 'dr-custom-isolated'] });
  } catch {
    // Scripts may not exist yet — ignore
  }

  const patterns = await getCustomPatterns();
  if (patterns.length === 0) return;

  await chrome.scripting.registerContentScripts([
    {
      id: 'dr-custom-main',
      matches: patterns,
      js: MAIN_WORLD_SCRIPTS,
      runAt: 'document_idle',
      world: 'MAIN'
    },
    {
      id: 'dr-custom-isolated',
      matches: patterns,
      js: ISOLATED_WORLD_SCRIPTS,
      css: ISOLATED_WORLD_CSS,
      runAt: 'document_idle'
    }
  ]);
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('DOM Review extension installed');
  await registerDynamicScripts();
});

// Also re-register on service worker startup (survives SW restarts)
registerDynamicScripts();

// Granting or revoking a site (popup prompt, chrome://extensions) changes where the scripts run
chrome.permissions.onAdded.addListener(() => { registerDynamicScripts(); });
chrome.permissions.onRemoved.addListener(() => { registerDynamicScripts(); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_REVIEWS') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) { sendResponse(null); return; }
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const el = document.getElementById('dom-review-data');
          return el ? el.textContent : null;
        }
      }).then(([result]) => {
        sendResponse(result?.result ?? null);
      }).catch(() => sendResponse(null));
    });
    return true; // async response
  }

  if (message.type === 'GET_REVIEW_COUNT') {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) { sendResponse(0); return; }
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const el = document.getElementById('dom-review-data');
          if (!el) return 0;
          try { return JSON.parse(el.textContent).reviews.length; }
          catch { return 0; }
        }
      }).then(([result]) => {
        sendResponse(result?.result ?? 0);
      }).catch(() => sendResponse(0));
    });
    return true;
  }

  if (message.type === 'GET_ENABLED') {
    chrome.storage.sync.get(ENABLED_KEY).then(result => {
      sendResponse(result[ENABLED_KEY] !== false); // default true
    });
    return true;
  }

  if (message.type === 'SET_ENABLED') {
    chrome.storage.sync.set({ [ENABLED_KEY]: message.enabled }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'GET_CUSTOM_PATTERNS') {
    getCustomPatterns().then(sendResponse);
    return true;
  }

  // The popup asks for this after a permission was granted; onAdded usually got there first
  if (message.type === 'ADD_CUSTOM_PATTERN') {
    (async () => {
      await registerDynamicScripts();
      sendResponse({ success: true, patterns: await getCustomPatterns() });
    })();
    return true;
  }

  if (message.type === 'REMOVE_CUSTOM_PATTERN') {
    (async () => {
      try {
        await chrome.permissions.remove({ origins: [message.pattern] });
      } catch {
        // Not an optional permission or already gone
      }
      await registerDynamicScripts();
      sendResponse({ success: true, patterns: await getCustomPatterns() });
    })();
    return true;
  }
});
