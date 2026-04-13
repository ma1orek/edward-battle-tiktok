# 🤖 Edward Warchocki Battle Royale — TikTok Live Game

Interaktywna gra Battle Royale dla TikTok Live. Widzowie tapiący serduszka i wysyłający gifty generują postacie, które walczą na ekranie. Edward (robot) komentuje na żywo.

## Instalacja

```bash
cd tiktok-live-game
npm install
```

## Uruchomienie

```bash
# Domyślnie łączy się z @edwardwarchocki
node server.js

# Lub inny username:
TIKTOK_USERNAME=innyuser node server.js
```

Otwórz w przeglądarce: **http://localhost:3000**

## Test bez TikTok Live (mock events)

Server wystawia endpointy do testowania:

- `http://localhost:3000/test/like` — symuluje 1 lajka (spawn postać)
- `http://localhost:3000/test/gift/rose` — Rose gift (damage boost)
- `http://localhost:3000/test/gift/mic` — Mic gift (double damage)
- `http://localhost:3000/test/gift/galaxy` — Galaxy gift (instant win)
- `http://localhost:3000/test/spam` — spam 50 lajków (stress test)
- `http://localhost:3000/status` — status połączenia

Otwórz `index.html` w jednej karcie, w drugiej kliknij `/test/spam` — zobaczysz całą walkę.

## Mechanika

| Akcja widza | Efekt w grze |
|---|---|
| ❤️ Pierwszy lajk | Spawn postaci z avatarem widza |
| ❤️ Kolejne lajki | Heal +5 HP |
| 🌹 Rose (1 coin) | Damage boost +50% przez 10s |
| 🎤 Mic (99 coin) | Double damage 30s + 50 max HP |
| 🌌 Galaxy (1000+ coin) | INSTANT WIN |
| 💬 "ATAK" / "GO" w czacie | Speed boost 5s |
| 👤 Follow | Shield 8s |
| 🔄 Share | +50 max HP |

## Konfiguracja OBS

1. Otwórz **OBS Studio**
2. Dodaj nowe źródło → **Browser Source** (Źródło przeglądarki)
3. URL: `http://localhost:3000`
4. Resolution: `1080 x 1920` (vertical TikTok) lub `1920 x 1080` (horizontal)
5. ✅ Refresh browser when scene becomes active
6. Custom CSS (opcjonalnie, dla transparentnego tła):
   ```css
   body { background: transparent !important; }
   ```

## Streamowanie na TikTok Live

### Opcja A: TikTok Live Studio (oficjalna)
- Wymaga 1000+ followers (Edward ma 200K → OK)
- Pobierz: https://www.tiktok.com/live/creator-tools
- Dodaj OBS Virtual Camera jako źródło wideo
- "Go Live"

### Opcja B: OBS + RTMP key
- Włącz w OBS Settings → Stream → Custom
- Server: `rtmp://...` z TikTok
- Stream key: z TikTok Live Studio

## Gameplay tip dla Edwarda

1. Edward streamuje grę typu **GTA V**, **Minecraft** lub po prostu siebie chodzącego po pokoju
2. Battle Royale jest jako **overlay** na 1/3 ekranu
3. Edward mówi: *"Tapcie serduszka żeby zagrać! Rose = damage boost! Galaxy = instant win!"*
4. Komentuje na bieżąco co się dzieje: *"OOO Janek dostał Rose, jego robot będzie miał double damage!"*
5. Po każdej rundzie ogłasza zwycięzcę

## Architektura

```
TikTok Live (@edwardwarchocki)
    ↓ Webcast WebSocket
Node.js (server.js)
    ↓ Socket.io
HTML5 Canvas (game.js)
    ↓ OBS Browser Source
OBS Studio
    ↓ RTMP / Live Studio
TikTok Live (Edward streamuje)
```

## Troubleshooting

**Backend nie łączy się z TikTok Live**
- Sprawdź czy Edward FAKTYCZNIE jest na live
- TikTok-Live-Connector to reverse-engineered API — czasem wymaga aktualizacji
- W server.js spróbuj `npm update tiktok-live-connector`

**Gra laguje przy dużej liczbie graczy**
- Limit MAX_PLAYERS w `game.js` = 60. Zmniejsz jeśli trzeba.

**Lajki nie zawsze działają**
- TikTok przy dużych live'ach nie wysyła KAŻDEGO lajka — to znane ograniczenie API.

## Cost
- **0 PLN** — wszystko free, open source.
- Działa lokalnie na PC Edwarda podczas live'a.
