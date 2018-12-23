'use strict';

var args = new URLSearchParams(location.search);

document.getElementById('date').textContent = (new Date()).toLocaleString();
if (args.get('url')) {
  const url = document.getElementById('url');
  url.textContent = url.href = args.get('url');
}

document.addEventListener('submit', e => {
  e.preventDefault();
  chrome.runtime.sendMessage({
    method: 'open-once',
    url: args.get('url'),
    password: e.target.querySelector('[type=password]').value
  });
});

document.body.dataset.dark = localStorage.getItem('dark') || 'true';
document.getElementById('switch').addEventListener('click', () => {
  const val = document.body.dataset.dark === 'false';
  localStorage.setItem('dark', val);
  document.body.dataset.dark = val;
});
document.getElementById('options').addEventListener('click', e => {
  e.stopPropagation();
  chrome.runtime.sendMessage({
    'method': 'open-options'
  });
});

var title = () => fetch(args.get('url')).then(r => r.text()).then(content => {
  const dom = new DOMParser().parseFromString(content, 'text/html');
  if (dom.title) {
    document.getElementById('title').textContent = dom.title;
  }
});
// storage
document.addEventListener('DOMContentLoaded', () => chrome.storage.local.get({
  title: true,
  close: 0,
  message: ''
}, prefs => {
  document.getElementById('message').textContent = prefs.message;
  if (prefs.title && args.get('url')) {
    title();
  }
  if (prefs.close) {
    const title = document.title;
    window.setInterval(() => {
      document.title = title + ` (${prefs.close})`;
      prefs.close -= 1;
      if (prefs.close === -1) {
        chrome.runtime.sendMessage({
          method: 'close-tab'
        });
      }
    }, 1000);
  }
}));
