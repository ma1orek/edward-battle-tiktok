# 🤖 Edward Warchocki Battle Live

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ma1orek/edward-battle-tiktok)

Interaktywna gra TikTok Live: widzowie tapiący serduszka spawnują kolorowe bąbelki, które malują ekran. Największe pokrycie wygrywa.

## Deploy 24/7

### Frontend → Netlify (już deployed)
**https://inspiring-paletas-577eda.netlify.app**

### Backend → Render.com (one-click deploy)

1. Kliknij: **[Deploy to Render](https://render.com/deploy?repo=https://github.com/ma1orek/edward-battle-tiktok)**
2. Zaloguj się GitHub → Allow Render
3. Nazwa: `edward-battle-backend`
4. Build: `npm install` | Start: `node server.js`
5. Env var `EULER_API_KEY` = `euler_YWM1NGE3ZWQwYTA3ZGJiMjI2Y2M2MDU1ZWI3ODk1YzM2MDVjZTk0ODYxNGJmM2M5YWQ3NWFm`
6. Deploy (2-3 min)
7. Skopiuj URL typu: `https://edward-battle-backend.onrender.com`

### Połącz frontend z backendem

Otwórz:
```
https://inspiring-paletas-577eda.netlify.app/?backend=https://edward-battle-backend.onrender.com
```

Lub w konsoli przeglądarki:
```javascript
localStorage.setItem('backendUrl', 'https://edward-battle-backend.onrender.com');
```

## Alternatywy dla Render (always-on)

- **Fly.io** — 3 free instances, zawsze online
- **Railway** — $5 credit/mc free
- **Heroku** — payed only

Render free tier usypia po 15 min bezczynności (wakeup ~30s). Jak Edward robi live codziennie, to nie problem.

## Lokalne uruchomienie (dev)

```bash
cd tiktok-live-game
npm install
node server.js
```

Otwórz http://localhost:3000
