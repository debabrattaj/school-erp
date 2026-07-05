# Floating "Ask Now" Chat Widget — Setup Notes

## Two ways to install

### Option A: re-extract the zip (easiest)
`school-erp-updated.zip` has everything already in place. Back up your `.db`
files first if you've created local data, extract, restore the `.db` files,
restart both servers.

### Option B: manual edit (if you'd rather not re-extract)
Two brand-new files, copy them in as-is:
- `ChatWidget.jsx` → `frontend/src/components/ChatWidget.jsx`
- `FloatingAssistant.jsx` → `frontend/src/components/FloatingAssistant.jsx`

Two files that need small edits — replace with the versions here:
- `App.jsx` — imports `FloatingAssistant` and renders it inside
  `ProtectedLayout`, right after the sidebar/main area.
- `Assistant.jsx` (in `pages/`) — now just reuses `<ChatWidget />` so the full
  page and the floating popup share one implementation. If you want to keep
  a diff of only what changed, search for `FloatingAssistant` in App.jsx.

No backend changes at all — this reuses the existing `/chatbot/ask` endpoint.

## What you'll see
Once logged in, a blue **"Ask Now"** pill button floats at the bottom-right
corner on every page. Click it to open a chat popup (380px wide, docked
bottom-right); click the X or the button again to close it. The full
`/assistant` page in the sidebar still exists too — same chat, bigger view.

It only appears once logged in (the Login page is outside `ProtectedLayout`,
so it won't show on the login screen).

## Verified
- `npm run build` passes
- Confirmed the widget mounts inside `ProtectedLayout` only, not on `/login`
- Same chatbot logic (and same security rules) as the full-page Assistant —
  nothing new to re-test on the backend side
