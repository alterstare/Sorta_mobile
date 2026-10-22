# Sorta 모바일 — handoff

Android app (Capacitor + React + TS + zustand, same setup as Halftone 모바일 at
`Desktop/code/MangaManagerMobile`) that shows what **Sorta (PC, `Desktop/code/sorta`)**
sorted, from a NAS over **WebDAV**. No classification on the phone (no models).
Repo: `alterstare/Sorta_mobile`. Commits: subject-only, **no Claude trailer**.

## How it works

- PC Sorta writes `<정리 폴더>/.sorta/library.sortapack` (gzip JSON, pack v2: games,
  소속, characters, every picture's 분류 결과; `roots` + `files[].r` = pictures still in
  a 원본 폴더, e.g. waiting for review) and `.sorta/thumbs/<sha256>.webp` (미리 보기).
  Types: `src/shared/pack.ts` (copy of the desktop shape).
- The phone reads that file (`backend/api.ts` → `fetch(rawUrl)` + DecompressionStream)
  into `backend/model.ts` (tree / image list / review queue / 조직도 — ports of desktop
  `core/library.ts`, `review.ts`).
- Changes on the phone = `MobileEdit`s (`src/shared/mobile.ts`, **identical file in
  the desktop repo — change both**): applied to the model at once, journaled in
  localStorage, written ~2.5s later as `<정리 폴더>/.sorta/mobile/<device>-<ms>.json`
  (`backend/edits.ts`). PC Sorta applies + deletes them (desktop `core/mobile.ts`,
  checked every 15s). On load the journal is re-laid over the file except entries whose
  file is gone and that are older than the file's `createdAt`.
  Image edits carry the whole state (chars incl. pending + candidates, kind, 단체, rating,
  fav, stars, groups) so undo = the previous state as a new edit.
- Phone-only: 올리기 (`backend/upload.ts`): phone folder → NAS folder (skip same name +
  size, else "name (2).ext"); 올린 그림 삭제 deletes on the phone only what the NAS
  has with the same size (re-checked).
- PC 원본 폴더 (UNC) ↔ NAS path mapping: 설정 › 원본 폴더 연결 (`settings.roots`, guess
  = UNC minus host).

## Native (`android/app/src/main/java/com/alterstare/sorta`)

`SortaPlugin` (JS name `Sorta`, wrapper `backend/native.ts`), `SortaWebViewClient`
(`https://localhost/_s/{img|th|lth|raw}/<b64url>` — NAS pictures via `ImgCache` LRU,
미리 보기 with fallback made from the original), WebDAV = `Vfs` / `WebDavFs` / `NasStore`
(passwords in EncryptedSharedPreferences) copied from Halftone 모바일 (SMB dropped).

## UI (`src/renderer/src`)

Desktop Sorta renderer adapted: top bar ☰ · 라이브러리 · 관리 … 올리기 · 설정 (icons
only); ☰ = 검토 entries + the tree (`MenuDrawer`); library = search (+ sort icon) /
↑↓ · 전체 · 즐겨찾기 … + (bottom sheet: 분류 · 그룹 · 보기 · 마스킹); grid only, 작은 3 /
보통 2 / 큰 1 columns per 420px; long press = selection. 크게 보기 / 검토 per the
user's spec (`Viewer.tsx`, `Review.tsx`: swipe left 건너뛰기, right 확정; candidates
2.5 rows). 관리: 캐릭터 (이름 · 소속) and 소속 (indented tree, 미지정 sticky, tap to
assign, add / rename). Phone styles: `mobile.css` (after the desktop `styles.css`).
Android back: `touch.ts` `useBack` stack → App.

## Build / test

```
npm run typecheck
npm run sync                       # vite build + cap sync android
cd android && JAVA_HOME=~/.jdks/jdk-21.0.12.1+1 ./gradlew.bat assembleDebug
```
Emulator test NAS: `.scratch/gen.mjs` (fake library) + `.scratch/dav.mjs` (WebDAV
:8765, test/test → app at `http://10.0.2.2:8765/`), `.scratch/cdp.mjs` evaluates JS in
the WebView after `adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>`.
Not done yet: release signing / auto-update, app icon.
