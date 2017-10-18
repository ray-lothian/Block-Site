'use strict';

var args = location.search.substr(1).split('&').reduce((p, c) => {
  const [key, value] = c.split('=');
  p[key] = decodeURIComponent(value);
  return p;
}, {});

var title = () => fetch(args.url).then(r => r.text()).then(content => {
  const dom = new DOMParser().parseFromString(content, 'text/html');
  if (dom.title) {
    document.getElementById('title').textContent = dom.title;
  }
});

if (args.url) {
  chrome.storage.local.get({
    title: true
  }, prefs => {
    if (prefs.title) {
      title();
    }
  });
  document.getElementById('url').textContent = args.url;
}

document.getElementById('date').textContent = (new Date()).toLocaleString();

document.addEventListener('submit', e => {
  e.preventDefault();
  chrome.runtime.sendMessage({
    method: 'open-once',
    url: args.url,
    password: e.target.querySelector('[type=password]').value
  });
});
