/**
 * 100% Client-Side Universal Media Conversion Engine
 * Designed for GitHub Pages (zero backend, zero COOP/COEP headers required).
 */

const FFMPEG_CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/umd';

let ffmpegInstance = null;
let ffmpegLoadingPromise = null;
let ffmpegProgressCb = null;

async function fetchAsBlobURL(url, mimeType) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`無法載入元件: ${url} (${resp.status})`);
  const buf = await resp.arrayBuffer();
  return URL.createObjectURL(new Blob([buf], { type: mimeType }));
}

/**
 * Lazy-load single-threaded ffmpeg.wasm (works on GitHub Pages without SharedArrayBuffer)
 */
async function ensureFFmpeg(onStatus) {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadingPromise) return ffmpegLoadingPromise;

  ffmpegLoadingPromise = (async () => {
    if (!window.FFmpegWASM || !window.FFmpegWASM.FFmpeg) {
      throw new Error('FFmpeg 模組尚未載入，請檢查網路連線並重新整理');
    }
    if (onStatus) onStatus('正在載入 FFmpeg 引擎（首次使用約需下載 31 MB，之後會由瀏覽器快取）...');

    const { FFmpeg } = window.FFmpegWASM;
    const ffmpeg = new FFmpeg();

    ffmpeg.on('progress', ({ progress }) => {
      if (typeof ffmpegProgressCb === 'function') {
        const pct = Math.min(100, Math.max(0, Math.round((progress || 0) * 100)));
        ffmpegProgressCb(pct);
      }
    });

    const coreURL = await fetchAsBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await fetchAsBlobURL(`${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm');

    await ffmpeg.load({ coreURL, wasmURL });
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  try {
    return await ffmpegLoadingPromise;
  } catch (err) {
    ffmpegLoadingPromise = null;
    throw err;
  }
}

function getExt(filename) {
  const idx = (filename || '').lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

function getBaseName(filename) {
  const idx = (filename || '').lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : (filename || 'output');
}

/**
 * Load a Blob/File into an HTMLImageElement
 */
function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('瀏覽器無法直接解碼此圖片'));
    };
    img.src = url;
  });
}

/**
 * Render an image source onto a Canvas with optional resize & background fill
 */
function renderToCanvas(imgOrCanvas, { width, height, fit = 'inside', bgColor = null } = {}) {
  const srcW = imgOrCanvas.naturalWidth || imgOrCanvas.width;
  const srcH = imgOrCanvas.naturalHeight || imgOrCanvas.height;

  let dstW = srcW;
  let dstH = srcH;

  if (width || height) {
    if (fit === 'fill') {
      dstW = width || srcW;
      dstH = height || srcH;
    } else if (fit === 'cover' && width && height) {
      dstW = width;
      dstH = height;
    } else {
      const scaleW = width ? width / srcW : Infinity;
      const scaleH = height ? height / srcH : Infinity;
      const scale = Math.min(scaleW, scaleH);
      dstW = Math.max(1, Math.round(srcW * scale));
      dstH = Math.max(1, Math.round(srcH * scale));
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, dstW, dstH);
  }

  if (fit === 'cover' && width && height) {
    const scale = Math.max(dstW / srcW, dstH / srcH);
    const drawW = srcW * scale;
    const drawH = srcH * scale;
    const dx = (dstW - drawW) / 2;
    const dy = (dstH - drawH) / 2;
    ctx.drawImage(imgOrCanvas, dx, dy, drawW, drawH);
  } else {
    ctx.drawImage(imgOrCanvas, 0, 0, dstW, dstH);
  }

  return canvas;
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error(`無法編碼為 ${mimeType}`));
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

/**
 * Pure JS 24-bit BMP encoder from Canvas
 */
function encodeBmpFromCanvas(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const rgba = ctx.getImageData(0, 0, w, h).data;

  const rowStride = Math.ceil((w * 3) / 4) * 4;
  const pixelArraySize = rowStride * h;
  const fileSize = 54 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // BITMAPFILEHEADER
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, 54, true);

  // BITMAPINFOHEADER
  view.setUint32(14, 40, true);
  view.setInt32(18, w, true);
  view.setInt32(22, h, true); // bottom-up
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelArraySize, true);

  for (let y = 0; y < h; y++) {
    const srcRow = (h - 1 - y) * w * 4;
    const dstRow = 54 + y * rowStride;
    for (let x = 0; x < w; x++) {
      const si = srcRow + x * 4;
      const di = dstRow + x * 3;
      bytes[di] = rgba[si + 2];     // B
      bytes[di + 1] = rgba[si + 1]; // G
      bytes[di + 2] = rgba[si];     // R
    }
  }

  return new Blob([buf], { type: 'image/bmp' });
}

/**
 * Pure JS Multi-Resolution Windows .ICO encoder (16, 32, 48, 64, 128, 256px PNG-in-ICO)
 */
async function encodeIcoFromCanvas(sourceCanvas) {
  const sizes = [16, 32, 48, 64, 128, 256];
  const pngArrays = [];

  for (const size of sizes) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const scale = Math.min(size / sourceCanvas.width, size / sourceCanvas.height);
    const dw = sourceCanvas.width * scale;
    const dh = sourceCanvas.height * scale;
    ctx.drawImage(sourceCanvas, (size - dw) / 2, (size - dh) / 2, dw, dh);

    const blob = await canvasToBlob(c, 'image/png');
    pngArrays.push(new Uint8Array(await blob.arrayBuffer()));
  }

  const count = sizes.length;
  const headerSize = 6;
  const entrySize = 16;
  const totalImageBytes = pngArrays.reduce((sum, a) => sum + a.length, 0);
  const totalSize = headerSize + count * entrySize + totalImageBytes;

  const buf = new ArrayBuffer(totalSize);
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true); // ICO
  view.setUint16(4, count, true);

  let offset = headerSize + count * entrySize;
  for (let i = 0; i < count; i++) {
    const pos = headerSize + i * entrySize;
    const size = sizes[i];
    const png = pngArrays[i];
    view.setUint8(pos, size === 256 ? 0 : size);
    view.setUint8(pos + 1, size === 256 ? 0 : size);
    view.setUint8(pos + 2, 0);
    view.setUint8(pos + 3, 0);
    view.setUint16(pos + 4, 1, true);
    view.setUint16(pos + 6, 32, true);
    view.setUint32(pos + 8, png.length, true);
    view.setUint32(pos + 12, offset, true);

    bytes.set(png, offset);
    offset += png.length;
  }

  return new Blob([buf], { type: 'image/x-icon' });
}

/**
 * Decode virtually any image File into an HTMLImageElement or HTMLCanvasElement
 */
async function decodeImageFile(file, onStatus) {
  const ext = getExt(file.name);

  // 1. HEIC / HEIF via heic2any
  if (ext === '.heic' || ext === '.heif') {
    if (!window.heic2any) throw new Error('HEIC 解碼模組未載入');
    if (onStatus) onStatus('正在解碼 HEIC/HEIF...');
    const converted = await window.heic2any({ blob: file, toType: 'image/png' });
    const pngBlob = Array.isArray(converted) ? converted[0] : converted;
    return await blobToImage(pngBlob);
  }

  // 2. TIFF via UTIF.js
  if ((ext === '.tif' || ext === '.tiff') && window.UTIF) {
    try {
      const buf = await file.arrayBuffer();
      const ifds = window.UTIF.decode(buf);
      if (ifds && ifds.length > 0) {
        window.UTIF.decodeImage(buf, ifds[0]);
        const rgba = window.UTIF.toRGBA8(ifds[0]);
        const c = document.createElement('canvas');
        c.width = ifds[0].width;
        c.height = ifds[0].height;
        const ctx = c.getContext('2d');
        const imgData = new ImageData(new Uint8ClampedArray(rgba), c.width, c.height);
        ctx.putImageData(imgData, 0, 0);
        return c;
      }
    } catch (_) {
      // Fall through to ffmpeg.wasm
    }
  }

  // 3. Try native browser decode (PNG, JPG, WEBP, GIF, AVIF, BMP, ICO, SVG)
  try {
    return await blobToImage(file);
  } catch (_) {
    // 4. Universal ffmpeg.wasm fallback (PSD, TGA, DDS, EXR, PPM, PGM, PBM, PCX, SGI, QOI, HDR, etc.)
    const ffmpeg = await ensureFFmpeg(onStatus);
    const inName = `in_${Date.now()}${ext || '.bin'}`;
    const outName = `dec_${Date.now()}.png`;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      await ffmpeg.writeFile(inName, data);
      await ffmpeg.exec(['-y', '-i', inName, '-frames:v', '1', outName]);
      const pngData = await ffmpeg.readFile(outName);
      const pngBlob = new Blob([pngData.buffer], { type: 'image/png' });
      return await blobToImage(pngBlob);
    } finally {
      try { await ffmpeg.deleteFile(inName); } catch (_) {}
      try { await ffmpeg.deleteFile(outName); } catch (_) {}
    }
  }
}

/**
 * Convert an image File to the target format 100% client-side
 */
async function convertImageClient(file, options = {}, onStatus) {
  const format = (options.format || 'png').toLowerCase().replace('jpeg', 'jpg');
  const quality = Math.min(100, Math.max(10, parseInt(options.quality, 10) || 88)) / 100;
  const width = options.width ? parseInt(options.width, 10) : null;
  const height = options.height ? parseInt(options.height, 10) : null;
  const fit = options.fit || 'inside';
  const bgColor = options.bgColor || '#ffffff';

  const decoded = await decodeImageFile(file, onStatus);
  const needsOpaqueBg = format === 'jpg' || format === 'bmp' || format === 'ppm';
  const canvas = renderToCanvas(decoded, {
    width,
    height,
    fit,
    bgColor: needsOpaqueBg ? bgColor : null
  });

  let outBlob;
  let outExt = format;

  if (format === 'png') {
    outBlob = await canvasToBlob(canvas, 'image/png');
  } else if (format === 'jpg') {
    outBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
  } else if (format === 'webp') {
    outBlob = await canvasToBlob(canvas, 'image/webp', quality);
  } else if (format === 'bmp') {
    outBlob = encodeBmpFromCanvas(canvas);
  } else if (format === 'ico') {
    outBlob = await encodeIcoFromCanvas(canvas);
  } else if (format === 'pdf') {
    if (!window.PDFLib) throw new Error('PDF 模組未載入');
    const pngBlob = await canvasToBlob(canvas, 'image/png');
    const pngBytes = await pngBlob.arrayBuffer();
    const pdfDoc = await window.PDFLib.PDFDocument.create();
    const pngImg = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([canvas.width, canvas.height]);
    page.drawImage(pngImg, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    const pdfBytes = await pdfDoc.save();
    outBlob = new Blob([pdfBytes], { type: 'application/pdf' });
  } else if (format === 'avif') {
    // Try native browser AVIF canvas encoding first
    let avifBlob = null;
    try {
      const candidate = await canvasToBlob(canvas, 'image/avif', quality);
      if (candidate && candidate.type === 'image/avif') avifBlob = candidate;
    } catch (_) {}

    if (avifBlob) {
      outBlob = avifBlob;
    } else {
      throw new Error('目前瀏覽器不支援直接編碼 AVIF，請改選 WebP 或使用 Chrome / Edge 最新版');
    }
  } else if (['gif', 'tiff', 'tga', 'ppm'].includes(format)) {
    const ffmpeg = await ensureFFmpeg(onStatus);
    const pngBlob = await canvasToBlob(canvas, 'image/png');
    const inName = `img_${Date.now()}.png`;
    const outName = `img_${Date.now()}.${format}`;
    try {
      await ffmpeg.writeFile(inName, new Uint8Array(await pngBlob.arrayBuffer()));
      if (format === 'gif') {
        await ffmpeg.exec([
          '-y', '-i', inName,
          '-filter_complex', '[0:v]split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
          outName
        ]);
      } else {
        await ffmpeg.exec(['-y', '-i', inName, outName]);
      }
      const data = await ffmpeg.readFile(outName);
      const mimeMap = {
        gif: 'image/gif',
        tiff: 'image/tiff',
        tga: 'image/x-tga',
        ppm: 'image/x-portable-pixmap'
      };
      outBlob = new Blob([data.buffer], { type: mimeMap[format] || 'application/octet-stream' });
    } finally {
      try { await ffmpeg.deleteFile(inName); } catch (_) {}
      try { await ffmpeg.deleteFile(outName); } catch (_) {}
    }
  } else {
    throw new Error(`不支援的輸出格式: ${format}`);
  }

  return {
    blob: outBlob,
    outputName: `${getBaseName(file.name)}.${outExt}`,
    format: outExt,
    outputSize: outBlob.size,
    width: canvas.width,
    height: canvas.height
  };
}

/**
 * Transcode a non-browser-playable video (MKV, AVI, FLV, WMV, etc.) into a browser-playable MP4 preview
 */
async function transcodeVideoPreviewClient(file, onStatus, onProgress) {
  const ffmpeg = await ensureFFmpeg(onStatus);
  ffmpegProgressCb = onProgress || null;
  const ext = getExt(file.name) || '.bin';
  const inName = `prev_in_${Date.now()}${ext}`;
  const outName = `prev_out_${Date.now()}.mp4`;
  try {
    if (onStatus) onStatus('此格式瀏覽器無法直接播放，正在建立預覽影片...');
    await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()));
    await ffmpeg.exec([
      '-y',
      '-i', inName,
      '-vf', 'scale=min(720\\,iw):-2',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '30',
      '-pix_fmt', 'yuv420p',
      '-an',
      '-movflags', '+faststart',
      outName
    ]);
    const data = await ffmpeg.readFile(outName);
    return new Blob([data.buffer], { type: 'video/mp4' });
  } finally {
    ffmpegProgressCb = null;
    try { await ffmpeg.deleteFile(inName); } catch (_) {}
    try { await ffmpeg.deleteFile(outName); } catch (_) {}
  }
}

/**
 * Extract filmstrip thumbnails directly in the browser using an offscreen <video> + <canvas>
 */
async function extractThumbnailsFromVideoUrl(videoUrl, duration, count = 10) {
  return new Promise((resolve) => {
    const vid = document.createElement('video');
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.src = videoUrl;

    const thumbs = [];
    const safeDur = Math.max(0.5, duration);
    const interval = safeDur / count;
    let idx = 0;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const cleanup = () => {
      vid.removeAttribute('src');
      vid.load();
    };

    vid.addEventListener('error', () => {
      cleanup();
      resolve(thumbs);
    });

    vid.addEventListener('loadeddata', () => {
      const targetW = 160;
      const ratio = vid.videoHeight ? vid.videoHeight / vid.videoWidth : 0.5625;
      canvas.width = targetW;
      canvas.height = Math.max(40, Math.round(targetW * ratio));
      seekNext();
    });

    function seekNext() {
      if (idx >= count) {
        cleanup();
        return resolve(thumbs);
      }
      const t = Math.min(safeDur - 0.05, Math.max(0, idx * interval));
      vid.currentTime = t;
    }

    vid.addEventListener('seeked', () => {
      try {
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        thumbs.push(canvas.toDataURL('image/jpeg', 0.65));
      } catch (_) {}
      idx++;
      seekNext();
    });
  });
}

/**
 * Convert selected video segment into GIF / Animated WebP / APNG 100% client-side
 */
async function convertVideoSegmentClient(file, options = {}, onStatus, onProgress) {
  const ffmpeg = await ensureFFmpeg(onStatus);
  ffmpegProgressCb = onProgress || null;

  const start = Math.max(0, parseFloat(options.start) || 0);
  const end = parseFloat(options.end);
  const clipDuration = end && end > start ? end - start : 5;
  const fps = Math.min(30, Math.max(4, parseInt(options.fps, 10) || 15));
  const width = parseInt(options.width, 10) || 480;
  const speed = Math.min(4, Math.max(0.25, parseFloat(options.speed) || 1));
  const format = (options.format || 'gif').toLowerCase();
  const colors = Math.min(256, Math.max(32, parseInt(options.colors, 10) || 256));
  const dither = options.dither || 'sierra2_4a';
  const reverse = options.reverse === true;
  const boomerang = options.boomerang === true;

  const ext = getExt(file.name) || '.mp4';
  const inName = `vid_in_${Date.now()}${ext}`;
  const outExt = format === 'apng' ? 'png' : format;
  const outName = `vid_out_${Date.now()}.${outExt}`;

  const scaleFilter = width > 0 ? `scale=${width}:-1:flags=lanczos` : 'scale=iw:ih:flags=lanczos';
  const ptsFilter = speed !== 1 ? `setpts=${(1 / speed).toFixed(4)}*PTS` : null;

  const baseChain = [`fps=${fps}`, scaleFilter];
  if (ptsFilter) baseChain.push(ptsFilter);

  try {
    if (onStatus) onStatus('正在讀取影片至記憶體...');
    await ffmpeg.writeFile(inName, new Uint8Array(await file.arrayBuffer()));

    if (onStatus) onStatus('正在渲染選取片段（使用 2-Pass 高畫質最佳化）...');

    if (format === 'gif') {
      let filterComplex;
      if (boomerang) {
        filterComplex = `[0:v]${baseChain.join(',')},split[fwd][rev_in];[rev_in]reverse[rev];[fwd][rev]concat=n=2:v=1:a=0,split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=${dither}:diff_mode=rectangle`;
      } else {
        if (reverse) baseChain.push('reverse');
        filterComplex = `[0:v]${baseChain.join(',')},split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=diff[p];[s1][p]paletteuse=dither=${dither}:diff_mode=rectangle`;
      }

      await ffmpeg.exec([
        '-y',
        '-ss', start.toFixed(3),
        '-t', clipDuration.toFixed(3),
        '-i', inName,
        '-filter_complex', filterComplex,
        '-loop', '0',
        outName
      ]);
    } else if (format === 'webp') {
      let filterComplex;
      if (boomerang) {
        filterComplex = `[0:v]${baseChain.join(',')},split[fwd][rev_in];[rev_in]reverse[rev];[fwd][rev]concat=n=2:v=1:a=0`;
      } else {
        if (reverse) baseChain.push('reverse');
        filterComplex = `[0:v]${baseChain.join(',')}`;
      }

      await ffmpeg.exec([
        '-y',
        '-ss', start.toFixed(3),
        '-t', clipDuration.toFixed(3),
        '-i', inName,
        '-filter_complex', filterComplex,
        '-vcodec', 'libwebp',
        '-lossless', '0',
        '-compression_level', '4',
        '-q:v', '80',
        '-loop', '0',
        '-an',
        outName
      ]);
    } else if (format === 'apng') {
      let filterComplex;
      if (boomerang) {
        filterComplex = `[0:v]${baseChain.join(',')},split[fwd][rev_in];[rev_in]reverse[rev];[fwd][rev]concat=n=2:v=1:a=0`;
      } else {
        if (reverse) baseChain.push('reverse');
        filterComplex = `[0:v]${baseChain.join(',')}`;
      }

      await ffmpeg.exec([
        '-y',
        '-ss', start.toFixed(3),
        '-t', clipDuration.toFixed(3),
        '-i', inName,
        '-filter_complex', filterComplex,
        '-f', 'apng',
        '-plays', '0',
        outName
      ]);
    } else {
      throw new Error(`不支援的輸出格式: ${format}`);
    }

    const data = await ffmpeg.readFile(outName);
    const mimeMap = {
      gif: 'image/gif',
      webp: 'image/webp',
      apng: 'image/apng'
    };
    const blob = new Blob([data.buffer], { type: mimeMap[format] || 'application/octet-stream' });

    return {
      blob,
      outputName: `${getBaseName(file.name)}_clip.${outExt}`,
      size: blob.size,
      format
    };
  } finally {
    ffmpegProgressCb = null;
    try { await ffmpeg.deleteFile(inName); } catch (_) {}
    try { await ffmpeg.deleteFile(outName); } catch (_) {}
  }
}

window.MediaEngine = {
  convertImageClient,
  transcodeVideoPreviewClient,
  extractThumbnailsFromVideoUrl,
  convertVideoSegmentClient
};
