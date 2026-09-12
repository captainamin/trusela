/**
 * Converts various Google Drive link formats into a direct embeddable URL
 * that can be used in <img> tags without triggering CORB errors.
 */
/**
 * Converts various Google Drive link formats into a direct embeddable URL
 * that can be used in <img> tags without triggering CORB errors.
 */
export const getEmbedUrl = (url: string | null | undefined, userId?: string): string => {
  if (!url) return '';
  
  // If it's already a base64 data URL, return as is
  if (url.startsWith('data:image')) return url;
  
  // Try to extract the file ID from various Drive URL formats
  let fileId = '';
  
  const idMatch = url.match(/id=([^&]+)/) || url.match(/\/d\/([^/]+)/);
  if (idMatch && idMatch[1]) {
    fileId = idMatch[1];
  }

  if (fileId) {
    // Existing Drive links may already be public. Newly uploaded files use the
    // signed proxy URL returned by the API and are handled above unchanged.
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  return url;
};
