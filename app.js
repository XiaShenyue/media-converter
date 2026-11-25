// ==================== Utilities ====================
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const tenths = Math.floor((sec % 1) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

const VIDEO_EXT_RE = /\.(mp4|mov|mkv|avi|webm|flv|wmv|m4v|3gp|ts|m2ts|mts|ogv|mpeg|mpg|vob|asf|f4v|rmvb)$/i;

// ==================== Tab Switching ====================
const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

function switchTab(tabName) {
  tabBtns.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabName}`);
  });
}

tabBtns.forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ==================== TAB 1: IMAGE CONVERTER ====================
const imageDropzone = document.getElementById('image-dropzone');
const imageFileInput = document.getElementById('image-file-input');
const imageQueueSection = document.getElementById('image-queue-section');
const imageQueueList = document.getElementById('image-queue-list');
const queueCountBadge = document.getElementById('queue-count-badge');
const btnConvertAll = document.getElementById('btn-convert-all');
const btnDownloadZip = document.getElementById('btn-download-zip');
const btnClearQueue = document.getElementById('btn-clear-queue');

const imgQuality = document.getElementById('img-quality');
const imgQualityVal = document.getElementById('img-quality-val');
const imgBgColor = document.getElementById('img-bgcolor');
const imgBgColorHex = document.getElementById('img-bgcolor-hex');

let selectedImageFormat = 'png';
let imageQueue = []; // { id, file, previewUrl, status, statusText, result, downloadUrl, error }

imgQuality.addEventListener('input', () => {
  imgQualityVal.textContent = imgQuality.value;
});

imgBgColor.addEventListener('input', () => {
  imgBgColorHex.textContent = imgBgColor.value;
});

document.getElementById('image-format-picker').addEventListener('click', (e) => {
  const pill = e.target.closest('.fmt-pill');
  if (!pill) return;
  document.querySelectorAll('#image-format-picker .fmt-pill').forEach((p) => p.classList.remove('active'));
  pill.classList.add('active');
  selectedImageFormat = pill.dataset.format;
});

function wireDropzone(zoneEl, inputEl, onFiles) {
  zoneEl.addEventListener('click', () => inputEl.click());
  zoneEl.addEventListener('dragover', (e) => {
    e.preventDefault();
    zoneEl.classList.add('drag-over');
  });
  zoneEl.addEventListener('dragleave', () => zoneEl.classList.remove('drag-over'));
  zoneEl.addEventListener('drop', (e) => {
    e.preventDefault();
    zoneEl.classList.remove('drag-over');
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFiles(Array.from(e.dataTransfer.files));
    }
  });
  inputEl.addEventListener('change', () => {
    if (inputEl.files && inputEl.files.length > 0) {
      onFiles(Array.from(inputEl.files));
      inputEl.value = '';
    }
  });
}

wireDropzone(imageDropzone, imageFileInput, async (files) => {
  if (files.length === 1 && (files[0].type.startsWith('video/') || VIDEO_EXT_RE.test(files[0].name))) {
    showToast('偵測到影片檔案，已自動切換至「影片轉 GIF 剪輯室」！', 'info');
    switchTab('video');
    handleVideoFileSelected(files[0]);
    return;
  }

  for (const file of files) {
    if (file.type.startsWith('video/') || VIDEO_EXT_RE.test(file.name)) {
      showToast(`「${file.name}」是影片檔，請在「影片轉 GIF 剪輯室」開啟`, 'info');
      continue;
    }

    // Handle ZIP / RAR / CBZ / CBR archives automatically!
    if (window.MediaEngine.ARCHIVE_EXT_RE.test(file.name)) {
      showToast(`正在解壓縮「${file.name}」...`, 'info');
      try {
        const extracted = await window.MediaEngine.extractImagesFromArchive(file, {
          askPassword: (name) => window.prompt(`「${name}」已加密，請輸入解壓縮密碼：`)
        });
        if (extracted.length === 0) {
          showToast(`「${file.name}」內找不到可轉換的圖片檔案`, 'error');
          continue;
        }
        for (const imgFile of extracted) {
          const id = Math.random().toString(36).slice(2, 10);
          const previewUrl = imgFile.type.startsWith('image/') ? URL.createObjectURL(imgFile) : null;
          imageQueue.push({
            id,
            file: imgFile,
            previewUrl,
            status: 'pending',
            statusText: '',
            result: null,
            downloadUrl: null,
            error: null
          });
        }
        renderImageQueue();
        showToast(`已從「${file.name}」解壓縮並加入 ${extracted.length} 張圖片！`, 'success');
      } catch (err) {
        console.error(err);
        showToast(err.message || `無法解壓縮「${file.name}」`, 'error');
      }
      continue;
    }

    const id = Math.random().toString(36).slice(2, 10);
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    imageQueue.push({
      id,
      file,
      previewUrl,
      status: 'pending',
      statusText: '',
      result: null,
      downloadUrl: null,
      error: null
    });
  }
  renderImageQueue();
});

function renderImageQueue() {
  const hasItems = imageQueue.length > 0;
  imageQueueSection.hidden = !hasItems;
  queueCountBadge.textContent = `待轉換 ${imageQueue.length} 個檔案`;
  btnConvertAll.disabled = !hasItems;
  btnClearQueue.disabled = !hasItems;

  const doneItems = imageQueue.filter((i) => i.status === 'done' && i.result);
  btnDownloadZip.disabled = doneItems.length === 0;

  imageQueueList.innerHTML = '';
  for (const item of imageQueue) {
    const row = document.createElement('div');
    row.className = 'queue-item';

    const thumbHtml = item.previewUrl
      ? `<img class="queue-thumb" src="${item.previewUrl}" alt="" onerror="this.outerHTML='<div class=queue-thumb>📄</div>'" />`
      : `<div class="queue-thumb">📄</div>`;

    let statusBadge = '<span class="status-tag status-pending">等待轉檔</span>';
    let metaExtra = '';
    let actionHtml = '';

    if (item.status === 'converting') {
      statusBadge = `<span class="status-tag status-converting">${item.statusText || '轉檔中...'}</span>`;
    } else if (item.status === 'done' && item.result) {
      statusBadge = `<span class="status-tag status-done">完成 (.${item.result.format.toUpperCase()})</span>`;
      const ratio = item.file.size > 0
        ? Math.round(((item.result.outputSize - item.file.size) / item.file.size) * 100)
        : 0;
      const ratioStr = ratio <= 0 ? `${ratio}%` : `+${ratio}%`;
      const dimStr = item.result.width && item.result.height ? `・${item.result.width}×${item.result.height}` : '';
      metaExtra = `<span>➜ ${formatBytes(item.result.outputSize)} (${ratioStr})${dimStr}</span>`;
      actionHtml = `<a class="btn btn-success btn-sm" href="${item.downloadUrl}" download="${item.result.outputName}">⬇️ 下載</a>`;
    } else if (item.status === 'error') {
      statusBadge = '<span class="status-tag status-error">失敗</span>';
      metaExtra = `<span style="color:#fca5a5">${item.error || '無法轉換'}</span>`;
    }

    row.innerHTML = `
      <div class="queue-left">
        ${thumbHtml}
        <div class="queue-info">
          <div class="queue-name" title="${item.file.name}">${item.file.name}</div>
          <div class="queue-meta">
            <span>原始：${formatBytes(item.file.size)}</span>
            ${metaExtra}
          </div>
        </div>
      </div>
      <div class="queue-actions">
        ${statusBadge}
        ${actionHtml}
        <button class="btn btn-ghost btn-xs" data-remove="${item.id}" title="移除">✕</button>
      </div>
    `;
    imageQueueList.appendChild(row);
  }
}

imageQueueList.addEventListener('click', (e) => {
  const removeBtn = e.target.closest('[data-remove]');
  if (!removeBtn) return;
  const id = removeBtn.dataset.remove;
  const target = imageQueue.find((i) => i.id === id);
  if (target) {
    if (target.previewUrl) URL.revokeObjectURL(target.previewUrl);
    if (target.downloadUrl) URL.revokeObjectURL(target.downloadUrl);
  }
  imageQueue = imageQueue.filter((i) => i.id !== id);
  renderImageQueue();
});

btnClearQueue.addEventListener('click', () => {
  imageQueue.forEach((i) => {
    if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    if (i.downloadUrl) URL.revokeObjectURL(i.downloadUrl);
  });
  imageQueue = [];
  renderImageQueue();
});

btnConvertAll.addEventListener('click', async () => {
  if (imageQueue.length === 0) return;
  btnConvertAll.disabled = true;

  const opts = {
    format: selectedImageFormat,
    quality: imgQuality.value,
    width: document.getElementById('img-width').value.trim(),
    height: document.getElementById('img-height').value.trim(),
    fit: document.getElementById('img-fit').value,
    bgColor: imgBgColor.value
  };

  let successCount = 0;

  for (const item of imageQueue) {
    if (item.downloadUrl) {
      URL.revokeObjectURL(item.downloadUrl);
      item.downloadUrl = null;
    }
    item.status = 'converting';
    item.statusText = '轉檔中...';
    item.error = null;
    renderImageQueue();

    try {
      const result = await window.MediaEngine.convertImageClient(item.file, opts, (msg) => {
        item.statusText = msg;
        renderImageQueue();
      });
      item.status = 'done';
      item.result = result;
      item.downloadUrl = URL.createObjectURL(result.blob);
      successCount++;
    } catch (err) {
      item.status = 'error';
      item.error = err.message || '轉檔失敗';
    }
    renderImageQueue();
  }

  btnConvertAll.disabled = false;
  if (successCount > 0) {
    showToast(`已完成 ${successCount} 個圖片轉檔！`, 'success');
  }
});

btnDownloadZip.addEventListener('click', async () => {
  const doneItems = imageQueue.filter((i) => i.status === 'done' && i.result);
  if (doneItems.length === 0) return;
  if (!window.JSZip) {
    showToast('ZIP 模組尚未載入', 'error');
    return;
  }

  const zip = new window.JSZip();
  const usedNames = new Set();

  for (const item of doneItems) {
    let name = item.result.outputName;
    if (usedNames.has(name)) {
      const dot = name.lastIndexOf('.');
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : '';
      let idx = 2;
      while (usedNames.has(`${base}_${idx}${ext}`)) idx++;
      name = `${base}_${idx}${ext}`;
    }
    usedNames.add(name);
    zip.file(name, item.result.blob);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'converted_images.zip';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
});

// ==================== TAB 2: VIDEO TO GIF STUDIO ====================
const videoDropzone = document.getElementById('video-dropzone');
const videoFileInput = document.getElementById('video-file-input');
const videoUploadSection = document.getElementById('video-upload-section');
const videoUploadProgress = document.getElementById('video-upload-progress');
const videoUploadStatus = document.getElementById('video-upload-status');
const videoEditorWorkspace = document.getElementById('video-editor-workspace');

const videoPlayer = document.getElementById('video-player');
const btnPlayPause = document.getElementById('btn-play-pause');
const btnPlayClip = document.getElementById('btn-play-clip');
const chkLoopClip = document.getElementById('chk-loop-clip');
const currentTimeDisplay = document.getElementById('current-time-display');
const clipDurationDisplay = document.getElementById('clip-duration-display');

const timelineTrack = document.getElementById('timeline-track');
const timelineFilmstrip = document.getElementById('timeline-filmstrip');
const timelineMaskLeft = document.getElementById('timeline-mask-left');
const timelineMaskRight = document.getElementById('timeline-mask-right');
const timelineSelection = document.getElementById('timeline-selection');
const handleStart = document.getElementById('handle-start');
const handleEnd = document.getElementById('handle-end');
const timelinePlayhead = document.getElementById('timeline-playhead');

const inputStartTime = document.getElementById('input-start-time');
const inputEndTime = document.getElementById('input-end-time');
const btnSetStart = document.getElementById('btn-set-start');
const btnSetEnd = document.getElementById('btn-set-end');

const gifFps = document.getElementById('gif-fps');
const gifFpsVal = document.getElementById('gif-fps-val');
const btnExportGif = document.getElementById('btn-export-gif');
const gifExportLoading = document.getElementById('gif-export-loading');
const gifExportStatus = document.getElementById('gif-export-status');
const gifProgressBar = document.getElementById('gif-progress-bar');
const gifResultBox = document.getElementById('gif-result-box');
const gifResultPreview = document.getElementById('gif-result-preview');
const gifResultSize = document.getElementById('gif-result-size');
const gifResultDownload = document.getElementById('gif-result-download');

let currentVideo = null; // { file, previewUrl, duration, width, height }
let lastGifObjectUrl = null;
let clipStart = 0;
let clipEnd = 5;
let selectedVideoFormat = 'gif';

gifFps.addEventListener('input', () => {
  gifFpsVal.textContent = gifFps.value;
});

document.getElementById('video-format-picker').addEventListener('click', (e) => {
  const pill = e.target.closest('.fmt-pill');
  if (!pill) return;
  document.querySelectorAll('#video-format-picker .fmt-pill').forEach((p) => p.classList.remove('active'));
  pill.classList.add('active');
  selectedVideoFormat = pill.dataset.vformat;
  document.querySelectorAll('.gif-only-group').forEach((el) => {
    el.style.display = selectedVideoFormat === 'gif' ? '' : 'none';
  });
});

wireDropzone(videoDropzone, videoFileInput, (files) => {
  if (files[0]) handleVideoFileSelected(files[0]);
});

document.getElementById('btn-change-video').addEventListener('click', () => {
  videoPlayer.pause();
  if (currentVideo && currentVideo.previewUrl) URL.revokeObjectURL(currentVideo.previewUrl);
  currentVideo = null;
  videoEditorWorkspace.hidden = true;
  videoUploadSection.hidden = false;
  gifResultBox.hidden = true;
});

function loadVideoMetadata(url) {
  return new Promise((resolve, reject) => {
    const tempVid = document.createElement('video');
    tempVid.muted = true;
    tempVid.preload = 'metadata';
    tempVid.src = url;
    tempVid.onloadedmetadata = () => {
      if (!tempVid.videoWidth || !Number.isFinite(tempVid.duration) || tempVid.duration <= 0) {
        return reject(new Error('無法直接播放此影片格式'));
      }
      resolve({
        duration: tempVid.duration,
        width: tempVid.videoWidth,
        height: tempVid.videoHeight
      });
    };
    tempVid.onerror = () => reject(new Error('瀏覽器不支援直接播放此格式'));
  });
}

async function handleVideoFileSelected(file) {
  videoUploadSection.hidden = false;
  videoEditorWorkspace.hidden = true;
  videoUploadProgress.hidden = false;
  videoUploadStatus.textContent = `正在載入「${file.name}」...`;

  if (currentVideo && currentVideo.previewUrl) {
    URL.revokeObjectURL(currentVideo.previewUrl);
  }

  let previewUrl = URL.createObjectURL(file);
  let meta = null;

  try {
    try {
      meta = await loadVideoMetadata(previewUrl);
    } catch (_) {
      // Browser cannot natively play MKV/AVI/FLV/WMV/GIF-as-video -> transcode lightweight preview via FFmpeg.wasm
      URL.revokeObjectURL(previewUrl);
      const previewBlob = await window.MediaEngine.transcodeVideoPreviewClient(
        file,
        (status) => { videoUploadStatus.textContent = status; },
        (pct) => { videoUploadStatus.textContent = `正在建立預覽串流... ${pct}%`; }
      );
      previewUrl = URL.createObjectURL(previewBlob);
      meta = await loadVideoMetadata(previewUrl);
      showToast('已自動建立瀏覽器預覽影片，轉檔仍會使用原始高畫質檔案！', 'info');
    }

    currentVideo = {
      file,
      previewUrl,
      duration: Math.max(0.2, meta.duration),
      width: meta.width,
      height: meta.height
    };

    document.getElementById('video-filename').textContent = file.name;
    document.getElementById('video-meta-res').textContent = `${meta.width}×${meta.height}`;
    document.getElementById('video-meta-dur').textContent = formatTime(currentVideo.duration);
    document.getElementById('video-meta-size').textContent = formatBytes(file.size);

    clipStart = 0;
    clipEnd = Math.min(currentVideo.duration, 5);
    inputStartTime.max = currentVideo.duration.toFixed(2);
    inputEndTime.max = currentVideo.duration.toFixed(2);

    videoPlayer.src = previewUrl;
    videoPlayer.load();

    videoUploadProgress.hidden = true;
    videoUploadSection.hidden = true;
    videoEditorWorkspace.hidden = false;
    gifResultBox.hidden = true;

    updateTimelineUI();

    // Extract filmstrip thumbnails in background
    timelineFilmstrip.innerHTML = '<div class="filmstrip-loading">正在擷取時間軸縮圖...</div>';
    window.MediaEngine.extractThumbnailsFromVideoUrl(previewUrl, currentVideo.duration, 10).then((thumbs) => {
      if (thumbs.length > 0) {
        timelineFilmstrip.innerHTML = thumbs.map((src) => `<img src="${src}" alt="" />`).join('');
      } else {
        timelineFilmstrip.innerHTML = '';
      }
    });
  } catch (err) {
    videoUploadProgress.hidden = true;
    showToast(err.message || '影片載入失敗', 'error');
  }
}

function updateTimelineUI() {
  if (!currentVideo) return;
  const dur = currentVideo.duration;
  clipStart = Math.max(0, Math.min(clipStart, dur - 0.1));
  clipEnd = Math.max(clipStart + 0.1, Math.min(clipEnd, dur));

  const startPct = (clipStart / dur) * 100;
  const endPct = (clipEnd / dur) * 100;

  timelineMaskLeft.style.width = `${startPct}%`;
  timelineMaskRight.style.width = `${100 - endPct}%`;
  timelineSelection.style.left = `${startPct}%`;
  timelineSelection.style.width = `${endPct - startPct}%`;

  inputStartTime.value = clipStart.toFixed(1);
  inputEndTime.value = clipEnd.toFixed(1);
  clipDurationDisplay.textContent = `${(clipEnd - clipStart).toFixed(1)} 秒`;
}

function updatePlayhead() {
  if (!currentVideo) return;
  const pct = Math.min(100, Math.max(0, (videoPlayer.currentTime / currentVideo.duration) * 100));
  timelinePlayhead.style.left = `${pct}%`;
  currentTimeDisplay.textContent = formatTime(videoPlayer.currentTime);
}

videoPlayer.addEventListener('timeupdate', () => {
  updatePlayhead();
  if (chkLoopClip.checked && !videoPlayer.paused) {
    if (videoPlayer.currentTime >= clipEnd || videoPlayer.currentTime < clipStart - 0.15) {
      videoPlayer.currentTime = clipStart;
    }
  }
});

videoPlayer.addEventListener('play', () => { btnPlayPause.textContent = '⏸ 暫停'; });
videoPlayer.addEventListener('pause', () => { btnPlayPause.textContent = '▶ 播放'; });

btnPlayPause.addEventListener('click', () => {
  if (videoPlayer.paused) videoPlayer.play();
  else videoPlayer.pause();
});

btnPlayClip.addEventListener('click', () => {
  videoPlayer.currentTime = clipStart;
  videoPlayer.play();
});

btnSetStart.addEventListener('click', () => {
  if (!currentVideo) return;
  clipStart = videoPlayer.currentTime;
  if (clipEnd <= clipStart + 0.1) clipEnd = Math.min(currentVideo.duration, clipStart + 1);
  updateTimelineUI();
});

btnSetEnd.addEventListener('click', () => {
  if (!currentVideo) return;
  clipEnd = videoPlayer.currentTime;
  if (clipStart >= clipEnd - 0.1) clipStart = Math.max(0, clipEnd - 1);
  updateTimelineUI();
});

inputStartTime.addEventListener('change', () => {
  const val = parseFloat(inputStartTime.value);
  if (Number.isFinite(val)) {
    clipStart = val;
    updateTimelineUI();
    videoPlayer.currentTime = clipStart;
  }
});

inputEndTime.addEventListener('change', () => {
  const val = parseFloat(inputEndTime.value);
  if (Number.isFinite(val)) {
    clipEnd = val;
    updateTimelineUI();
    videoPlayer.currentTime = clipEnd;
  }
});

// Interactive Timeline Dragging
let dragMode = null;
let dragOriginX = 0;
let dragOriginStart = 0;
let dragOriginEnd = 0;

function pointerTimeFromEvent(e) {
  const rect = timelineTrack.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
  return ratio * currentVideo.duration;
}

handleStart.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  dragMode = 'start';
  timelineTrack.setPointerCapture(e.pointerId);
});

handleEnd.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  dragMode = 'end';
  timelineTrack.setPointerCapture(e.pointerId);
});

timelineSelection.addEventListener('pointerdown', (e) => {
  if (e.target === handleStart || e.target === handleEnd) return;
  e.stopPropagation();
  dragMode = 'move';
  dragOriginX = e.clientX;
  dragOriginStart = clipStart;
  dragOriginEnd = clipEnd;
  timelineTrack.setPointerCapture(e.pointerId);
});

timelineTrack.addEventListener('pointerdown', (e) => {
  if (!currentVideo) return;
  dragMode = 'seek';
  videoPlayer.currentTime = pointerTimeFromEvent(e);
  updatePlayhead();
  timelineTrack.setPointerCapture(e.pointerId);
});

timelineTrack.addEventListener('pointermove', (e) => {
  if (!dragMode || !currentVideo) return;
  const dur = currentVideo.duration;

  if (dragMode === 'start') {
    clipStart = Math.min(pointerTimeFromEvent(e), clipEnd - 0.2);
    updateTimelineUI();
    videoPlayer.currentTime = clipStart;
  } else if (dragMode === 'end') {
    clipEnd = Math.max(pointerTimeFromEvent(e), clipStart + 0.2);
    updateTimelineUI();
    videoPlayer.currentTime = clipEnd;
  } else if (dragMode === 'move') {
    const rect = timelineTrack.getBoundingClientRect();
    const deltaSec = ((e.clientX - dragOriginX) / rect.width) * dur;
    const span = dragOriginEnd - dragOriginStart;
    let nextStart = dragOriginStart + deltaSec;
    if (nextStart < 0) nextStart = 0;
    if (nextStart + span > dur) nextStart = dur - span;
    clipStart = nextStart;
    clipEnd = nextStart + span;
    updateTimelineUI();
    videoPlayer.currentTime = clipStart;
  } else if (dragMode === 'seek') {
    videoPlayer.currentTime = pointerTimeFromEvent(e);
    updatePlayhead();
  }
});

timelineTrack.addEventListener('pointerup', () => { dragMode = null; });

// Export Video Segment
btnExportGif.addEventListener('click', async () => {
  if (!currentVideo) return;

  const effect = document.getElementById('gif-effect').value;
  const opts = {
    start: clipStart,
    end: clipEnd,
    format: selectedVideoFormat,
    fps: parseInt(gifFps.value, 10),
    width: parseInt(document.getElementById('gif-width').value, 10),
    speed: parseFloat(document.getElementById('gif-speed').value),
    colors: parseInt(document.getElementById('gif-colors').value, 10),
    dither: document.getElementById('gif-dither').value,
    reverse: effect === 'reverse',
    boomerang: effect === 'boomerang'
  };

  btnExportGif.disabled = true;
  gifExportLoading.hidden = false;
  gifExportStatus.textContent = '準備轉檔中...';
  gifProgressBar.style.width = '5%';
  gifResultBox.hidden = true;

  try {
    const res = await window.MediaEngine.convertVideoSegmentClient(
      currentVideo.file,
      opts,
      (msg) => { gifExportStatus.textContent = msg; },
      (pct) => {
        gifProgressBar.style.width = `${Math.max(5, pct)}%`;
        gifExportStatus.textContent = `正在渲染動態圖... ${pct}%`;
      }
    );

    if (lastGifObjectUrl) URL.revokeObjectURL(lastGifObjectUrl);
    lastGifObjectUrl = URL.createObjectURL(res.blob);

    gifProgressBar.style.width = '100%';
    gifResultPreview.src = lastGifObjectUrl;
    gifResultSize.textContent = formatBytes(res.size);
    gifResultDownload.href = lastGifObjectUrl;
    gifResultDownload.download = res.outputName;
    gifResultDownload.textContent = `⬇️ 下載 ${res.outputName}`;
    gifResultBox.hidden = false;
    showToast('動態圖產生完成！', 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message || '產生失敗', 'error');
  } finally {
    btnExportGif.disabled = false;
    gifExportLoading.hidden = true;
  }
});
