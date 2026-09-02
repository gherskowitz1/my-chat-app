const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
const IMAGE_MAX_DIMENSION = 1920;

export function isImageMime(mimeType) {
  return typeof mimeType === 'string' && mimeType.startsWith('image/');
}

// A plain <img>/<a> can't carry an Authorization header, so the attachment's
// own auth token rides along as a query param instead — see
// authFromHeaderOrQuery on the server.
export function attachmentUrl(id) {
  const token = localStorage.getItem('token');
  return `${BASE}/attachments/${id}?token=${encodeURIComponent(token || '')}`;
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}

// Resizes an image client-side (mirroring the avatar/emoji upload pattern)
// before it's ever staged for upload — keeps a phone photo from blowing
// through the per-message size cap on its own. Non-image files can't be
// losslessly shrunk, so those are just read as-is.
async function prepareImage(file) {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Could not read image'));
    el.src = dataUrl;
  });

  let { width, height } = img;
  if (width > IMAGE_MAX_DIMENSION || height > IMAGE_MAX_DIMENSION) {
    if (width > height) {
      height = Math.round(height * (IMAGE_MAX_DIMENSION / width));
      width = IMAGE_MAX_DIMENSION;
    } else {
      width = Math.round(width * (IMAGE_MAX_DIMENSION / height));
      height = IMAGE_MAX_DIMENSION;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const isLossless = file.type === 'image/png' || file.type === 'image/gif';
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  const outType = isLossless ? 'image/png' : 'image/jpeg';
  const outData = canvas.toDataURL(outType, 0.85);
  return { data: outData, mimeType: outType, width, height };
}

// Builds the {filename, mimeType, data, width, height} shape the
// with-attachments send endpoints expect, from a raw File/Blob (a picked
// file or a pasted clipboard image).
export async function prepareAttachment(file) {
  if (isImageMime(file.type)) {
    const { data, mimeType, width, height } = await prepareImage(file);
    return { filename: file.name || 'image', mimeType, data, width, height };
  }
  const data = await readFileAsDataUrl(file);
  return { filename: file.name || 'file', mimeType: file.type || 'application/octet-stream', data, width: null, height: null };
}

// Rough size check against a staged batch — the server has the final say
// (it measures the actual base64 payload), this is just to fail fast in the
// UI before spending time uploading.
export function totalStagedBytes(staged) {
  return staged.reduce((sum, a) => sum + Math.ceil((a.data.length * 3) / 4), 0);
}
