/**
    "notification-view" custom component
    Copyright (C) 2022 [Lunu Bounir]

    This program is free software: you can redistribute it and/or modify
    it under the terms of the Mozilla Public License as published by
    the Mozilla Foundation, either version 2 of the License, or
    (at your option) any later version.
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    Mozilla Public License for more details.
    You should have received a copy of the Mozilla Public License
    along with this program.  If not, see {https://www.mozilla.org/en-US/MPL/}.

    GitHub: https://github.com/lunu-bounir/notification-view
    Homepage: https://webextension.org/custom-component/notification-view/index.html
*/

class NotificationView extends HTMLElement {
  static version = '0.1.1';

  constructor() {
    super();
    const shadow = this.attachShadow({
      mode: 'open'
    });
    shadow.innerHTML = `
      <style>
        :host {
          --success-fg: #fff;
          --success-bg: #27a043;
          --info-fg: #fff;
          --info-bg: #1b99af;
          --warning-fg: #fff;
          --warning-bg: #e18a12;
          --error-fg: #fff;
          --error-bg: #d13342;
          --gap: 10px;
        }
        #body {
          position: fixed;
          inset: 10px 10px auto auto;
          width: min(300px, 80vw);

          display: flex;
          flex-direction: column-reverse;
          gap: 5px;
          max-height: 80vh;
          overflow: auto;
          scroll-behavior: smooth;
        }
        #body > div.success {
          --fg: var(--success-fg);
          --bg: var(--success-bg);
        }
        #body > div.info {
          --fg: var(--info-fg);
          --bg: var(--info-bg);
        }
        #body > div.warning {
          --fg: var(--warning-fg);
          --bg: var(--warning-bg);
        }
        #body > div.error {
          --fg: var(--error-fg);
          --bg: var(--error-bg);
        }
        div.success svg:not(.success),
        div.info svg:not(.info),
        div.warning svg:not(.warning),
        div.error svg:not(.error) {
          display: none;
        }
        #body > div {
          color: var(--fg);
          background-color: var(--bg);
          fill: var(--fg);

          display: grid;
          grid-template-columns: calc(24px + var(--gap)) 1fr 24px;
          align-items: center;
          grid-gap: var(--gap);
        }
        svg {
          width: 24px;
          justify-self: end;
        }
        input[data-cmd=close] {
          cursor: pointer;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.2);
          color: var(--fg);
          font-size: 120%;
          opacity: 0.7;
        }
        input[data-cmd=close]:hover {
          opacity: 1;
        }
      </style>
      <template>
        <div>
          <svg version="1.1" viewBox="0 0 20 20" class="success">
            <path d="M10,0 C4.5,0 0,4.5 0,10 C0,15.5 4.5,20 10,20 C15.5,20 20,15.5 20,10 C20,4.5 15.5,0 10,0 L10,0 Z M8,15 L3,10 L4.4,8.6 L8,12.2 L15.6,4.6 L17,6 L8,15 L8,15 Z" id="Shape"/>
          </svg>
          <svg version="1.1" viewBox="0 0 512 512" class="error">
            <path d="M256,33C132.3,33,32,133.3,32,257c0,123.7,100.3,224,224,224c123.7,0,224-100.3,224-224C480,133.3,379.7,33,256,33z    M364.3,332.5c1.5,1.5,2.3,3.5,2.3,5.6c0,2.1-0.8,4.2-2.3,5.6l-21.6,21.7c-1.6,1.6-3.6,2.3-5.6,2.3c-2,0-4.1-0.8-5.6-2.3L256,289.8   l-75.4,75.7c-1.5,1.6-3.6,2.3-5.6,2.3c-2,0-4.1-0.8-5.6-2.3l-21.6-21.7c-1.5-1.5-2.3-3.5-2.3-5.6c0-2.1,0.8-4.2,2.3-5.6l75.7-76   l-75.9-75c-3.1-3.1-3.1-8.2,0-11.3l21.6-21.7c1.5-1.5,3.5-2.3,5.6-2.3c2.1,0,4.1,0.8,5.6,2.3l75.7,74.7l75.7-74.7   c1.5-1.5,3.5-2.3,5.6-2.3c2.1,0,4.1,0.8,5.6,2.3l21.6,21.7c3.1,3.1,3.1,8.2,0,11.3l-75.9,75L364.3,332.5z"/>
          </svg>
          <svg version="1.1" viewBox="0 0 22 21" class="warning">
            <path d="M0,19 L22,19 L11,0 L0,19 L0,19 Z M12,16 L10,16 L10,14 L12,14 L12,16 L12,16 Z M12,12 L10,12 L10,8 L12,8 L12,12 L12,12 Z"/>
          </svg>
          <svg viewBox="0 0 48 48" class="info">
            <path d="M0 0h48v48h-48z" fill="none"/>
            <path d="M24 4c-11.05 0-20 8.95-20 20s8.95 20 20 20 20-8.95 20-20-8.95-20-20-20zm2 30h-4v-12h4v12zm0-16h-4v-4h4v4z"/>
          </svg>
          <p></p>
          <input type=button value="×" data-cmd="close">
        </div>
      </template>
      <div id="body"></div>
    `;
  }
  connectedCallback() {
    this.shadowRoot.addEventListener('click', e => {
      if (e.target.dataset.cmd === 'close') {
        e.target.closest('div').remove();
      }
    });
  }
  notify(content = 'Empty', type = 'info', timeout = 10000) {
    const t = this.shadowRoot.querySelector('template');
    const clone = document.importNode(t.content, true);
    const div = clone.querySelector('div');
    div.classList.add(type);
    clone.querySelector('p').textContent = content;

    this.shadowRoot.getElementById('body').append(clone);
    // div.scrollIntoView();

    setTimeout(() => div.remove(), timeout);
  }
  clean() {
    this.shadowRoot.getElementById('body').textContent = '';
  }
}
customElements.define('notification-view', NotificationView);
