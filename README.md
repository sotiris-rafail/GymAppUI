# Foundry gym calendar: UI

The browser UI for the gym calendar. It is a separate project from the backend and talks to it over HTTP.
Plain HTML, CSS and JavaScript, no build step and no dependencies.

    foundry-gym-ui/
      index.html    page shell
      styles.css    all styling (light and dark)
      app.js        the app: login, member calendar and booking, admin screens
      i18n.js       English and Greek texts
      config.js     where the backend lives
      server.js     small local web server for development

## Run it

1. Start the backend (from the `foundry-gym-backend` folder):

        mvn spring-boot:run

   It listens on http://localhost:8080.

2. Start the UI (from this folder, needs Node 18 or newer):

        npm start

   Use `npm start` (or `npm run dev`). A bare `npm run` only prints the list of scripts and starts
   nothing. Leave the window open while you use the app. You should see
   `Foundry gym UI is running. Open http://localhost:5173`.

3. Open http://localhost:5173.

Demo logins (created by the backend on its first start):

| Login  | Email               | Password    |
|--------|---------------------|-------------|
| Admin  | admin@foundry.gym   | admin123    |
| Member | alex@demo.gym       | member123   |

If the backend is not running, the page says so and shows the address it tried.

## Plans are assigned by the admin

Members only see their plan (name, price, visits and usage); they cannot choose or change it. The admin assigns,
replaces or removes a plan for each member in the Members section. A member has one plan, or none, at a time.
The backend enforces this: members have no endpoint to change a plan.

## Admin pages

The admin screen has three pages, each with its own address so Back, reload and bookmarks work:

* `#/plans`: subscription plans (name, price, visits per month).
* `#/schedule`: classes (max people, days) and the weekly timetable.
* `#/members`: assign each member's plan, a **History** button per member (every plan they have held with dates, and
  visits used in each month), and **Class attendance** for the current month: every class with who is booked on which
  date (sessions that have already happened show as attended).

## Saving on the admin pages

Edits on the Plans, Schedule and Members pages are drafts. Nothing is sent to the server until the admin presses **Save changes** at the bottom of that page. A dialog then lists every change (new, changed, removed) with **Cancel** and **Save**. **Discard changes** throws the page's draft away. A dot on a tab marks a page with unsaved changes, drafts survive switching between pages, and the browser warns before leaving or logging out with unsaved changes.

Saving sends one request per change, so it is not atomic. If one fails, the dialog stays open with the reason, the changes that did succeed are kept, and the rest remain as the draft. Plans that are new and unsaved cannot be assigned to members until they are saved.

## Languages

The EN / ΕΛ switch in the top right changes the whole page between English and Greek. The choice is
remembered in the browser; the first visit follows the browser language (Greek browsers start in Greek).
All texts live in `i18n.js`. To add a language, copy the `en` block there under a new code and add it to `LANGS`.
Error messages from the backend arrive in English; the common ones are translated in the `server` table of
`i18n.js`, any other message is shown as received. Plan and class names are whatever the admin typed.

## Themes

The look follows Material Design 3 (tonal colors, rounded buttons and cards, outlined text fields, segmented buttons, filter chips, snackbar, Roboto from Google Fonts with a system fallback). There is a light theme (white, yellow fills, black text and outlines) and a dark theme (black, white text, yellow accents). The first visit follows the system setting; the sun/moon
button in the header switches and remembers the choice. The colors are variables at the top of `styles.css`.

## Changing addresses

* **Backend address.** By default the UI calls port 8080 on the same host name as the page
  (open `http://localhost:5173`, it calls `http://localhost:8080`). To point somewhere else, edit
  `config.js` and set `window.FOUNDRY_API_BASE = 'http://localhost:9090';`.
* **UI port.** `PORT=3000 npm start` (Windows PowerShell: `$env:PORT=3000; npm start`). The backend only accepts browser calls from known UI addresses, so
  start it with the new one too:

        GYM_CORS_ORIGINS=http://localhost:3000 mvn spring-boot:run

  The backend allows `http://localhost:5173` and `http://127.0.0.1:5173` out of the box.
* **No Node?** Any static file server works, for example `python3 -m http.server 5173` in this folder.

## How the connection works

The UI and backend run on different ports, so the browser treats them as different origins. The backend
sends CORS headers that allow the UI's address and allow cookies, and the UI sends every request with
`credentials: 'include'` so the login session cookie travels with it.

Browsers treat `localhost:5173` and `localhost:8080` as the same site, which is why the backend's
`SameSite=Lax` session cookie works. Keep the page and the backend on the same host name: open the UI at
`localhost` when the backend is at `localhost`, or `127.0.0.1` with `127.0.0.1`, not a mix.

Hosting the UI and backend on different domains later needs the session cookie set to
`SameSite=None; Secure` (HTTPS) on the backend, or a reverse proxy that puts both under one domain.
