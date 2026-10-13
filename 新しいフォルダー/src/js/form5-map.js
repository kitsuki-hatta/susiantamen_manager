/* =====================================================================
   form5-map.js ― 様式5 位置図エディタ（地理院タイル・協定範囲GeoJSON・作図・マーカー）
   ===================================================================== */

window.App = window.App || {};

App.Form5Map = (function () {
  "use strict";

  const Storage = App.Storage;

  let canvas = null;
  let ctx = null;
  let bgImg = null;
  let shapes = [];
  let currentTool = "select"; // 'select', 'rect', 'circle', 'text', 'marker'

  let isDragging = false;
  let isDrawing = false;
  let isMapPanning = false;
  let selectedShape = null;

  let startX = 0;
  let startY = 0;
  let currentRecId = null;
  let panStartCenter = null;
  let mapState = {
    centerLat: 33.2382,
    centerLng: 131.6126,
    zoom: 16,
    baseType: "gsi_tile",
  };
  const tileCache = {};

  // 緯度経度・タイルの共通処理
  function latLngToTile(lat, lng, zoom) {
    const rad = (lat * Math.PI) / 180;
    const n = Math.pow(2, zoom);
    const xtile = Math.floor(((lng + 180) / 360) * n);
    const ytile = Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
    );
    return { x: xtile, y: ytile };
  }

  function latLngToPoint(lat, lng, zoom) {
    const rad = (lat * Math.PI) / 180;
    const n = Math.pow(2, zoom);
    const x = ((lng + 180) / 360) * n * 256;
    const y =
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      n *
      256;
    return { x: x, y: y };
  }

  function pointToLatLng(x, y, zoom) {
    const n = Math.pow(2, zoom);
    const lng = (x / (n * 256)) * 360 - 180;
    const yy = Math.PI * (1 - (2 * y) / (n * 256));
    const lat =
      (180 / Math.PI) * Math.atan(0.5 * (Math.exp(yy) - Math.exp(-yy)));
    return { lat: lat, lng: lng };
  }

  function projectToCanvas(lat, lng) {
    const centerPt = latLngToPoint(
      mapState.centerLat,
      mapState.centerLng,
      mapState.zoom,
    );
    const pt = latLngToPoint(lat, lng, mapState.zoom);
    return {
      x: canvas.width / 2 + (pt.x - centerPt.x),
      y: canvas.height / 2 + (pt.y - centerPt.y),
    };
  }

  function canvasToLatLng(x, y) {
    const centerPt = latLngToPoint(
      mapState.centerLat,
      mapState.centerLng,
      mapState.zoom,
    );
    const worldX = centerPt.x + (x - canvas.width / 2);
    const worldY = centerPt.y + (y - canvas.height / 2);
    return pointToLatLng(worldX, worldY, mapState.zoom);
  }

  function resolveTileOrgId() {
    // 市町村コード → タイルディレクトリ名 マッピング
    const CODE_TO_DIR = {
      44210: "kitsuki", // 杵築市
      // 他の市町村を追加する場合はここに記載
      // "44201": "oita",
    };

    const settings = Storage.getSettings ? Storage.getSettings() : {};
    const muni = settings.municipality || {};
    const code = String(muni.code || "").trim();

    // コードで一致するディレクトリ名を返す
    if (code && CODE_TO_DIR[code]) {
      return CODE_TO_DIR[code];
    }

    // フォールバック：名前から正規化して使用
    const name = String(muni.name || "").trim();
    if (name) {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "");
    }

    return "default";
  }

  function tileUrlCandidates(settings, z, x, y) {
    const mode = settings.mapTileMode || "online";

    if (mode === "bundled") {
      const orgId = resolveTileOrgId();
      const urls = [
        // 実際のディレクトリ構造に合わせた形式
        "data/tile/" + orgId + "/" + z + "/" + x + "_" + y + ".png",
      ];
      // orgId が default 以外なら default もフォールバックに追加
      if (orgId !== "default") {
        urls.push("data/tile/default/" + z + "/" + x + "_" + y + ".png");
      }
      return urls;
    }

    // オンライン（地理院タイル）
    return [
      "https://cyberjapandata.gsi.go.jp/xyz/std/" +
        z +
        "/" +
        x +
        "/" +
        y +
        ".png",
    ];
  }

  function drawMapTiles(settings) {
    const centerPoint = latLngToPoint(
      mapState.centerLat,
      mapState.centerLng,
      mapState.zoom,
    );
    const topLeftWorld = {
      x: centerPoint.x - canvas.width / 2,
      y: centerPoint.y - canvas.height / 2,
    };
    const firstTileX = Math.floor(topLeftWorld.x / 256);
    const firstTileY = Math.floor(topLeftWorld.y / 256);
    const lastTileX = Math.floor((topLeftWorld.x + canvas.width) / 256);
    const lastTileY = Math.floor((topLeftWorld.y + canvas.height) / 256);
    const maxTile = Math.pow(2, mapState.zoom);

    for (let ty = firstTileY; ty <= lastTileY; ty++) {
      for (let tx = firstTileX; tx <= lastTileX; tx++) {
        let wrappedX = tx % maxTile;
        if (wrappedX < 0) wrappedX += maxTile;
        if (ty < 0 || ty >= maxTile) continue;

        const drawX = tx * 256 - topLeftWorld.x;
        const drawY = ty * 256 - topLeftWorld.y;
        const key =
          mapState.zoom +
          ":" +
          wrappedX +
          ":" +
          ty +
          ":" +
          (settings.mapTileMode || "online");
        const cached = tileCache[key];

        if (cached && cached.loaded) {
          ctx.drawImage(cached.img, drawX, drawY, 256, 256);
          continue;
        }

        if (!cached) {
          const img = new Image();
          const candidates = tileUrlCandidates(
            settings,
            mapState.zoom,
            wrappedX,
            ty,
          );
          tileCache[key] = {
            img: img,
            loaded: false,
            candidates: candidates,
            index: 0,
          };

          img.onload = function () {
            tileCache[key].loaded = true;
            render();
          };
          img.onerror = function () {
            const slot = tileCache[key];
            if (!slot) return;
            slot.index += 1;
            if (slot.index < slot.candidates.length) {
              slot.img.src = slot.candidates[slot.index];
              return;
            }
            slot.loaded = false;
          };
          img.src = candidates[0];
        }

        ctx.fillStyle = "#eef2f7";
        ctx.fillRect(drawX, drawY, 256, 256);
        ctx.strokeStyle = "#d0d7de";
        ctx.strokeRect(drawX, drawY, 256, 256);
        ctx.fillStyle = "#64748b";
        ctx.font = "10px sans-serif";
        ctx.fillText(
          mapState.zoom + "/" + wrappedX + "/" + ty,
          drawX + 8,
          drawY + 16,
        );
      }
    }
  }

  /**
   * キャンバスおよびデータを初期化
   */
  function init(canvasEl, rec) {
    if (!canvasEl || !rec) return;
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    currentRecId = String(rec.id);

    const form5Data = Storage.getForm5 ? Storage.getForm5() || {} : {};
    const entry = form5Data[currentRecId] || {};
    const settings = Storage.getSettings ? Storage.getSettings() : {};
    const muni = settings.municipality || { lat: 33.2382, lng: 131.6126 };

    mapState = {
      centerLat:
        Number(entry.map && entry.map.center && entry.map.center.lat) ||
        Number(muni.lat) ||
        33.2382,
      centerLng:
        Number(entry.map && entry.map.center && entry.map.center.lng) ||
        Number(muni.lng) ||
        131.6126,
      zoom: Math.max(
        16,
        Math.min(16, Number(entry.map && entry.map.zoom) || 16),
      ),
      baseType: (entry.map && entry.map.baseType) || "gsi_tile",
    };

    const bgData = entry.mapBgData || rec.mapBgData || null;
    shapes = entry.mapShapes
      ? JSON.parse(JSON.stringify(entry.mapShapes))
      : rec.mapShapes
        ? JSON.parse(JSON.stringify(rec.mapShapes))
        : [];
    bgImg = null;
    selectedShape = null;

    if (bgData) {
      bgImg = new Image();
      bgImg.onload = render;
      bgImg.src = bgData;
    } else {
      render();
    }

    canvas.onmousedown = null;
    canvas.onmousemove = null;
    canvas.onmouseup = null;
    canvas.onmouseleave = null;

    canvas.addEventListener("mousedown", onPointerDown);
    canvas.addEventListener("mousemove", onPointerMove);
    canvas.addEventListener("mouseup", onPointerUp);
    canvas.addEventListener("mouseleave", onPointerUp);
    canvas.addEventListener("wheel", onWheel, { passive: false });
  }

  function setTool(tool) {
    currentTool = tool;
    selectedShape = null;
    render();
  }

  function addText() {
    const txt = prompt("挿入するテキストを入力してください:");
    if (txt && canvas) {
      shapes.push({
        type: "text",
        text: txt,
        x: canvas.width / 2,
        y: canvas.height / 2,
        color: "red",
      });
      setTool("select");
      selectedShape = shapes[shapes.length - 1];
      saveData();
      render();
    }
  }

  function addMarker() {
    const txt = prompt("作業位置のマーカーコメントを入力してください:");
    if (txt && canvas) {
      const center = canvasToLatLng(canvas.width / 2, canvas.height / 2);
      shapes.push({
        type: "marker",
        text: txt,
        x: canvas.width / 2,
        y: canvas.height / 2,
        lat: center.lat,
        lng: center.lng,
        color: "#dc3545",
      });
      setTool("select");
      selectedShape = shapes[shapes.length - 1];
      saveData();
      render();
    }
  }

  function deleteSelected() {
    if (selectedShape) {
      shapes = shapes.filter(function (s) {
        return s !== selectedShape;
      });
      selectedShape = null;
      saveData();
      render();
    }
  }

  function editSelectedText() {
    if (!selectedShape) {
      alert("先に編集対象の文字またはマーカーを選択してください。");
      return;
    }
    if (selectedShape.type !== "text" && selectedShape.type !== "marker") {
      alert("文字またはマーカーを選択してください。");
      return;
    }
    const current = String(selectedShape.text || "");
    const next = prompt("テキストを編集してください:", current);
    if (next === null) return;
    selectedShape.text = String(next).trim();
    saveData();
    render();
  }

  function clearAll() {
    if (confirm("位置図上の全図形・マーカーを消去しますか？")) {
      shapes = [];
      bgImg = null;
      selectedShape = null;
      saveData();
      render();
    }
  }

  function setBgImage(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        bgImg = img;
        saveData();
        render();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function saveData() {
    if (!currentRecId) return;
    const form5Data = Storage.getForm5 ? Storage.getForm5() || {} : {};
    const entry = form5Data[currentRecId] || {};

    entry.mapShapes = shapes;
    entry.map = {
      baseType: mapState.baseType,
      center: { lat: mapState.centerLat, lng: mapState.centerLng },
      zoom: mapState.zoom,
    };
    if (bgImg && bgImg.src && bgImg.src.indexOf("data:image") === 0) {
      entry.mapBgData = bgImg.src;
      entry.map.baseType = "uploaded_image";
    } else if (bgImg === null) {
      delete entry.mapBgData;
    }

    form5Data[currentRecId] = entry;
    Storage.setForm5(form5Data);
  }

  /**
   * 協定範囲 GeoJSON のオーバーレイ描画
   */
  function renderGeoJSON(ctx, settings) {
    const areaData = settings.activityArea;
    if (!areaData || !areaData.geojson) return;

    const geojson = areaData.geojson;
    const style = areaData.style || {
      strokeColor: "#0044ff",
      fillColor: "#0088ff",
      opacity: 0.3,
    };

    function toCanvasXY(lat, lng) {
      return projectToCanvas(lat, lng);
    }

    ctx.save();
    ctx.strokeStyle = style.strokeColor || "#0044ff";
    ctx.fillStyle = style.fillColor || "#0088ff";
    ctx.globalAlpha = parseFloat(style.opacity) || 0.3;
    ctx.lineWidth = 2;

    function drawRings(rings) {
      rings.forEach(function (ring) {
        if (!ring || !ring.length) return;
        ctx.beginPath();
        ring.forEach(function (coord, i) {
          const lng = coord[0],
            lat = coord[1];
          const p = toCanvasXY(lat, lng);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      });
    }

    const features =
      geojson.type === "FeatureCollection"
        ? geojson.features
        : geojson.type === "Feature"
          ? [geojson]
          : [{ geometry: geojson }];

    features.forEach(function (f) {
      const geom = f.geometry || f;
      if (geom.type === "Polygon") {
        drawRings(geom.coordinates);
      } else if (geom.type === "MultiPolygon") {
        geom.coordinates.forEach(function (poly) {
          drawRings(poly);
        });
      }
    });

    ctx.restore();
  }

  /**
   * キャンバス描画メインルーチン
   */
  function render() {
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const settings = Storage.getSettings ? Storage.getSettings() : {};
    const muni = settings.municipality || {
      lat: 33.2382,
      lng: 131.6126,
      name: "大分市",
    };

    // 背景描画（アップロード画像 or 白地）
    if (bgImg) {
      ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    } else {
      drawMapTiles(settings);
      const p = projectToCanvas(mapState.centerLat, mapState.centerLng);
      ctx.fillStyle = "#475569";
      ctx.font = "12px sans-serif";
      ctx.fillText(
        "📍 地図中心: " + muni.name + " 役場周辺 (Z" + mapState.zoom + ")",
        15,
        25,
      );
      ctx.strokeStyle = "#f43f5e";
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y);
      ctx.lineTo(p.x + 6, p.y);
      ctx.moveTo(p.x, p.y - 6);
      ctx.lineTo(p.x, p.y + 6);
      ctx.stroke();
    }

    // 協定範囲 GeoJSON の重ね描画
    renderGeoJSON(ctx, settings);

    // 全図形・マーカーの描画
    shapes.forEach(function (s) {
      const isSel = s === selectedShape;
      ctx.save();

      if (s.type === "rect") {
        ctx.strokeStyle = s.color || "blue";
        ctx.lineWidth = isSel ? 3 : 2;
        ctx.strokeRect(s.x, s.y, s.w, s.h);
      } else if (s.type === "circle") {
        ctx.strokeStyle = s.color || "green";
        ctx.lineWidth = isSel ? 3 : 2;
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (s.type === "text") {
        ctx.fillStyle = s.color || "red";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(s.text, s.x, s.y);
      } else if (s.type === "marker") {
        const markerPos =
          s.lat != null && s.lng != null
            ? projectToCanvas(s.lat, s.lng)
            : { x: s.x, y: s.y };
        s.x = markerPos.x;
        s.y = markerPos.y;
        // ピンマーカーの描画
        ctx.fillStyle = s.color || "#dc3545";
        ctx.beginPath();
        ctx.arc(markerPos.x, markerPos.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.stroke();

        // 吹き出しテキスト
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("📍 " + s.text, markerPos.x + 10, markerPos.y + 4);
      }

      if (isSel && s.type !== "text" && s.type !== "marker") {
        ctx.strokeStyle = "orange";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        if (s.type === "rect")
          ctx.strokeRect(s.x - 2, s.y - 2, s.w + 4, s.h + 4);
        else if (s.type === "circle") {
          ctx.beginPath();
          ctx.arc(s.cx, s.cy, s.r + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      ctx.restore();
    });

    // 必須：出典明記（右下固定）
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fillRect(canvas.width - 210, canvas.height - 24, 205, 20);
    ctx.fillStyle = "#334155";
    ctx.font = "10px sans-serif";
    ctx.fillText(
      "出典：国土地理院（地理院タイル）",
      canvas.width - 200,
      canvas.height - 10,
    );
    ctx.restore();
  }

  // イベントハンドラー (Pointer)
  function onPointerDown(e) {
    const rect = canvas.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    if (currentTool === "select") {
      selectedShape = findShapeAt(startX, startY);
      isDragging = !!selectedShape;
      isMapPanning = !selectedShape;
      panStartCenter = latLngToPoint(
        mapState.centerLat,
        mapState.centerLng,
        mapState.zoom,
      );
      render();
    } else if (currentTool === "rect" || currentTool === "circle") {
      isDrawing = true;
    }
  }

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const currX = e.clientX - rect.left;
    const currY = e.clientY - rect.top;

    if (isMapPanning && panStartCenter) {
      const dx = currX - startX;
      const dy = currY - startY;
      const nextCenter = pointToLatLng(
        panStartCenter.x - dx,
        panStartCenter.y - dy,
        mapState.zoom,
      );
      mapState.centerLat = nextCenter.lat;
      mapState.centerLng = nextCenter.lng;
      render();
      return;
    }

    if (isDragging && selectedShape) {
      const dx = currX - startX;
      const dy = currY - startY;
      startX = currX;
      startY = currY;

      if (selectedShape.type === "rect") {
        selectedShape.x += dx;
        selectedShape.y += dy;
      } else if (selectedShape.type === "circle") {
        selectedShape.cx += dx;
        selectedShape.cy += dy;
      } else if (
        selectedShape.type === "text" ||
        selectedShape.type === "marker"
      ) {
        selectedShape.x += dx;
        selectedShape.y += dy;
        if (selectedShape.type === "marker") {
          const ll = canvasToLatLng(selectedShape.x, selectedShape.y);
          selectedShape.lat = ll.lat;
          selectedShape.lng = ll.lng;
        }
      }
      render();
    } else if (isDrawing) {
      render();
      ctx.save();
      ctx.strokeStyle = "gray";
      ctx.setLineDash([2, 2]);
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
    if (isDrawing) {
      const rect = canvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;

      if (currentTool === "rect") {
        shapes.push({
          type: "rect",
          x: Math.min(startX, endX),
          y: Math.min(startY, endY),
          w: Math.abs(endX - startX),
          h: Math.abs(endY - startY),
          color: "blue",
        });
      } else if (currentTool === "circle") {
        const r = Math.sqrt(
          Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2),
        );
        shapes.push({
          type: "circle",
          cx: startX,
          cy: startY,
          r: r,
          color: "green",
        });
      }
      isDrawing = false;
      setTool("select");
      selectedShape = shapes[shapes.length - 1];
      saveData();
      render();
    } else if (isDragging) {
      isDragging = false;
      saveData();
    } else if (isMapPanning) {
      isMapPanning = false;
      saveData();
    }
  }

  function onWheel(e) {
    if (!canvas || bgImg) return;
    e.preventDefault();
    const next = mapState.zoom + (e.deltaY < 0 ? 1 : -1);
    mapState.zoom = Math.max(16, Math.min(17, next));
    saveData();
    render();
  }

  function findShapeAt(x, y) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      const s = shapes[i];
      if (
        s.type === "rect" &&
        x >= s.x &&
        x <= s.x + s.w &&
        y >= s.y &&
        y <= s.y + s.h
      )
        return s;
      if (
        s.type === "circle" &&
        Math.sqrt(Math.pow(x - s.cx, 2) + Math.pow(y - s.cy, 2)) <= s.r
      )
        return s;
      if (s.type === "text" && Math.abs(x - s.x) < 30 && Math.abs(y - s.y) < 20)
        return s;
      if (s.type === "marker") {
        const markerPos =
          s.lat != null && s.lng != null
            ? projectToCanvas(s.lat, s.lng)
            : { x: s.x, y: s.y };
        if (Math.abs(x - markerPos.x) < 16 && Math.abs(y - markerPos.y) < 16)
          return s;
      }
    }
    return null;
  }

  return {
    init: init,
    setTool: setTool,
    addText: addText,
    addMarker: addMarker,
    editSelectedText: editSelectedText,
    deleteSelected: deleteSelected,
    clearAll: clearAll,
    setBgImage: setBgImage,
    loadBackground: setBgImage,
    render: render,
  };
})();
