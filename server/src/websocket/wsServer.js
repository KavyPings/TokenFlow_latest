// ═══════════════════════════════════════════════════════════
// WebSocket Server — Real-time event broadcasting
// ═══════════════════════════════════════════════════════════

import { WebSocketServer } from 'ws';

let wss = null;

/**
 * Initialize WebSocket server on an existing HTTP server
 */
export function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
    });

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'SYSTEM',
      payload: {
        message: 'Connected to TokenFlow OS',
        timestamp: new Date().toISOString(),
      },
    }));
  });

  console.log('[WS] WebSocket server initialized');
  return wss;
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcast(data) {
  if (!wss) return;

  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

export function getWss() {
  return wss;
}
