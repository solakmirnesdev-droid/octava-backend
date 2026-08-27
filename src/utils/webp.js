/**
 * A WebP file starts with "RIFF", four bytes of length, then "WEBP".
 *
 * Checked against the bytes rather than the Content-Type header, because the
 * header is whatever the client claims. A renamed JPEG announcing itself as
 * WebP would otherwise be stored and then fail to render for every visitor.
 */
export function isWebp(buf) {
  return Buffer.isBuffer(buf)
    && buf.length > 12
    && buf.toString('ascii', 0, 4) === 'RIFF'
    && buf.toString('ascii', 8, 12) === 'WEBP';
}

/** Small on purpose: these are thumbnails beside a name, never a page's subject. */
export const MAX_PORTRAIT_BYTES = 10 * 1024;
