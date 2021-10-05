'use strict';

document.documentElement.classList[localStorage.getItem('dark') !== 'false' ? 'add' : 'remove']('dark');

if (window === window.top) {
  document.documentElement.classList.add(localStorage.getItem('mode-top') || 'complete');
}
else {
  document.documentElement.classList.add(localStorage.getItem('mode-frame') || 'complete');
}
