/**
 * Home OS — Telegram Bridge Extension
 * 
 * Provides Telegram messaging capabilities for all agents.
 * Handles message formatting, chunking, and delivery.
 * 
 * Tools exposed:
 * - telegram_send_message: Send a message to a chat
 * - telegram_send_photo: Send a photo with caption
 * - telegram_get_status: Check bridge health
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MAX_MESSAGE_LENGTH = 4096;

/**
 * Send a message to a Telegram chat.
 * Supports Markdown formatting (auto-converted to HTML).
 * Messages longer than 4096 chars are automatically chunked.
 */
export async function sendMessage({ chat_id, message }) {
  if (!TELEGRAM_BOT_TOKEN) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured. See config/telegram.env' };
  }

  if (!chat_id || !message) {
    return { success: false, error: 'chat_id and message are required' };
  }

  // Convert markdown to HTML for Telegram
  const html = markdownToTelegramHtml(message);

  // Chunk if needed
  const chunks = chunkMessage(html, MAX_MESSAGE_LENGTH);
  const results = [];

  for (const chunk of chunks) {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id,
        text: chunk,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const data = await response.json();
    results.push(data);

    if (!data.ok) {
      return { success: false, error: data.description, results };
    }
  }

  return { success: true, chunks_sent: chunks.length, results };
}

/**
 * Send a photo to a Telegram chat.
 */
export async function sendPhoto({ chat_id, photo, caption }) {
  if (!TELEGRAM_BOT_TOKEN) {
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' };
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id,
      photo,
      caption: caption ? markdownToTelegramHtml(caption) : undefined,
      parse_mode: caption ? 'HTML' : undefined
    })
  });

  const data = await response.json();
  return { success: data.ok, data };
}

/**
 * Get Telegram bot status and info.
 */
export async function getStatus() {
  if (!TELEGRAM_BOT_TOKEN) {
    return { configured: false, error: 'TELEGRAM_BOT_TOKEN not set' };
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
  const data = await response.json();

  return {
    configured: true,
    connected: data.ok,
    bot: data.ok ? {
      username: data.result.username,
      name: data.result.first_name,
      can_read_messages: data.result.can_read_all_group_messages
    } : null
  };
}

/**
 * Convert Markdown formatting to Telegram HTML.
 */
function markdownToTelegramHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')       // **bold**
    .replace(/\*(.+?)\*/g, '<i>$1</i>')            // *italic*
    .replace(/`(.+?)`/g, '<code>$1</code>')        // `code`
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>'); // [text](url)
}

/**
 * Split a message into chunks that respect Telegram's 4096 char limit.
 * Tries to break at newlines when possible.
 */
function chunkMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point (prefer newlines)
    let breakPoint = remaining.lastIndexOf('\n', maxLength);
    if (breakPoint < maxLength * 0.5) {
      // No good newline found, break at space
      breakPoint = remaining.lastIndexOf(' ', maxLength);
    }
    if (breakPoint < maxLength * 0.3) {
      // No good space found, hard break
      breakPoint = maxLength;
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint).trimStart();
  }

  return chunks;
}
