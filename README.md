# EBMS – Equipment Borrowing & Monitoring System (Barangay Camp Tinio)

## Run in VS Code
1. Put all files in one folder, e.g. `ebms/`, then **File → Open Folder…**
2. Install the **Live Server** extension (Ritwick Dey).
3. Right-click `index.html` → **Open with Live Server**.

(Opening `index.html` directly in a browser also works; no build step needed.)

## Files
| File | Role |
|---|---|
| `index.html` | Page markup only |
| `styles.css` | All styling |
| `store.js` | Data layer – the only file that touches storage (`localStorage`, key `ebms.camptinio.v1`) |
| `ui.js` | Rendering functions (read-only from Store) |
| `app.js` | Navigation, button actions, startup |

Scripts load in this order: `store.js` → `ui.js` → `app.js`.

## Adding a database later
Every read/write goes through `Store`. To use a real database, keep the same
method names but have them call an API (e.g. `fetch('/api/requests')`) and make
the methods `async`; then add `await` in `app.js` where they're called.
Good options: Node + Express + SQLite, or Firebase/Supabase.

## Behaviour changes vs. the single-file version
- Data now persists across page reloads.
- "In use" and "Available" are computed from Approved requests (no hard-coded numbers).
- Submitting/approving is blocked if the quantity exceeds what is available.
- Reports and public availability update from real data; added items appear in the request form.
- Added a "Lost" action for approved requests and a "Reset Demo Data" button.
- User-entered text is HTML-escaped.

## Admin login
Default credentials are set at the top of `store.js` (`ADMIN`): username `admin`, password `camptinio2024`. **Change them before use.**
This login runs in the browser, so it only keeps casual visitors out; anyone who opens the page source can read it. Real protection needs a server/database.

## Terms and Conditions
A Terms and Conditions screen with a checkbox appears first on every new visit (remembered for the browser session). The Continue button stays disabled until the box is ticked, and the request form can't be opened or submitted without acceptance. The wording is a draft — edit it in `index.html` (`#terms-overlay`) to match the barangay's actual policy.
