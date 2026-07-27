# edward-battle-tiktok — Claude context

REALNY backend live'ów TikToka Edwarda Warchockiego (MERA Robotics). Node +
socket.io + `tiktok-live-connector` v2 (CommonJS). Ten plik czyta Claude Code —
także sesje CHMUROWE z telefonu (claude.ai/code), które są tu pełnoprawnym
trybem pracy.

## Deploy
- **Push na `master` = auto-deploy na Render** (serwis `edward-battle-backend`,
  srv-d7eloj77f7vs73d94j0g, URL https://edward-battle-backend.onrender.com).
- Deploy restartuje połączenie z TikTokiem — na trwającym live komentarze
  przestają spływać na ~1-2 min; front (LivePanel) ma auto-reconnect, ale
  najlepiej deployować MIĘDZY live'ami.
- Health-check: `GET /health` (uptimeSec, sessions, events).

## Architektura (server.js — jeden plik)
- Multi-tenant: `POST /robot/:robotId/connect/:username`, `/disconnect`,
  `GET /robot/:robotId/status`; socket.io room per robot, eventy
  `robot:<rid>:chat|like|gift|follow|member|stats|status`.
- Like'i: bufor + flush co 500 ms; **resync z `fetchRoomInfo()` co 10 s**
  (autorytatywne like_count — bez tego licznik odjeżdżał tysiące w tył).
- Klienci frontowi: LivePanel (merarobotics /admin i /edward) + /ekran
  (licznik serduszek) — kontrakt eventów NIE zmieniać bez zmiany frontu.
- sessionId TikToka: env `TIKTOK_SESSION_ID` lub Supabase secret
  `tiktok_session_id` (odświeżany co 10 min). Sign server: EulerStream
  (`SIGN_API_KEY` w env Render).

## Uwagi
- **Licencja biblioteki**: `tiktok-live-connector` od 2026-07-12 jest na
  zmodyfikowanym AGPL — użycie własne OK (§18), ale NIE wolno na tym oprzeć
  sprzedawanego SaaS/API bez publikacji źródeł (§19). Przed wpięciem ingestu
  do produktu MERA OS dla klientów — decyzja licencyjna.
- Jesteśmy przypięci do `2.1.1-beta1` (CommonJS). Aktualna linia (`2.4.x`) to
  przepisany ESM-only (Node ≥20) z breaking changes — migracja to osobne,
  świadome zadanie, nie „przy okazji".
- Graceful shutdown (SIGTERM) jest ważny — Render recykluje kontenery, a zbyt
  szybkie ubicie połączeń wpada w rate-limit EulerStream.
