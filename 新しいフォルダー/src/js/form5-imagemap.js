/* =====================================================================
   form5-imagemap.js ― 様式5 位置図エディタ（任意画像ベース）
   ===================================================================== */

window.App = window.App || {};

App.Form5ImageMap = (function () {
  "use strict";

  const Storage = App.Storage;

  let canvas = null;
  let ctx = null;
  let currentRecId = null;

  // 背景画像
  let bgImg = null;
  let bgImgNaturalW = 1;
  let bgImgNaturalH = 1;

  // パン・ズーム状態
  let viewState = {
    offsetX: 0, // 画像左上のキャンバス座標
    offsetY: 0,
    scale: 1.0,
  };

  // 図形
  let shapes = [];
  let selectedShape = null;
  let currentTool = "select";
  let currentColor = "#dc3545";

  // ドラッグ・描画状態
  let isDragging = false;
  let isDrawing = false;
  let isPanning = false;
  let startX = 0;
  let startY = 0;
  let panStartOffset = null;

  // リサイズ状態
  let isResizing = false;
  let resizeHandle = null; // "nw","ne","sw","se","r"（circle用）
  let resizeStartImg = null; // リサイズ開始時の図形スナップショット

  // ---------------------------------------------------------------
  // 座標変換
  // ---------------------------------------------------------------

  /** キャンバス座標 → 画像座標 */
  function canvasToImage(cx, cy) {
    return {
      x: (cx - viewState.offsetX) / viewState.scale,
      y: (cy - viewState.offsetY) / viewState.scale,
    };
  }

  /** 画像座標 → キャンバス座標 */
  function imageToCanvas(ix, iy) {
    return {
      x: ix * viewState.scale + viewState.offsetX,
      y: iy * viewState.scale + viewState.offsetY,
    };
  }

  // ---------------------------------------------------------------
  // 初期化
  // ---------------------------------------------------------------

  async function init(canvasEl, rec) {
    if (!canvasEl || !rec) return;

    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    currentRecId = String(rec.id);

    const form5Data = Storage.getForm5 ? Storage.getForm5() || {} : {};
    const entry = form5Data[currentRecId] || {};

    shapes = entry.imageMapShapes
      ? JSON.parse(JSON.stringify(entry.imageMapShapes))
      : [];
    viewState = entry.imageMapView
      ? Object.assign({}, entry.imageMapView)
      : { offsetX: 0, offsetY: 0, scale: 1.0 };

    bgImg = null;
    if (
      entry.mapBgData &&
      String(entry.mapBgData).indexOf("data:image") === 0
    ) {
      const img = new Image();
      img.onload = function () {
        bgImg = img;
        bgImgNaturalW = img.naturalWidth;
        bgImgNaturalH = img.naturalHeight;
        render();
      };
      img.src = entry.mapBgData;
    }

    selectedShape = null;
    currentTool = "select";

    canvas.removeEventListener("mousedown", onPointerDown);
    canvas.removeEventListener("mousemove", onPointerMove);
    canvas.removeEventListener("mouseup", onPointerUp);
    canvas.removeEventListener("mouseleave", onPointerUp);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("dblclick", onDblClick);

    canvas.addEventListener("mousedown", onPointerDown);
    canvas.addEventListener("mousemove", onPointerMove);
    canvas.addEventListener("mouseup", onPointerUp);
    canvas.addEventListener("mouseleave", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("dblclick", onDblClick);

    render();
  }

  // ---------------------------------------------------------------
  // 背景画像のロード（file input から）
  // ---------------------------------------------------------------

  function loadImageFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        bgImg = img;
        bgImgNaturalW = img.naturalWidth;
        bgImgNaturalH = img.naturalHeight;
        fitImageToCanvas();
        saveData();
        render();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /** 画像をキャンバスに収まるようにスケール・センタリング */
  function fitImageToCanvas() {
    if (!bgImg || !canvas) return;
    const scaleX = canvas.width / bgImgNaturalW;
    const scaleY = canvas.height / bgImgNaturalH;
    viewState.scale = Math.max(0.1, Math.min(scaleX, scaleY));
    viewState.offsetX = (canvas.width - bgImgNaturalW * viewState.scale) / 2;
    viewState.offsetY = (canvas.height - bgImgNaturalH * viewState.scale) / 2;
  }

  // ---------------------------------------------------------------
  // ツール・色
  // ---------------------------------------------------------------

  function setTool(tool) {
    currentTool = tool;
    selectedShape = null;
    render();
  }

  function setColor(color) {
    currentColor = color;
    if (selectedShape) {
      selectedShape.color = color;
      saveData();
      render();
    }
  }

  function addText() {
    const txt = prompt("挿入するテキストを入力してください:");
    if (!txt || !canvas) return;
    const center = canvasToImage(canvas.width / 2, canvas.height / 2);
    shapes.push({
      type: "text",
      text: txt,
      x: center.x,
      y: center.y,
      color: currentColor,
    });
    setTool("select");
    selectedShape = shapes[shapes.length - 1];
    saveData();
    render();
  }

  function addMarker() {
    const txt = prompt("マーカーのコメントを入力してください:");
    if (!txt || !canvas) return;
    const center = canvasToImage(canvas.width / 2, canvas.height / 2);
    shapes.push({
      type: "marker",
      text: txt,
      x: center.x,
      y: center.y,
      color: currentColor,
    });
    setTool("select");
    selectedShape = shapes[shapes.length - 1];
    saveData();
    render();
  }

  function deleteSelected() {
    if (!selectedShape) return;
    shapes = shapes.filter(function (s) {
      return s !== selectedShape;
    });
    selectedShape = null;
    saveData();
    render();
  }

  function editSelectedText() {
    if (!selectedShape) {
      alert("先に編集対象を選択してください。");
      return;
    }
    if (selectedShape.type !== "text" && selectedShape.type !== "marker") {
      alert("文字またはマーカーを選択してください。");
      return;
    }
    const next = prompt(
      "テキストを編集してください:",
      selectedShape.text || "",
    );
    if (next === null) return;
    selectedShape.text = String(next).trim();
    saveData();
    render();
  }

  function clearAll() {
    const clearBg = confirm(
      "位置図上の全図形を消去しますか？背景画像も削除しますか？",
    );
    shapes = [];
    selectedShape = null;
    if (clearBg) {
      bgImg = null;
      viewState = { offsetX: 0, offsetY: 0, scale: 1.0 };
    }
    saveForm5Data(currentRecId, {
      imageMapShapes: shapes,
      imageMapView: viewState,
    });
    render();
  }

  // ---------------------------------------------------------------
  // 保存
  // ---------------------------------------------------------------
  async function saveData() {
    if (!currentRecId) return;

    const form5Data = Storage.getForm5 ? Storage.getForm5() || {} : {};
    const entry = form5Data[currentRecId] || {};

    entry.imageMapShapes = JSON.parse(JSON.stringify(shapes));
    entry.imageMapView = Object.assign({}, viewState);

    if (bgImg && bgImg.src && String(bgImg.src).indexOf("data:image") === 0) {
      try {
        const compressedData = await compressImageData(bgImg.src, 0.7);
        entry.mapBgData = compressedData;
      } catch (e) {
        console.error("画像の圧縮に失敗しました:", e);
      }
    }

    try {
      entry.mapPreviewData = canvas.toDataURL("image/jpeg", 0.7);
    } catch (e) {
      console.warn("プレビュー画像の保存に失敗:", e);
    }

    form5Data[currentRecId] = entry;

    try {
      if (!Storage.setForm5(form5Data)) {
        throw new Error("位置図データの保存を開始できませんでした。");
      }
      if (App.DataStore) await App.DataStore.flush();
    } catch (e) {
      alert(
        "ストレージ容量が不足しているため保存できませんでした。不要な位置図を削除してください。",
      );
      console.error(e);
      return;
    }

    _updateForm5MapPreview(currentRecId);
  }

  /** 様式5モーダルの位置図プレビューを更新 */
  function _updateForm5MapPreview(recId) {
    const preview = document.getElementById("f5m-map-preview");
    if (!preview) return;

    const form5Data = Storage.getForm5 ? Storage.getForm5() || {} : {};
    const entry = form5Data[recId] || {};
    const imgData = entry.mapPreviewData || entry.mapBgData || null;

    if (imgData) {
      preview.innerHTML = `<img src="${imgData}"
      style="max-width:100%; max-height:100%; object-fit:contain;
      border-radius:6px; display:block; margin:auto;" />`;
    } else {
      preview.innerHTML = "位置図編集ボタンから編集できます";
      preview.style.color = "#64748b";
      preview.style.fontSize = "13px";
    }
  }

  function saveShapesOnly() {
    if (!currentRecId) return;

    const form5Data = Storage.getForm5 ? Storage.getForm5() || {} : {};
    const entry = form5Data[currentRecId] || {};

    entry.imageMapShapes = JSON.parse(JSON.stringify(shapes));
    entry.imageMapView = Object.assign({}, viewState);

    form5Data[currentRecId] = entry;

    try {
      Storage.setForm5(form5Data);
    } catch (e) {
      console.error("図形データ保存失敗:", e);
    }
  }

  // ---------------------------------------------------------------
  // 描画
  // ---------------------------------------------------------------

  function render() {
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 背景
    if (bgImg) {
      ctx.save();
      ctx.translate(viewState.offsetX, viewState.offsetY);
      ctx.scale(viewState.scale, viewState.scale);
      ctx.drawImage(bgImg, 0, 0);
      ctx.restore();
    } else {
      // 画像未選択時のガイド表示
      ctx.fillStyle = "#f1f5f9";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        "↑ 上の「画像を選択」から地図画像を読み込んでください",
        canvas.width / 2,
        canvas.height / 2,
      );
      ctx.textAlign = "left";
    }

    // 図形描画
    shapes.forEach(function (s) {
      const isSel = s === selectedShape;
      ctx.save();

      if (s.type === "rect") {
        const p1 = imageToCanvas(s.x, s.y);
        const p2 = imageToCanvas(s.x + s.w, s.y + s.h);
        ctx.strokeStyle = s.color || "blue";
        ctx.lineWidth = isSel ? 3 : 2;
        ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
        if (isSel) {
          ctx.strokeStyle = "orange";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(p1.x - 2, p1.y - 2, p2.x - p1.x + 4, p2.y - p1.y + 4);
        }
      } else if (s.type === "circle") {
        const pc = imageToCanvas(s.cx, s.cy);
        const pr = imageToCanvas(s.cx + s.r, s.cy);
        const r = pr.x - pc.x;
        ctx.strokeStyle = s.color || "green";
        ctx.lineWidth = isSel ? 3 : 2;
        ctx.beginPath();
        ctx.arc(pc.x, pc.y, r, 0, Math.PI * 2);
        ctx.stroke();
        if (isSel) {
          ctx.strokeStyle = "orange";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(pc.x, pc.y, r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      } else if (s.type === "text") {
        const p = imageToCanvas(s.x, s.y);
        ctx.fillStyle = s.color || "red";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(s.text, p.x, p.y);
      } else if (s.type === "marker") {
        const p = imageToCanvas(s.x, s.y);
        ctx.fillStyle = s.color || "#dc3545";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("📍 " + s.text, p.x + 10, p.y + 4);
      }

      // リサイズハンドル描画（選択中のみ）
      if (isSel) {
        ctx.setLineDash([]);
        if (s.type === "rect") {
          const p1 = imageToCanvas(s.x, s.y);
          const p2 = imageToCanvas(s.x + s.w, s.y + s.h);
          const handles = [
            { x: p1.x, y: p1.y },
            { x: p2.x, y: p1.y },
            { x: p1.x, y: p2.y },
            { x: p2.x, y: p2.y },
          ];
          handles.forEach(function (h) {
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#f97316";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(h.x, h.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          });
        } else if (s.type === "circle") {
          const pc = imageToCanvas(s.cx, s.cy);
          const pr = imageToCanvas(s.cx + s.r, s.cy);
          const rPx = pr.x - pc.x;
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#f97316";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pc.x + rPx, pc.y, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();
    });

    // 出典表記
    if (bgImg) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(canvas.width - 210, canvas.height - 24, 205, 20);
      ctx.fillStyle = "#334155";
      ctx.font = "10px sans-serif";
      ctx.fillText(
        "出典：任意地図画像",
        canvas.width - 200,
        canvas.height - 10,
      );
      ctx.restore();
    }
  }

  function compressImageData(imageData, quality = 0.7, maxDimension = 1600) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = function () {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const compressedData = canvas.toDataURL("image/jpeg", quality);
        resolve(compressedData);
      };
      img.onerror = function () {
        reject("画像の圧縮に失敗しました。");
      };
      img.src = imageData;
    });
  }

  // ---------------------------------------------------------------
  // イベントハンドラ
  // ---------------------------------------------------------------
  function onPointerDown(e) {
    const pos = getCanvasPos(e);
    startX = pos.x;
    startY = pos.y;

    if (currentTool === "select") {
      const handle = findHandleAt(startX, startY);
      if (handle) {
        isResizing = true;
        resizeHandle = handle;
        resizeStartImg = JSON.parse(JSON.stringify(selectedShape));
        return;
      }
      selectedShape = findShapeAt(startX, startY);
      isDragging = !!selectedShape;
      isPanning = !selectedShape;
      panStartOffset = { x: viewState.offsetX, y: viewState.offsetY };
      render();
    } else if (currentTool === "rect" || currentTool === "circle") {
      isDrawing = true;
    }
  }

  function onPointerMove(e) {
    const pos = getCanvasPos(e);
    const currX = pos.x;
    const currY = pos.y;

    // カーソル変更
    if (currentTool === "select") {
      const handle = findHandleAt(currX, currY);
      if (handle) {
        const cursors = {
          nw: "nw-resize",
          ne: "ne-resize",
          sw: "sw-resize",
          se: "se-resize",
          r: "ew-resize",
        };
        canvas.style.cursor = cursors[handle] || "pointer";
      } else if (findShapeAt(currX, currY)) {
        canvas.style.cursor = "move";
      } else {
        canvas.style.cursor = "default";
      }
    }

    // リサイズ
    if (isResizing && selectedShape && resizeStartImg) {
      const imgCurr = canvasToImage(currX, currY);
      const s = selectedShape;
      const snap = resizeStartImg;

      if (s.type === "rect") {
        if (resizeHandle === "nw") {
          s.w = Math.max(5, snap.x + snap.w - imgCurr.x);
          s.h = Math.max(5, snap.y + snap.h - imgCurr.y);
          s.x = snap.x + snap.w - s.w;
          s.y = snap.y + snap.h - s.h;
        } else if (resizeHandle === "ne") {
          s.w = Math.max(5, imgCurr.x - snap.x);
          s.h = Math.max(5, snap.y + snap.h - imgCurr.y);
          s.x = snap.x;
          s.y = snap.y + snap.h - s.h;
        } else if (resizeHandle === "sw") {
          s.w = Math.max(5, snap.x + snap.w - imgCurr.x);
          s.h = Math.max(5, imgCurr.y - snap.y);
          s.x = snap.x + snap.w - s.w;
          s.y = snap.y;
        } else if (resizeHandle === "se") {
          s.w = Math.max(5, imgCurr.x - snap.x);
          s.h = Math.max(5, imgCurr.y - snap.y);
          s.x = snap.x;
          s.y = snap.y;
        }
      } else if (s.type === "circle" && resizeHandle === "r") {
        const dx = imgCurr.x - snap.cx;
        const dy = imgCurr.y - snap.cy;
        s.r = Math.max(5, Math.sqrt(dx * dx + dy * dy));
      }
      render();
      return;
    }

    // パン
    if (isPanning && panStartOffset) {
      viewState.offsetX = panStartOffset.x + (currX - startX);
      viewState.offsetY = panStartOffset.y + (currY - startY);
      render();
      return;
    }

    // ドラッグ移動
    if (isDragging && selectedShape) {
      const dx = currX - startX;
      const dy = currY - startY;
      startX = currX;
      startY = currY;
      const dix = dx / viewState.scale;
      const diy = dy / viewState.scale;

      if (selectedShape.type === "rect") {
        selectedShape.x += dix;
        selectedShape.y += diy;
      } else if (selectedShape.type === "circle") {
        selectedShape.cx += dix;
        selectedShape.cy += diy;
      } else {
        selectedShape.x += dix;
        selectedShape.y += diy;
      }
      render();
      return;
    }

    // 描画プレビュー
    if (isDrawing) {
      render();
      ctx.save();
      ctx.strokeStyle = currentColor;
      ctx.setLineDash([2, 2]);
      ctx.lineWidth = 2;
      if (currentTool === "rect") {
        ctx.strokeRect(startX, startY, currX - startX, currY - startY);
      } else if (currentTool === "circle") {
        const r = Math.sqrt(
          Math.pow(currX - startX, 2) + Math.pow(currY - startY, 2),
        );
        ctx.beginPath();
        ctx.arc(startX, startY, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function onPointerUp(e) {
    if (isResizing) {
      isResizing = false;
      resizeHandle = null;
      resizeStartImg = null;
      saveShapesOnly();
      render();
      return;
    }

    if (isDrawing) {
      const pos = getCanvasPos(e);
      const endX = pos.x;
      const endY = pos.y;
      const imgStart = canvasToImage(startX, startY);
      const imgEnd = canvasToImage(endX, endY);

      if (currentTool === "rect") {
        shapes.push({
          type: "rect",
          x: Math.min(imgStart.x, imgEnd.x),
          y: Math.min(imgStart.y, imgEnd.y),
          w: Math.abs(imgEnd.x - imgStart.x),
          h: Math.abs(imgEnd.y - imgStart.y),
          color: currentColor,
        });
      } else if (currentTool === "circle") {
        const r = Math.sqrt(
          Math.pow(imgEnd.x - imgStart.x, 2) +
            Math.pow(imgEnd.y - imgStart.y, 2),
        );
        shapes.push({
          type: "circle",
          cx: imgStart.x,
          cy: imgStart.y,
          r: r,
          color: currentColor,
        });
      }
      isDrawing = false;
      setTool("select");
      selectedShape = shapes[shapes.length - 1];
      saveData();
      render();
      return;
    }

    if (isDragging) {
      isDragging = false;
      saveShapesOnly();
    } else if (isPanning) {
      isPanning = false;
      saveShapesOnly();
    }
  }

  const ZOOM_MIN = 0.1;
  const ZOOM_MAX = 10;

  function onWheel(e) {
    if (!canvas) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.max(
      ZOOM_MIN,
      Math.min(ZOOM_MAX, viewState.scale * delta),
    );

    // マウス位置を中心にズーム
    viewState.offsetX =
      mx - (mx - viewState.offsetX) * (newScale / viewState.scale);
    viewState.offsetY =
      my - (my - viewState.offsetY) * (newScale / viewState.scale);
    viewState.scale = newScale;
    render();
  }

  /** 表示サイズと論理サイズのズレを補正した座標取得 */
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function findShapeAt(cx, cy) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (s.type === "rect") {
        const p1 = imageToCanvas(s.x, s.y);
        const p2 = imageToCanvas(s.x + s.w, s.y + s.h);
        if (cx >= p1.x && cx <= p2.x && cy >= p1.y && cy <= p2.y) return s;
      } else if (s.type === "circle") {
        const pc = imageToCanvas(s.cx, s.cy);
        const pr = imageToCanvas(s.cx + s.r, s.cy);
        const r = pr.x - pc.x;
        if (Math.sqrt(Math.pow(cx - pc.x, 2) + Math.pow(cy - pc.y, 2)) <= r)
          return s;
      } else if (s.type === "text") {
        const p = imageToCanvas(s.x, s.y);
        if (Math.abs(cx - p.x) < 40 && Math.abs(cy - p.y) < 20) return s;
      } else if (s.type === "marker") {
        const p = imageToCanvas(s.x, s.y);
        if (Math.abs(cx - p.x) < 16 && Math.abs(cy - p.y) < 16) return s;
      }
    }
    return null;
  }

  /** リサイズハンドルの検出 */
  function findHandleAt(cx, cy) {
    if (!selectedShape) return null;
    const HIT = 8; // ヒット判定半径(px)

    if (selectedShape.type === "rect") {
      const p1 = imageToCanvas(selectedShape.x, selectedShape.y);
      const p2 = imageToCanvas(
        selectedShape.x + selectedShape.w,
        selectedShape.y + selectedShape.h,
      );
      const handles = {
        nw: { x: p1.x, y: p1.y },
        ne: { x: p2.x, y: p1.y },
        sw: { x: p1.x, y: p2.y },
        se: { x: p2.x, y: p2.y },
      };
      for (const [key, h] of Object.entries(handles)) {
        if (Math.abs(cx - h.x) <= HIT && Math.abs(cy - h.y) <= HIT) return key;
      }
    } else if (selectedShape.type === "circle") {
      const pc = imageToCanvas(selectedShape.cx, selectedShape.cy);
      const pr = imageToCanvas(
        selectedShape.cx + selectedShape.r,
        selectedShape.cy,
      );
      const rPx = pr.x - pc.x;
      const hx = pc.x + rPx;
      const hy = pc.y;
      if (Math.abs(cx - hx) <= HIT && Math.abs(cy - hy) <= HIT) return "r";
    }
    return null;
  }

  function onDblClick(e) {
    const pos = getCanvasPos(e);
    const shape = findShapeAt(pos.x, pos.y);
    if (!shape) return;
    if (shape.type === "text" || shape.type === "marker") {
      const next = prompt("テキストを編集してください:", shape.text || "");
      if (next === null) return;
      shape.text = String(next).trim();
      saveData();
      render();
    }
  }

  // ---------------------------------------------------------------
  // 公開API
  // ---------------------------------------------------------------

  return {
    init: init,
    setTool: setTool,
    setColor: setColor,
    addText: addText,
    addMarker: addMarker,
    editSelectedText: editSelectedText,
    deleteSelected: deleteSelected,
    clearAll: clearAll,
    loadImageFile: loadImageFile,
    saveData: saveData,
    render: render,
  };
})();
