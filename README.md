# QueueCure V10 Stable

Two-page QueueCure prototype with reception-controlled privacy/language settings.

## Run

```bash
npm install
npm run install:all
npm run dev
```

Open:
- Reception: http://localhost:5173/reception
- Waiting: http://localhost:5173/waiting

## Important
This stable build removes `lucide-react` to avoid the unresolved import issue on Windows/Vite. Icons are replaced with lightweight emoji icons, so install is more reliable.
