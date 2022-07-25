window.close();
chrome.runtime.sendMessage({
  method: 'close-page'
}, () => chrome.runtime.lastError);
