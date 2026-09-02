import React, { useEffect, useRef, useState } from 'react';
import styles from './ImageCropper.module.css';

const VIEWPORT = 280; // px, always square — the crop is always a square/circle
const OUTPUT_SIZE = 256;
const ZOOM_MIN = 1;
const ZOOM_MAX = 3;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// Pan/zoom crop-to-square, no library — drags and a zoom slider move the
// image under a fixed circular guide, then a canvas draws exactly what's
// inside that guide out to a 256x256 square. Reused for both avatars and
// server icons, since both render as circles in the UI regardless of the
// shape shown while cropping.
export default function ImageCropper({ file, onCancel, onCrop }) {
  const [imgEl, setImgEl] = useState(null);
  const [baseScale, setBaseScale] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 }); // top-left of the displayed image, in viewport px
  const [error, setError] = useState('');
  const viewportRef = useRef(null);
  const dragRef = useRef(null); // { startX, startY, startPos }

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.max(VIEWPORT / img.naturalWidth, VIEWPORT / img.naturalHeight);
      setBaseScale(scale);
      setZoom(1);
      // Center the image in the viewport at the initial (cover) scale.
      const dispW = img.naturalWidth * scale;
      const dispH = img.naturalHeight * scale;
      setPos({ x: (VIEWPORT - dispW) / 2, y: (VIEWPORT - dispH) / 2 });
      setImgEl(img);
    };
    img.onerror = () => setError('Could not read that image.');
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clampPos = (x, y, z) => {
    if (!imgEl) return { x, y };
    const dispW = imgEl.naturalWidth * baseScale * z;
    const dispH = imgEl.naturalHeight * baseScale * z;
    return {
      x: clamp(x, VIEWPORT - dispW, 0),
      y: clamp(y, VIEWPORT - dispH, 0),
    };
  };

  const onZoomChange = (e) => {
    const z = Number(e.target.value);
    setZoom(z);
    setPos((p) => clampPos(p.x, p.y, z));
  };

  const onWheel = (e) => {
    e.preventDefault();
    const z = clamp(zoom - e.deltaY * 0.002, ZOOM_MIN, ZOOM_MAX);
    setZoom(z);
    setPos((p) => clampPos(p.x, p.y, z));
  };

  const onPointerDown = (e) => {
    viewportRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPos: pos };
  };

  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const { startX, startY, startPos } = dragRef.current;
    const next = clampPos(startPos.x + (e.clientX - startX), startPos.y + (e.clientY - startY), zoom);
    setPos(next);
  };

  const onPointerUp = () => { dragRef.current = null; };

  const save = () => {
    if (!imgEl) return;
    const s = baseScale * zoom;
    const sourceX = -pos.x / s;
    const sourceY = -pos.y / s;
    const sourceSize = VIEWPORT / s;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    canvas.getContext('2d').drawImage(
      imgEl,
      sourceX, sourceY, sourceSize, sourceSize,
      0, 0, OUTPUT_SIZE, OUTPUT_SIZE
    );
    onCrop(canvas.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <h3>Adjust image</h3>

        {error ? (
          <p className={styles.error}>{error}</p>
        ) : (
          <>
            <div
              ref={viewportRef}
              className={styles.viewport}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            >
              {imgEl && (
                <img
                  src={imgEl.src}
                  alt=""
                  draggable={false}
                  className={styles.image}
                  style={{
                    width: imgEl.naturalWidth * baseScale * zoom,
                    height: imgEl.naturalHeight * baseScale * zoom,
                    left: pos.x,
                    top: pos.y,
                  }}
                />
              )}
              <div className={styles.guide} />
            </div>

            <input
              type="range"
              className={styles.zoomSlider}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              value={zoom}
              onChange={onZoomChange}
              disabled={!imgEl}
            />
            <p className={styles.hint}>Drag to reposition, scroll or use the slider to zoom.</p>
          </>
        )}

        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.saveBtn} onClick={save} disabled={!imgEl}>Save</button>
        </div>
      </div>
    </div>
  );
}
