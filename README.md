# Arena Rangers

A browser shooting game with character classes, guest callsigns, solo fallback, and optional Node/WebSocket multiplayer.

## GitHub Pages Link

Upload these files to your GitHub repository:

- `index.html`
- `styles.css`
- `game.js`

Then enable GitHub Pages for the repo. Your friend can open the GitHub Pages link and play the game.

Important: GitHub Pages is static hosting. It can show the game page, but it cannot run the multiplayer WebSocket server. Without a hosted Node server, the GitHub link runs in solo mode.

## Make Friends Play With You Online

For real multiplayer, deploy the whole `outputs` folder to a Node host such as Render, Railway, Fly.io, or a VPS. The host must run:

```powershell
npm start
```

Then share that hosted app link with your friend. That is the easiest multiplayer link.

If you still want GitHub Pages for the frontend and a separate backend server, open `game.js` and set:

```js
const MULTIPLAYER_SERVER_URL = "wss://YOUR-NODE-SERVER.example.com";
```

Use `wss://` for HTTPS sites.

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
