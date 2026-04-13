# Deploy Edward Battle

## Architektura deploymentu

Gra ma dwie części:
- **Frontend** (public/) — statyczne pliki → **Netlify**
- **Backend** (server.js) — Node.js z persistent WebSocket do TikTok → **Render.com** (Netlify nie obsługuje persistent connections)

## Krok 1: Backend na Render.com (FREE tier)

1. Załóż konto na https://render.com (darmowe, przez GitHub)
2. New → Web Service → Connect GitHub repo
3. Wybierz ten folder
4. Ustawienia:
   - **Build command:** `npm install`
   - **Start command:** `node server.js`
   - **Environment variables:**
     - `EULER_API_KEY` = `euler_YWM1NGE3ZWQwYTA3ZGJiMjI2Y2M2MDU1ZWI3ODk1YzM2MDVjZTk0ODYxNGJmM2M5YWQ3NWFm`
5. Deploy → skopiuj URL (np. `https://edward-battle-backend.onrender.com`)

**Alternatywa:** Railway.app, Fly.io, Heroku (wszystkie działają identycznie)

## Krok 2: Frontend na Netlify

### Sposób A — Drag & drop (najszybszy)
1. Otwórz https://app.netlify.com/drop
2. Przeciągnij folder `public/` na stronę
3. Gotowe — dostajesz URL typu `https://random-name.netlify.app`

### Sposób B — Netlify CLI
```bash
npm install -g netlify-cli
cd tiktok-live-game
netlify deploy --prod --dir=public
```

### Sposób C — GitHub auto-deploy
1. Push ten folder na GitHub
2. New site from Git → wybierz repo
3. Publish directory: `public`
4. Deploy

## Krok 3: Połącz frontend z backendem

Po deploymencie otwórz frontend z parametrem:
```
https://twoja-gra.netlify.app/?backend=https://edward-battle-backend.onrender.com
```

Lub w konsoli przeglądarki:
```javascript
localStorage.setItem('backendUrl', 'https://edward-battle-backend.onrender.com');
```

Potem odśwież — zapamięta backend URL.

## Test

1. Otwórz URL Netlify
2. Wpisz username TikTok (np. `edwardwarchocki`)
3. Jak Edward jest live → połączy się automatycznie, prawdziwe lajki z TikToka
4. Jak offline → tryb TEST, klikaj przyciski ⚙ do spawnowania graczy

## Koszty

- **Netlify free tier** — 100GB bandwidth/mc, 300 build min/mc (wystarczy)
- **Render free tier** — 750h/mc (też wystarczy, ale uspi po 15 min nieaktywności — pierwszy request po przerwie trwa ~30s)

**Pro tip:** Jak chcesz zero-cold-start → Railway.app $5/mc (nigdy nie usypia).
