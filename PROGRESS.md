# Project Progress

## ✅ Completed
- Preview & thumbnail generation APIs (thumbnail + preview) for images/videos ✅
- Upload chunk size set to 5MB ✅
- Frontend uploads refactored to chunk-per-request with accurate progress (per chunk) ✅

## 🔄 In Progress
- Video cover frame extraction (needs ffmpeg or external service) ⏳
- Progressive image loading (blur tiny -> preview -> full) ⏳
- Navbar upload list with pause/resume/cancel controls ✅ (basic), refine with retry/backoff ⏳

## 📌 Next Steps
- Implement BlurHash or tiny JPEG for instant placeholders
- Add caching headers and client-side cache for thumbnails/previews
- Optimize lazy-loading in grid/list views
- Optionally integrate ffmpeg for real video first frame