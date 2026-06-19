# Arena Rangers

A browser shooting game with character classes, Google sign-in, local solo fallback, and optional Node/WebSocket multiplayer.

## Files for GitHub

The deployable web files are now in this folder root:

- `index.html`
- `styles.css`
- `game.js`

For GitHub Pages, publish this `outputs` folder or copy these three files to your repository root.

GitHub Pages can host the game UI and solo mode. It cannot run the Node multiplayer server. For multiplayer, run `npm start` on a server that supports Node.js and WebSockets.

## Google Login

1. Create a Google OAuth Web client ID in Google Cloud Console.
2. Add your site origins, for example:
   - `http://localhost:3000`
   - `https://YOUR_USERNAME.github.io`
3. Open `game.js`.
4. Replace:

```js
const GOOGLE_CLIENT_ID = "PASTE_YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com";
```

with your real client ID.

The game uses Google Identity Services in popup mode. The browser receives a Google ID token and uses the profile name as the callsign. For a production account system, verify that token on your backend.

## Local Multiplayer

```powershell
npm start
```

Then open:

```text
http://localhost:3000
```

Open the same URL in multiple browser windows, or on other devices on the same network using the host computer's LAN IP address.

## Controls

- Move: `WASD` or arrow keys
- Aim: mouse
- Shoot: mouse click or `Space`

## Characters

- Vanguard: sturdy all-round fighter
- Striker: faster firing skirmisher
- Medic: balanced support fighter
- Phantom: fast, fragile duelist
