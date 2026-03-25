export type DownloadOptions = {
  filename: string;
  mimeType?: string;
};

function isIos(): boolean {
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
}

function isAndroid(): boolean {
  const ua = navigator.userAgent || '';
  return /Android/.test(ua);
}

function isMobile(): boolean {
  return isIos() || isAndroid();
}

/**
 * Triggers a file download from a Blob.
 * Works on desktop Chrome/Safari/Firefox, iOS Safari, and Android Chrome.
 */
export function triggerBlobDownload(blob: Blob, options: DownloadOptions): void {
  const { filename, mimeType = 'application/pdf' } = options;

  // Ensure proper MIME type for the blob
  const typedBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
  const objectUrl = URL.createObjectURL(typedBlob);

  try {
    if (isIos()) {
      // iOS Safari: open in new tab (user can then use Share > Save to Files)
      const newWindow = window.open(objectUrl, '_blank');
      if (!newWindow) {
        // If popup blocked, try the fallback approach
        fallbackDownload(objectUrl, filename);
      }
      // Clean up after delay (give iOS time to open)
      setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      return;
    }

    if (isAndroid() && (navigator as any).share && typedBlob.size < 5 * 1024 * 1024) {
      // Android with Web Share API for files (if available and file < 5MB)
      const file = new File([typedBlob], filename, { type: mimeType });
      if ((navigator as any).canShare && (navigator as any).canShare({ files: [file] })) {
        (navigator as any).share({
          files: [file],
          title: filename
        }).catch(() => {
          // If share fails, fallback to standard download
          fallbackDownload(objectUrl, filename);
        });
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
        return;
      }
    }

    // Standard download for desktop and Android fallback
    fallbackDownload(objectUrl, filename);

    // Clean up object URL after delay
    setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
    }, 60000);

  } catch (err) {
    // Final fallback: try opening in new tab instead of navigation
    try {
      window.open(objectUrl, '_blank');
    } catch {
      // ignore final fallback failure
    }
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }
}

function fallbackDownload(objectUrl: string, filename: string): void {
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.style.display = 'none';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  document.body.appendChild(link);

  // Trigger click with proper user activation context
  const clickEvent = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    view: window
  });
  link.dispatchEvent(clickEvent);

  // Small delay before removal to ensure click processes
  setTimeout(() => {
    if (link.parentNode) {
      link.parentNode.removeChild(link);
    }
  }, 100);
}

/**
 * Safely revokes an object URL if it exists.
 */
export function revokeBlobUrl(objectUrl: string | null | undefined): void {
  if (!objectUrl) return;
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // ignore
  }
}
