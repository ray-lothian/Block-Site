'use strict';

var args = location.search.substr(1).split('&').reduce((p, c) => {
  const [key, value] = c.split('=');
  p[key] = decodeURIComponent(value);
  return p;
}, {});

document.getElementById('date').textContent = (new Date()).toLocaleString();
if (args.url) {
  const url = document.getElementById('url');
  url.textContent = url.href = args.url;
}

document.addEventListener('submit', e => {
  e.preventDefault();
  chrome.runtime.sendMessage({
    method: 'open-once',
    url: args.url,
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

var title = () => fetch(args.url).then(r => r.text()).then(content => {
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
  if (prefs.title && args.url) {
    title();
  }
  if (prefs.close) {
    const title = document.title;
    window.setInterval(() => {
      document.title = title + ` (${prefs.close})`;
      prefs.close -= 1;
      if (prefs.close === -1) {
        window.close();
      }
    }, 1000);
  }
}));
