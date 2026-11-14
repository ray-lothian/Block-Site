# Redirect Inspector

Self-contained redirect inspector for the Block Site extension. It is wired into
the project through four small seams; everything else lives in this folder.

## Use

1. Right-click the page background, or right-click the extension's toolbar
   button, and choose **Track redirects in this tab**.
2. The first time, the extension asks for the optional `webRequest` permission.
   Chrome and Firefox grant this permission silently because it has no warning.
3. A small window opens, centered over the tracked tab's browser window. Its
   header shows a **Recording** status and explains that tracking lives as long
   as the window: closing the window stops tracking, and the window closes
   automatically when the tracked tab closes.
4. The window records every top-level navigation, including HTTP 3xx hops,
   JS/meta redirects, and committed URL changes.
5. Each row shows the time, the hostname, and the full URL. **Block** adds the
   exact hostname to the block list (in reverse mode it removes the host from
   the whitelist instead).
6. Closing the window stops tracking; nothing is persisted.

Both menu entries can be hidden from the extension's options page
(`contextmenu-redirect-inspector` and
`contextmenu-redirect-inspector-action`).

Tracking is not retroactive: open the window before navigating to see a chain.

## Project seams

- `manifest.json` / `manifest-firefox.json`: `optional_permissions: ["webRequest"]`
- `worker.js`: `importScripts('data/redirect-inspector/background.js')`
- `manifest-firefox.json`: `data/redirect-inspector/background.js` in
  `background.scripts`
- `contextmenu.js`: calls `redirectInspector.build({page, action})` when
  rebuilding menus and `redirectInspector.open(tab)` for both menu-item ids
  (`redirect-inspector` for pages and `redirect-inspector-action` for the
  toolbar button). The build call is required because the project uses
  `chrome.contextMenus.removeAll()`.

The inspector page uses the existing `block-host` / `remove-hosts` messages, so
the master-password rules and block-list bookkeeping stay in one place.
