'use strict';

const args = new URLSearchParams(location.search);

document.getElementById('message').textContent = args.get('message') || 'NA';

const port = chrome.runtime.connect({
  name: 'prompt'
});

if (args.get('hidden') === 'false') {
  document.getElementById('password').type = 'text';
}
if (args.get('value')) {
  document.getElementById('password').value = args.get('value');
  document.getElementById('ok').disabled = false;
}

document.getElementById('cancel').addEventListener('click', () => {
  port.postMessage({
    method: 'prompt-resolved'
  });
  window.close();
});
document.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  port.postMessage({
    method: 'prompt-resolved',
    password: document.getElementById('password').value
  });
  window.close();
});

document.getElementById('password').addEventListener('input', e => {
  document.getElementById('ok').disabled = e.target.value === '';
});

window.addEventListener('blur', () => port.postMessage({
  method: 'bring-to-front'
}));
window.onbeforeunload = () => port.postMessage({
  method: 'prompt-resolved'
});

document.addEventListener('keyup', e => {
  if (e.code === 'Escape') {
    window.close();
  }
});
