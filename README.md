# 萬能圖片轉檔 & 影片轉 GIF 剪輯室

100% 瀏覽器端運算（無需後端伺服器），可直接部署到 **GitHub Pages**！

## 🚀 如何部署到 GitHub Pages

1. 在 GitHub 建立一個新的 Repository（公開或私人皆可）。
2. 將本專案（或直接只上傳 `docs/` 裡面的所有檔案）推送到 GitHub：
   ```bash
   git init
   git add .
   git commit -m "Add Universal Media Converter for GitHub Pages"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/<Repo名稱>.git
   git push -u origin main
   ```
3. 打開 GitHub Repo 頁面 → **Settings** → **Pages**：
   - **Source** 選擇 `Deploy from a branch`
   - **Branch** 選擇 `main`，資料夾選擇 **`/docs`** → 點擊 **Save**
4. 等待約 1~2 分鐘，即可在 `https://<你的帳號>.github.io/<Repo名稱>/` 使用！

> 如果你只把 `docs/` 裡面的檔案直接放在 Repo 根目錄，Branch 資料夾選擇 `/ (root)` 即可。

## ✨ 功能特色

- **圖片萬能轉檔**：支援 PNG, JPG, WEBP, AVIF, GIF, HEIC/HEIF, TIFF, BMP, ICO, SVG, PSD, TGA, DDS, EXR, PPM 等輸入，可批次輸出 PNG / JPG / WEBP / AVIF / GIF / ICO (多尺寸) / BMP / TIFF / PDF / TGA / PPM，並支援一鍵打包 `.ZIP`。
- **影片轉 GIF 剪輯室**：支援 MP4, MOV, MKV, AVI, WEBM, FLV, WMV, GIF 等，內建時間軸縮圖與雙拉桿精準選取片段，採用單執行緒 `ffmpeg.wasm`（免 COOP/COEP Header，完美相容 GitHub Pages），支援 2-Pass 高畫質調色盤、FPS / 寬度 / 速度 / 倒放 / Boomerang 效果。
- **隱私安全**：所有轉檔皆在訪客自己的瀏覽器本機記憶體完成，不會上傳任何檔案到伺服器。
