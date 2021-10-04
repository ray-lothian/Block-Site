'use strict';

if (localStorage.getItem('dark') !== 'false') {
  document.documentElement.classList.add('dark');
}
if (localStorage.getItem('mode-top') !== 'false') {
  document.documentElement.classList.add('dark');
}

if (window === window.top) {
  document.documentElement.classList.add(localStorage.getItem('mode-top') || 'complete');
}
else {
  document.documentElement.classList.add(localStorage.getItem('mode-frame') || 'complete');
}
