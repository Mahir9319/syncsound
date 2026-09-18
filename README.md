# SyncSound 2.0 — Internet version

This version removes the same-Wi-Fi requirement. The laptop/server only needs a public HTTPS URL. Phones can be on mobile data, different Wi-Fi networks, etc.

## Local test
Install Node.js, then in this folder:
```bash
npm install
npm start
```
Open http://localhost:3000 on the laptop.

For phones over the internet, deploy this Node app to a service that provides a public HTTPS URL (for example Render, Railway, or another Node hosting provider). The same server serves the website and WebSocket, so you do NOT need Netlify.

## Flow
1. Host opens the public URL and taps Create Room.
2. Host gets a room code and QR.
3. Phones scan the QR (or open the URL) and join.
4. Host selects an audio file. The server temporarily stores it in RAM and makes it available to room members.
5. Phones preload the file.
6. Host taps Play. Server sends a common future start time and playback position.

## Important limitations
- This is a prototype. The server keeps uploaded audio in memory; restarting the server removes it.
- Maximum upload size is 50 MB.
- Internet latency and phone audio hardware mean "same millisecond" cannot be guaranteed. The future-timestamp design reduces noticeable timing differences.
- Autoplay policies can block playback until a user has interacted with the page. If a phone refuses to start automatically, tap Play on that phone after joining.
- Do not upload/distribute music you do not have the rights to use. Spotify audio is not captured or redistributed.
