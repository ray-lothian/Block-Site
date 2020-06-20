'use strict';

const args = new URLSearchParams(location.search);

document.getElementById('message').textContent = args.get('message') || 'NA';

document.getElementById('cancel').addEventListener('click', () => {
  chrome.runtime.sendMessage({
    method: 'prompt-resolved'
  });
  window.close();
});
document.querySelector('form').addEventListener('submit', e => {
  e.preventDefault();
  chrome.runtime.sendMessage({
    method: 'prompt-resolved',
    password: document.getElementById('password').value
  });
  window.close();
});

document.getElementById('password').addEventListener('input', e => {
  document.getElementById('ok').disabled = e.target.value === '';
});

window.addEventListener('blur', () => chrome.runtime.sendMessage({
  method: 'bring-to-front'
}));
window.onbeforeunload = () => chrome.runtime.sendMessage({
  method: 'prompt-resolved'
});

document.addEventListener('keyup', e => {
  if (e.code === 'Escape') {
    window.close();
  }
});
