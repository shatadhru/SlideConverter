// SlideConvert — High-Performance PDF Slide Processor
// Fully local & offline (pdfjs-dist + pdf-lib)

// Ensure PDF.js worker points to local server vendor
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
}

function getPDFLib() {
  const lib = window.PDFLib || (typeof PDFLib !== 'undefined' ? PDFLib : null);
  if (!lib) {
    throw new Error('PDF-Lib is still loading or failed to load. Please refresh.');
  }
  return lib;
}

// -------------------------------------------------------------
// TAB SWITCHING
// -------------------------------------------------------------
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.getAttribute('data-target');
    tabBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    tabContents.forEach(c => c.classList.remove('active'));

    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    const targetEl = document.getElementById(targetId);
    if (targetEl) targetEl.classList.add('active');
  });
});

// -------------------------------------------------------------
// SEGMENT 1: SLIDE INVERTER & TEXT DEPTH ENHANCER
// -------------------------------------------------------------
const s1 = {
  pdfDoc: null,
  rawPdfBytes: null,
  fileName: '',
  numPages: 0,
  currentPage: 1,
  currentViewMode: 'enhanced', // 'enhanced', 'original', 'split'
  cachedPages: new Map(),

  // Elements
  btnBrowse: document.getElementById('s1-btn-browse'),
  fileInput: document.getElementById('s1-file-input'),
  btnLoadSample: document.getElementById('s1-btn-load-sample'),
  fileInfo: document.getElementById('s1-file-info'),
  fileNameEl: document.getElementById('s1-file-name'),
  clearBtn: document.getElementById('s1-clear-file'),
  exportBtn: document.getElementById('s1-btn-export'),
  progressBar: document.getElementById('s1-progress-bar'),
  progressContainer: document.getElementById('s1-progress-bar-container'),
  progressText: document.getElementById('s1-progress-text'),

  // Controls
  optInvert: document.getElementById('s1-opt-invert'),
  optGrayscale: document.getElementById('s1-opt-grayscale'),
  optDepth: document.getElementById('s1-opt-depth'),
  depthVal: document.getElementById('s1-depth-val'),
  optBgClean: document.getElementById('s1-opt-bgclean'),
  bgCleanVal: document.getElementById('s1-bgclean-val'),
  optOrientation: document.getElementById('s1-orientation'),
  optMargin: document.getElementById('s1-margin'),
  optSlidesPerPage: document.getElementById('s1-slides-per-page'),

  // Preview elements
  placeholder: document.getElementById('s1-placeholder'),
  canvasWrapper: document.getElementById('s1-canvas-wrapper'),
  previewCanvas: document.getElementById('s1-preview-canvas'),
  splitContainer: document.getElementById('s1-split-container'),
  splitOriginal: document.getElementById('s1-split-original'),
  splitEnhanced: document.getElementById('s1-split-enhanced'),
  pageInfo: document.getElementById('s1-page-info'),
  prevPageBtn: document.getElementById('s1-prev-page'),
  nextPageBtn: document.getElementById('s1-next-page'),
  btnViewEnhanced: document.getElementById('s1-view-enhanced'),
  btnViewOriginal: document.getElementById('s1-view-original'),
  btnViewSplit: document.getElementById('s1-view-split'),
  thumbStripWrapper: document.getElementById('s1-thumb-strip-wrapper'),
  thumbStrip: document.getElementById('s1-thumb-strip')
};

// Hook up upload buttons
s1.btnBrowse.addEventListener('click', () => s1.fileInput.click());
s1.fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleS1File(e.target.files[0]);
});

s1.btnLoadSample.addEventListener('click', async () => {
  try {
    s1.btnLoadSample.disabled = true;
    s1.btnLoadSample.textContent = 'Loading...';
    const res = await fetch('/test.pdf');
    if (!res.ok) throw new Error('Test PDF not found');
    const blob = await res.blob();
    const file = new File([blob], 'sample_8_slides.pdf', { type: 'application/pdf' });
    await handleS1File(file);
  } catch (err) {
    alert('Failed to load sample slide: ' + err.message);
  } finally {
    s1.btnLoadSample.disabled = false;
    s1.btnLoadSample.textContent = '⚡ Load Test Slide';
  }
});

s1.clearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetS1();
});

// Slider listeners
s1.optDepth.addEventListener('input', () => {
  s1.depthVal.textContent = `${s1.optDepth.value}%`;
  s1.reprocessCurrentPreview();
});

s1.optBgClean.addEventListener('input', () => {
  s1.bgCleanVal.textContent = `${s1.optBgClean.value}%`;
  s1.reprocessCurrentPreview();
});

s1.optInvert.addEventListener('change', () => s1.reprocessCurrentPreview());
s1.optGrayscale.addEventListener('change', () => s1.reprocessCurrentPreview());

// View toggles
s1.btnViewEnhanced.addEventListener('click', () => setS1ViewMode('enhanced'));
s1.btnViewOriginal.addEventListener('click', () => setS1ViewMode('original'));
s1.btnViewSplit.addEventListener('click', () => setS1ViewMode('split'));

function setS1ViewMode(mode) {
  s1.currentViewMode = mode;
  [s1.btnViewEnhanced, s1.btnViewOriginal, s1.btnViewSplit].forEach(b => b.classList.remove('active'));
  if (mode === 'enhanced') s1.btnViewEnhanced.classList.add('active');
  if (mode === 'original') s1.btnViewOriginal.classList.add('active');
  if (mode === 'split') s1.btnViewSplit.classList.add('active');
  updateS1PreviewDisplay();
}

async function handleS1File(file) {
  if (!file || file.type !== 'application/pdf') {
    alert('Please choose a valid PDF file.');
    return;
  }

  resetS1();
  s1.fileName = file.name;
  s1.fileNameEl.textContent = file.name;
  s1.fileInfo.classList.remove('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    s1.rawPdfBytes = arrayBuffer.slice(0);
    s1.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    s1.numPages = s1.pdfDoc.numPages;
    s1.currentPage = 1;

    s1.placeholder.classList.add('hidden');
    s1.exportBtn.disabled = false;
    s1.thumbStripWrapper.classList.remove('hidden');

    updateS1PageStepper();
    renderS1Thumbnails();
    await renderS1CurrentPage();
  } catch (err) {
    console.error('Error loading PDF:', err);
    alert('Failed to read PDF file.');
    resetS1();
  }
}

function resetS1() {
  s1.pdfDoc = null;
  s1.rawPdfBytes = null;
  s1.fileName = '';
  s1.numPages = 0;
  s1.currentPage = 1;
  s1.cachedPages.clear();
  s1.fileInfo.classList.add('hidden');
  s1.fileInput.value = '';
  s1.exportBtn.disabled = true;
  s1.placeholder.classList.remove('hidden');
  s1.canvasWrapper.classList.add('hidden');
  s1.splitContainer.classList.add('hidden');
  s1.thumbStripWrapper.classList.add('hidden');
  s1.thumbStrip.innerHTML = '';
  s1.pageInfo.textContent = 'Slide 0 / 0';
  s1.prevPageBtn.disabled = true;
  s1.nextPageBtn.disabled = true;
}

// Stepper
s1.prevPageBtn.addEventListener('click', () => {
  if (s1.currentPage > 1) {
    s1.currentPage--;
    updateS1PageStepper();
    renderS1CurrentPage();
  }
});

s1.nextPageBtn.addEventListener('click', () => {
  if (s1.currentPage < s1.numPages) {
    s1.currentPage++;
    updateS1PageStepper();
    renderS1CurrentPage();
  }
});

function updateS1PageStepper() {
  s1.pageInfo.textContent = `Slide ${s1.currentPage} / ${s1.numPages}`;
  s1.prevPageBtn.disabled = s1.currentPage <= 1;
  s1.nextPageBtn.disabled = s1.currentPage >= s1.numPages;

  const thumbs = s1.thumbStrip.querySelectorAll('.thumb-item');
  thumbs.forEach((thumb, idx) => {
    if (idx + 1 === s1.currentPage) {
      thumb.classList.add('active');
      thumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      thumb.classList.remove('active');
    }
  });
}

// Render active preview page
async function renderS1CurrentPage() {
  if (!s1.pdfDoc) return;

  const page = await s1.pdfDoc.getPage(s1.currentPage);
  const viewport = page.getViewport({ scale: 1.5 });

  const offscreen = document.createElement('canvas');
  offscreen.width = viewport.width;
  offscreen.height = viewport.height;
  const ctx = offscreen.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;
  s1.cachedPages.set(s1.currentPage, { origCanvas: offscreen });

  processAndDisplayS1();
}

function processAndDisplayS1() {
  const cached = s1.cachedPages.get(s1.currentPage);
  if (!cached || !cached.origCanvas) return;

  const origCanvas = cached.origCanvas;
  const enhancedCanvas = document.createElement('canvas');
  enhancedCanvas.width = origCanvas.width;
  enhancedCanvas.height = origCanvas.height;
  const enhCtx = enhancedCanvas.getContext('2d');
  enhCtx.drawImage(origCanvas, 0, 0);

  applyImageEnhancements(
    enhCtx,
    enhancedCanvas.width,
    enhancedCanvas.height,
    s1.optInvert.checked,
    s1.optGrayscale.checked,
    parseInt(s1.optDepth.value, 10),
    parseInt(s1.optBgClean.value, 10)
  );

  cached.enhancedCanvas = enhancedCanvas;
  updateS1PreviewDisplay();
}

function reprocessCurrentPreview() {
  if (!s1.pdfDoc) return;
  processAndDisplayS1();
}

function updateS1PreviewDisplay() {
  const cached = s1.cachedPages.get(s1.currentPage);
  if (!cached || !cached.origCanvas) return;

  if (s1.currentViewMode === 'split') {
    s1.canvasWrapper.classList.add('hidden');
    s1.splitContainer.classList.remove('hidden');

    s1.splitOriginal.width = cached.origCanvas.width;
    s1.splitOriginal.height = cached.origCanvas.height;
    const ctxO = s1.splitOriginal.getContext('2d');
    ctxO.drawImage(cached.origCanvas, 0, 0);

    if (cached.enhancedCanvas) {
      s1.splitEnhanced.width = cached.enhancedCanvas.width;
      s1.splitEnhanced.height = cached.enhancedCanvas.height;
      const ctxE = s1.splitEnhanced.getContext('2d');
      ctxE.drawImage(cached.enhancedCanvas, 0, 0);
    }
  } else {
    s1.splitContainer.classList.add('hidden');
    s1.canvasWrapper.classList.remove('hidden');

    const sourceCanvas = s1.currentViewMode === 'original' ? cached.origCanvas : cached.enhancedCanvas;
    if (sourceCanvas) {
      s1.previewCanvas.width = sourceCanvas.width;
      s1.previewCanvas.height = sourceCanvas.height;
      const ctx = s1.previewCanvas.getContext('2d');
      ctx.drawImage(sourceCanvas, 0, 0);
    }
  }
}

// Invert + Grayscale + Black Text Depth S-Curve
function applyImageEnhancements(ctx, width, height, doInvert, doGrayscale, depthFactor, bgCleanFactor) {
  if (!doInvert && !doGrayscale && depthFactor === 0) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;
  const len = data.length;

  const kDepth = depthFactor / 100;
  const bgThreshold = (bgCleanFactor / 100) * 255;

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    if (doInvert) {
      r = 255 - r;
      g = 255 - g;
      b = 255 - b;
    }

    let gray = 0.299 * r + 0.587 * g + 0.114 * b;

    if (doGrayscale) {
      if (kDepth > 0) {
        if (gray >= bgThreshold) {
          gray = 255; // Pure white paper
        } else {
          const norm = gray / bgThreshold;
          const exponent = 1.3 + (kDepth * 2.2);
          const deepened = Math.pow(norm, exponent) * bgThreshold;
          gray = deepened * (1.0 - (kDepth * 0.35));
        }
      }
      gray = Math.max(0, Math.min(255, gray));
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    } else {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

// Thumbnails
async function renderS1Thumbnails() {
  s1.thumbStrip.innerHTML = '';

  for (let i = 1; i <= s1.numPages; i++) {
    const thumbItem = document.createElement('div');
    thumbItem.className = `thumb-item ${i === s1.currentPage ? 'active' : ''}`;
    thumbItem.title = `Slide ${i}`;

    const numBadge = document.createElement('span');
    numBadge.className = 'thumb-num';
    numBadge.textContent = i;
    thumbItem.appendChild(numBadge);

    const canvas = document.createElement('canvas');
    thumbItem.appendChild(canvas);

    thumbItem.addEventListener('click', () => {
      s1.currentPage = i;
      updateS1PageStepper();
      renderS1CurrentPage();
    });

    s1.thumbStrip.appendChild(thumbItem);

    s1.pdfDoc.getPage(i).then(page => {
      const viewport = page.getViewport({ scale: 0.25 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      page.render({ canvasContext: ctx, viewport });
    });
  }
}

// EXPORT TO A4 (Supports 8 slides in 2 columns, 6, 4, 2, 1)
s1.exportBtn.addEventListener('click', async () => {
  if (!s1.pdfDoc) return;

  const pdfLib = getPDFLib();
  s1.exportBtn.disabled = true;
  s1.progressContainer.classList.remove('hidden');
  s1.progressBar.style.width = '5%';
  s1.progressText.textContent = 'Rendering slides...';

  try {
    const outPdf = await pdfLib.PDFDocument.create();

    const orientation = s1.optOrientation.value; // 'portrait', 'landscape', 'auto'
    const marginMm = parseFloat(s1.optMargin.value);
    const slidesPerPage = parseInt(s1.optSlidesPerPage.value, 10); // 8, 6, 4, 2, 1

    const mmToPoints = 2.83465;
    const marginPts = marginMm * mmToPoints;

    const A4_SHORT = 595.28;
    const A4_LONG = 841.89;

    const doInvert = s1.optInvert.checked;
    const doGrayscale = s1.optGrayscale.checked;
    const depthVal = parseInt(s1.optDepth.value, 10);
    const bgCleanVal = parseInt(s1.optBgClean.value, 10);

    const processedImages = [];

    for (let pageNum = 1; pageNum <= s1.numPages; pageNum++) {
      const progressPercent = Math.round(5 + ((pageNum / s1.numPages) * 75));
      s1.progressBar.style.width = `${progressPercent}%`;
      s1.progressText.textContent = `Processing slide ${pageNum} of ${s1.numPages}...`;

      const page = await s1.pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;
      applyImageEnhancements(ctx, canvas.width, canvas.height, doInvert, doGrayscale, depthVal, bgCleanVal);

      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.90);
      const imgBytes = await fetch(imgDataUrl).then(r => r.arrayBuffer());
      const embeddedImg = await outPdf.embedJpg(imgBytes);

      processedImages.push({
        img: embeddedImg,
        aspectRatio: canvas.width / canvas.height
      });
    }

    s1.progressText.textContent = 'Arranging pages...';
    s1.progressBar.style.width = '85%';

    // Base Page Dimension
    const pageWidth = orientation === 'landscape' ? A4_LONG : A4_SHORT;
    const pageHeight = orientation === 'landscape' ? A4_SHORT : A4_LONG;

    if (slidesPerPage === 1) {
      for (const item of processedImages) {
        let pW = pageWidth, pH = pageHeight;
        if (orientation === 'auto') {
          pW = item.aspectRatio >= 1 ? A4_LONG : A4_SHORT;
          pH = item.aspectRatio >= 1 ? A4_SHORT : A4_LONG;
        }
        const outPage = outPdf.addPage([pW, pH]);
        const availW = pW - (2 * marginPts);
        const availH = pH - (2 * marginPts);
        drawFittedImage(outPage, item.img, item.aspectRatio, marginPts, marginPts, availW, availH);
      }
    } else if (slidesPerPage === 8) {
      // 8 SLIDES: 2 COLUMNS x 4 ROWS
      const cols = 2, rows = 4;
      const gap = Math.max(2, marginPts / 2);

      for (let i = 0; i < processedImages.length; i += 8) {
        const outPage = outPdf.addPage([pageWidth, pageHeight]);
        const availW = pageWidth - (2 * marginPts);
        const availH = pageHeight - (2 * marginPts);

        const slotW = (availW - ((cols - 1) * gap)) / cols;
        const slotH = (availH - ((rows - 1) * gap)) / rows;

        for (let s = 0; s < 8; s++) {
          if (i + s < processedImages.length) {
            const col = s % cols;
            const row = Math.floor(s / cols); // 0 (top) to 3 (bottom)
            const x = marginPts + col * (slotW + gap);
            const y = marginPts + ((rows - 1) - row) * (slotH + gap);
            drawFittedImage(outPage, processedImages[i + s].img, processedImages[i + s].aspectRatio, x, y, slotW, slotH);
          }
        }
      }
    } else if (slidesPerPage === 6) {
      // 6 SLIDES: 2 COLUMNS x 3 ROWS
      const cols = 2, rows = 3;
      const gap = Math.max(2, marginPts / 2);

      for (let i = 0; i < processedImages.length; i += 6) {
        const outPage = outPdf.addPage([pageWidth, pageHeight]);
        const availW = pageWidth - (2 * marginPts);
        const availH = pageHeight - (2 * marginPts);

        const slotW = (availW - ((cols - 1) * gap)) / cols;
        const slotH = (availH - ((rows - 1) * gap)) / rows;

        for (let s = 0; s < 6; s++) {
          if (i + s < processedImages.length) {
            const col = s % cols;
            const row = Math.floor(s / cols);
            const x = marginPts + col * (slotW + gap);
            const y = marginPts + ((rows - 1) - row) * (slotH + gap);
            drawFittedImage(outPage, processedImages[i + s].img, processedImages[i + s].aspectRatio, x, y, slotW, slotH);
          }
        }
      }
    } else if (slidesPerPage === 4) {
      // 4 SLIDES: 2 COLUMNS x 2 ROWS
      const cols = 2, rows = 2;
      const gap = Math.max(2, marginPts / 2);

      for (let i = 0; i < processedImages.length; i += 4) {
        const outPage = outPdf.addPage([pageWidth, pageHeight]);
        const availW = pageWidth - (2 * marginPts);
        const availH = pageHeight - (2 * marginPts);

        const slotW = (availW - gap) / 2;
        const slotH = (availH - gap) / 2;

        for (let s = 0; s < 4; s++) {
          if (i + s < processedImages.length) {
            const col = s % cols;
            const row = Math.floor(s / cols);
            const x = marginPts + col * (slotW + gap);
            const y = marginPts + ((rows - 1) - row) * (slotH + gap);
            drawFittedImage(outPage, processedImages[i + s].img, processedImages[i + s].aspectRatio, x, y, slotW, slotH);
          }
        }
      }
    } else if (slidesPerPage === 2) {
      // 2 SLIDES: 1 COL x 2 ROWS
      const gap = marginPts;

      for (let i = 0; i < processedImages.length; i += 2) {
        const outPage = outPdf.addPage([pageWidth, pageHeight]);
        const availW = pageWidth - (2 * marginPts);
        const slotH = (pageHeight - (2 * marginPts) - gap) / 2;

        drawFittedImage(outPage, processedImages[i].img, processedImages[i].aspectRatio, marginPts, marginPts + slotH + gap, availW, slotH);
        if (i + 1 < processedImages.length) {
          drawFittedImage(outPage, processedImages[i + 1].img, processedImages[i + 1].aspectRatio, marginPts, marginPts, availW, slotH);
        }
      }
    }

    s1.progressText.textContent = 'Saving PDF...';
    s1.progressBar.style.width = '95%';

    const pdfBytes = await outPdf.save();
    downloadBlob(pdfBytes, `${s1.fileName.replace('.pdf', '')}_enhanced.pdf`, 'application/pdf');

    s1.progressBar.style.width = '100%';
    s1.progressText.textContent = 'Done!';
    setTimeout(() => {
      s1.progressContainer.classList.add('hidden');
      s1.exportBtn.disabled = false;
    }, 1000);
  } catch (err) {
    console.error('Export failed:', err);
    alert('Export error: ' + err.message);
    s1.progressContainer.classList.add('hidden');
    s1.exportBtn.disabled = false;
  }
});

function drawFittedImage(page, img, aspectRatio, slotX, slotY, slotWidth, slotHeight) {
  let drawW, drawH;
  if (slotWidth / slotHeight > aspectRatio) {
    drawH = slotHeight;
    drawW = drawH * aspectRatio;
  } else {
    drawW = slotWidth;
    drawH = drawW / aspectRatio;
  }
  const x = slotX + (slotWidth - drawW) / 2;
  const y = slotY + (slotHeight - drawH) / 2;
  page.drawImage(img, { x, y, width: drawW, height: drawH });
}

// -------------------------------------------------------------
// SEGMENT 2: SELECTIVE PAGE EXTRACTOR
// -------------------------------------------------------------
const s2 = {
  pdfDoc: null,
  rawPdfBytes: null,
  fileName: '',
  numPages: 0,
  selectedPages: new Set(),

  // Elements
  btnBrowse: document.getElementById('s2-btn-browse'),
  fileInput: document.getElementById('s2-file-input'),
  btnLoadSample: document.getElementById('s2-btn-load-sample'),
  fileInfo: document.getElementById('s2-file-info'),
  fileNameEl: document.getElementById('s2-file-name'),
  clearBtn: document.getElementById('s2-clear-file'),
  exportBtn: document.getElementById('s2-btn-export'),
  selectionBar: document.getElementById('s2-selection-bar'),
  selectedCountBadge: document.getElementById('s2-selected-count'),
  selectedListEl: document.getElementById('s2-selected-pages-list'),
  pagesGrid: document.getElementById('s2-pages-grid'),
  placeholder: document.getElementById('s2-placeholder'),
  progressContainer: document.getElementById('s2-progress-container'),
  progressBar: document.getElementById('s2-progress-bar'),
  progressText: document.getElementById('s2-progress-text'),

  // Quick action buttons
  btnSelectAll: document.getElementById('s2-select-all'),
  btnDeselectAll: document.getElementById('s2-deselect-all'),
  btnSelectOdd: document.getElementById('s2-select-odd'),
  btnSelectEven: document.getElementById('s2-select-even'),
  rangeInput: document.getElementById('s2-range-input'),
  btnApplyRange: document.getElementById('s2-apply-range')
};

s2.btnBrowse.addEventListener('click', () => s2.fileInput.click());
s2.fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleS2File(e.target.files[0]);
});

s2.btnLoadSample.addEventListener('click', async () => {
  try {
    s2.btnLoadSample.disabled = true;
    s2.btnLoadSample.textContent = 'Loading...';
    const res = await fetch('/test.pdf');
    if (!res.ok) throw new Error('Test PDF not found');
    const blob = await res.blob();
    const file = new File([blob], 'sample_8_slides.pdf', { type: 'application/pdf' });
    await handleS2File(file);
  } catch (err) {
    alert('Failed to load sample: ' + err.message);
  } finally {
    s2.btnLoadSample.disabled = false;
    s2.btnLoadSample.textContent = '⚡ Load Test PDF';
  }
});

s2.clearBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  resetS2();
});

async function handleS2File(file) {
  if (!file || file.type !== 'application/pdf') {
    alert('Please select a valid PDF file.');
    return;
  }

  resetS2();
  s2.fileName = file.name;
  s2.fileNameEl.textContent = file.name;
  s2.fileInfo.classList.remove('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    s2.rawPdfBytes = arrayBuffer.slice(0);
    s2.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    s2.numPages = s2.pdfDoc.numPages;

    s2.placeholder.classList.add('hidden');
    s2.pagesGrid.classList.remove('hidden');
    s2.selectionBar.classList.remove('hidden');

    [s2.btnSelectAll, s2.btnDeselectAll, s2.btnSelectOdd, s2.btnSelectEven, s2.btnApplyRange, s2.rangeInput].forEach(b => b.disabled = false);

    for (let i = 1; i <= s2.numPages; i++) {
      s2.selectedPages.add(i);
    }

    renderS2Grid();
    updateS2SelectionSummary();
  } catch (err) {
    console.error('Error in Segment 2:', err);
    alert('Failed to read PDF document.');
    resetS2();
  }
}

function resetS2() {
  s2.pdfDoc = null;
  s2.rawPdfBytes = null;
  s2.fileName = '';
  s2.numPages = 0;
  s2.selectedPages.clear();
  s2.fileInfo.classList.add('hidden');
  s2.fileInput.value = '';
  s2.selectionBar.classList.add('hidden');
  s2.pagesGrid.classList.add('hidden');
  s2.pagesGrid.innerHTML = '';
  s2.placeholder.classList.remove('hidden');
  [s2.btnSelectAll, s2.btnDeselectAll, s2.btnSelectOdd, s2.btnSelectEven, s2.btnApplyRange, s2.rangeInput, s2.exportBtn].forEach(b => b.disabled = true);
}

async function renderS2Grid() {
  s2.pagesGrid.innerHTML = '';

  for (let pageNum = 1; pageNum <= s2.numPages; pageNum++) {
    const card = document.createElement('div');
    card.className = `page-card ${s2.selectedPages.has(pageNum) ? 'selected' : ''}`;
    card.dataset.page = pageNum;

    card.innerHTML = `
      <div class="page-card-header">
        <span class="page-num">Slide ${pageNum}</span>
        <div class="page-checkbox"></div>
      </div>
      <div class="page-thumb-preview">
        <canvas id="s2-thumb-${pageNum}"></canvas>
      </div>
    `;

    card.addEventListener('click', () => {
      toggleS2Page(pageNum);
    });

    s2.pagesGrid.appendChild(card);

    s2.pdfDoc.getPage(pageNum).then(page => {
      const canvas = document.getElementById(`s2-thumb-${pageNum}`);
      if (!canvas) return;
      const viewport = page.getViewport({ scale: 0.3 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      page.render({ canvasContext: ctx, viewport });
    });
  }
}

function toggleS2Page(pageNum) {
  if (s2.selectedPages.has(pageNum)) {
    s2.selectedPages.delete(pageNum);
  } else {
    s2.selectedPages.add(pageNum);
  }

  const card = s2.pagesGrid.querySelector(`.page-card[data-page="${pageNum}"]`);
  if (card) {
    card.classList.toggle('selected', s2.selectedPages.has(pageNum));
  }
  updateS2SelectionSummary();
}

function updateS2SelectionSummary() {
  const count = s2.selectedPages.size;
  s2.selectedCountBadge.textContent = `${count} of ${s2.numPages} Selected`;
  s2.exportBtn.disabled = count === 0;

  if (count === 0) {
    s2.selectedListEl.textContent = 'None';
  } else {
    const sorted = Array.from(s2.selectedPages).sort((a, b) => a - b);
    s2.selectedListEl.textContent = `Slides: ${sorted.join(', ')}`;
  }
}

// Quick action handlers
s2.btnSelectAll.addEventListener('click', () => {
  for (let i = 1; i <= s2.numPages; i++) s2.selectedPages.add(i);
  s2.pagesGrid.querySelectorAll('.page-card').forEach(c => c.classList.add('selected'));
  updateS2SelectionSummary();
});

s2.btnDeselectAll.addEventListener('click', () => {
  s2.selectedPages.clear();
  s2.pagesGrid.querySelectorAll('.page-card').forEach(c => c.classList.remove('selected'));
  updateS2SelectionSummary();
});

s2.btnSelectOdd.addEventListener('click', () => {
  s2.selectedPages.clear();
  for (let i = 1; i <= s2.numPages; i += 2) s2.selectedPages.add(i);
  s2.pagesGrid.querySelectorAll('.page-card').forEach(c => {
    const p = parseInt(c.dataset.page, 10);
    c.classList.toggle('selected', p % 2 !== 0);
  });
  updateS2SelectionSummary();
});

s2.btnSelectEven.addEventListener('click', () => {
  s2.selectedPages.clear();
  for (let i = 2; i <= s2.numPages; i += 2) s2.selectedPages.add(i);
  s2.pagesGrid.querySelectorAll('.page-card').forEach(c => {
    const p = parseInt(c.dataset.page, 10);
    c.classList.toggle('selected', p % 2 === 0);
  });
  updateS2SelectionSummary();
});

s2.btnApplyRange.addEventListener('click', () => {
  const query = s2.rangeInput.value.trim();
  if (!query) return;

  const parts = query.split(',');
  const matchedPages = new Set();

  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.includes('-')) {
      const [startStr, endStr] = trimmed.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end)) {
        for (let p = Math.min(start, end); p <= Math.max(start, end); p++) {
          if (p >= 1 && p <= s2.numPages) matchedPages.add(p);
        }
      }
    } else {
      const p = parseInt(trimmed, 10);
      if (!isNaN(p) && p >= 1 && p <= s2.numPages) {
        matchedPages.add(p);
      }
    }
  }

  s2.selectedPages = matchedPages;
  s2.pagesGrid.querySelectorAll('.page-card').forEach(c => {
    const p = parseInt(c.dataset.page, 10);
    c.classList.toggle('selected', s2.selectedPages.has(p));
  });
  updateS2SelectionSummary();
});

// EXPORT ONLY SELECTED PAGES (Lossless Vector Copy via pdf-lib)
s2.exportBtn.addEventListener('click', async () => {
  if (!s2.rawPdfBytes || s2.selectedPages.size === 0) return;

  const pdfLib = getPDFLib();
  s2.exportBtn.disabled = true;
  s2.progressContainer.classList.remove('hidden');
  s2.progressBar.style.width = '30%';
  s2.progressText.textContent = 'Extracting selected pages...';

  try {
    const sourceDoc = await pdfLib.PDFDocument.load(s2.rawPdfBytes.slice(0));
    const newDoc = await pdfLib.PDFDocument.create();

    const sortedPageNums = Array.from(s2.selectedPages).sort((a, b) => a - b);
    const zeroBasedIndices = sortedPageNums.map(p => p - 1);

    s2.progressBar.style.width = '60%';
    s2.progressText.textContent = `Copying ${sortedPageNums.length} pages...`;

    const copiedPages = await newDoc.copyPages(sourceDoc, zeroBasedIndices);
    for (const page of copiedPages) {
      newDoc.addPage(page);
    }

    s2.progressBar.style.width = '90%';
    s2.progressText.textContent = 'Generating PDF...';

    const pdfBytes = await newDoc.save();
    downloadBlob(pdfBytes, `${s2.fileName.replace('.pdf', '')}_selected_slides.pdf`, 'application/pdf');

    s2.progressBar.style.width = '100%';
    s2.progressText.textContent = 'Done!';

    setTimeout(() => {
      s2.progressContainer.classList.add('hidden');
      s2.exportBtn.disabled = false;
    }, 1000);
  } catch (err) {
    console.error('Extraction error:', err);
    alert('Extraction error: ' + err.message);
    s2.progressContainer.classList.add('hidden');
    s2.exportBtn.disabled = false;
  }
});

// Helpers
function downloadBlob(data, filename, mimeType) {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
