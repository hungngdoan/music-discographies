/** Serialises rows to RFC 4180 CSV. Fields containing a quote, comma, CR or LF get quoted. */
export function toCsv(rows) {
  return rows.map((row) => row.map(escapeField).join(',')).join('\r\n');
}

function escapeField(value) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Copies text to the clipboard. The async Clipboard API needs a secure context,
 * which GitHub Pages and localhost both provide, but the textarea fallback keeps
 * the button working when the page is opened over plain http from a LAN address.
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or insecure context. Fall through to the fallback.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
