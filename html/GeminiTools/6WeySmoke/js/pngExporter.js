import { encode } from 'https://cdn.jsdelivr.net/npm/fast-png@6.4.0/+esm';

export function encode16BitRGBA(width, height, uint16Data) {
  return encode({
    width,
    height,
    data: uint16Data,
    depth: 16,
    channels: 4,
  });
}

export function triggerDownload(bytes, filename) {
  const blob = new Blob([bytes], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return blob.size;
}
