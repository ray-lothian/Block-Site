// eslint-disable-next-line no-unused-vars
const isFF = /Firefox/.test(navigator.userAgent);

// eslint-disable-next-line no-unused-vars
const notify = message => chrome.notifications.create(null, {
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message
});

// eslint-disable-next-line no-unused-vars
const translate = id => chrome.i18n.getMessage(id) || id;

/* once */
const once = (c, prop = {
  startup: true,
  installed: true
}) => {
  if (isFF) {
    if (prop.startup) {
      once.cache.push(c);
    }
    if (prop.installed) {
      chrome.runtime.onInstalled.addListener(c);
    }
  }
  else {
    if (prop.startup) {
      chrome.runtime.onStartup.addListener(c);
    }
    if (prop.installed) {
      chrome.runtime.onInstalled.addListener(c);
    }
  }
};
once.cache = [];

if (isFF) {
  const controller = new AbortController();
  const signal = controller.signal;

  const next = () => {
    if (signal.aborted) {
      return;
    }
    for (const c of once.cache) {
      try {
        c();
      }
      catch (e) {
        console.warn(e);
      }
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(next, 500);
  });
  chrome.runtime.onInstalled.addListener(() => {
    controller.abort();
  });
}
