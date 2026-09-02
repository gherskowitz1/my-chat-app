// Reads a file as a base64 data URL without any re-encoding — used for
// uploads (like soundboard clips) that can't be losslessly resized/compressed
// client-side the way images can.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => resolve(reader.result);
    reader.readAsDataURL(file);
  });
}
