/**
 * Cloudflare Worker to proxy requests to the Google Gemini API.
 * It securely adds the API key and forwards requests.
 */

export default {
	async fetch(request, env, ctx) {
	  if (request.headers.get("Upgrade") !== "websocket") {
		return new Response("Expected WebSocket connection", { status: 400 });
	  }
  
	  const url = new URL(request.url);
	  const pathAndQuery = url.pathname + url.search;
	  const targetUrl = `wss://generativelanguage.googleapis.com${pathAndQuery}`;
	  
	  console.log('Target URL:', targetUrl);
  
	  const [client, proxy] = new WebSocketPair();
	  proxy.accept();
	  
	  // Configure client socket to handle binary data properly
	  client.binaryType = 'arraybuffer';
  
	  // store messages received before connection is established
	  let pendingMessages = [];
	  
	  // For ping/pong handling and connection monitoring
	  let lastMessageTime = Date.now();
	  let isConnected = false;
	  let keepAliveInterval = null;
	  
	  // Function to handle ping/pong messages
	  const handlePingPong = (message) => {
	    try {
	      const data = JSON.parse(message);
	      
	      // Handle ping from client
	      if (data.ping) {
	        proxy.send(JSON.stringify({ pong: Date.now() }));
	        return true;
	      }
	      
	      // Handle pong from target
	      if (data.pong) {
	        return true;
	      }
	      
	      return false;
	    } catch (e) {
	      return false;
	    }
	  };
  
	  const connectPromise = new Promise((resolve, reject) => {
		const targetWebSocket = new WebSocket(targetUrl);
  
		// Configure target WebSocket to handle binary data properly
		targetWebSocket.binaryType = 'arraybuffer';
  
		console.log('Initial targetWebSocket readyState:', targetWebSocket.readyState);
  
		// Set up keep-alive to verify connections
		keepAliveInterval = setInterval(() => {
		  const now = Date.now();
		  
		  // Check if we haven't seen a message in 45 seconds
		  if (isConnected && now - lastMessageTime > 45000) {
		    console.warn('No messages received in 45 seconds, checking connection...');
		    
		    // Send a ping to the target if connected
		    if (targetWebSocket.readyState === WebSocket.OPEN) {
		      try {
		        targetWebSocket.send(JSON.stringify({ ping: now }));
		        console.log('Sent ping to target');
		      } catch (error) {
		        console.error('Error sending ping to target:', error);
		      }
		    }
		    
		    // Send a ping to the client
		    try {
		      proxy.send(JSON.stringify({ ping: now }));
		      console.log('Sent ping to client');
		    } catch (error) {
		      console.error('Error sending ping to client:', error);
		    }
		  }
		}, 30000); // Check every 30 seconds
  
		targetWebSocket.addEventListener("open", () => {
		  console.log('Connected to target server');
		  console.log('targetWebSocket readyState after open:', targetWebSocket.readyState);
		  
		  isConnected = true;
		  lastMessageTime = Date.now();
		  
		  // after connection is established, send all pending messages
		  console.log(`Processing ${pendingMessages.length} pending messages`);
		  for (const message of pendingMessages) {
			try {
			  const messageContent = typeof message === 'string' ? message : `Binary data (size: ${message.byteLength || message.size})`;
			  console.log('[Worker] Attempting to send pending message to target:', messageContent.substring(0, 200)); // Log first 200 chars
			  targetWebSocket.send(message);
			  console.log('[Worker] Sent pending message to target:', 
			    typeof message === 'string' ? message.slice(0, 100) : 'Binary data');
			} catch (error) {
			  console.error('[Worker] Error sending pending message to target:', error);
			}
		  }
		  pendingMessages = []; // clear pending message queue
		  resolve(targetWebSocket);
		});
  
		proxy.addEventListener("message", async (event) => {
		  // Update last message time
		  lastMessageTime = Date.now();
		  
		  const isString = typeof event.data === 'string';
		  const isBinary = event.data instanceof ArrayBuffer || event.data instanceof Blob;
		  const messageData = event.data;
		  
		  // Only log non-ping messages
		  if (isString && !messageData.includes('"ping"') && !messageData.includes('"pong"')) {
		    console.log('[Worker] Received message from client:', {
			  dataType: isString ? 'string' : (isBinary ? 'binary' : typeof event.data),
			  dataSize: isString ? event.data.length : (event.data.byteLength || event.data.size || 0),
			  timestamp: new Date().toISOString()
		    });
		    
		    // Log the initial setup message content
		    if (messageData.includes('"setup"')) {
		        console.log('[Worker] Initial client setup message content:', messageData.substring(0, 500)); // Log more content
		    }
		  }
		  
		  // Check for ping/pong
		  if (isString && handlePingPong(messageData)) {
		    return; // Handled by ping/pong logic
		  }
		  
		  if (targetWebSocket.readyState === WebSocket.OPEN) {
			try {
			  // Forward message exactly as received (whether text or binary)
			  targetWebSocket.send(messageData);
			  
			  // Only log non-ping success
			  if (!isString || !messageData.includes('"ping"')) {
			    console.log('[Worker] Successfully sent message to target');
			    // Log forwarded setup message
			    if (isString && messageData.includes('"setup"')) {
			        console.log('[Worker] Forwarded setup message to target:', messageData.substring(0, 500));
			    }
			  }
			} catch (error) {
			  console.error('[Worker] Error sending to target:', error);
			}
		  } else {
			// if connection is not ready, add message to pending queue
			console.log('[Worker] Target connection not ready, queueing message');
			pendingMessages.push(messageData);
		  }
		});
  
		targetWebSocket.addEventListener("message", (event) => {
		  // Update last message time
		  lastMessageTime = Date.now();
		  
		  const isString = typeof event.data === 'string';
		  const isBinary = event.data instanceof ArrayBuffer || event.data instanceof Blob;
		  
		  // Only log non-ping messages
		  if (isString && !event.data.includes('"ping"') && !event.data.includes('"pong"')) {
		    console.log('Received message from gemini:', {
			  dataType: isString ? 'string' : (isBinary ? 'binary' : typeof event.data),
			  dataSize: isString ? event.data.length : (event.data.byteLength || event.data.size || 0),
			  timestamp: new Date().toISOString()
		    });
		  }
		  
		  // Check for ping/pong
		  if (isString && handlePingPong(event.data)) {
		    return; // Handled by ping/pong logic
		  }
		  
		  try {
			if (proxy.readyState === WebSocket.OPEN) {
			  // Forward message exactly as received (whether text or binary)
			  proxy.send(event.data);
			  
			  // Only log non-ping success
			  if (!isString || !event.data.includes('"ping"')) {
			    console.log('Successfully forwarded message to client');
			  }
			}
		  } catch (error) {
			console.error('Error forwarding to client:', error);
		  }
		});
  
		targetWebSocket.addEventListener("close", (event) => {
		  isConnected = false;
		  
		  console.log('Gemini connection closed:', {
			code: event.code,
			reason: event.reason || 'No reason provided',
			wasClean: event.wasClean,
			timestamp: new Date().toISOString(),
			readyState: targetWebSocket.readyState
		  });
		  
		  if (keepAliveInterval) {
		    clearInterval(keepAliveInterval);
		    keepAliveInterval = null;
		  }
		  
		  if (proxy.readyState === WebSocket.OPEN) {
			proxy.close(event.code, event.reason);
		  }
		});
  
		proxy.addEventListener("close", (event) => {
		  isConnected = false;
		  
		  console.log('Client connection closed:', {
			code: event.code,
			reason: event.reason || 'No reason provided',
			wasClean: event.wasClean,
			timestamp: new Date().toISOString()
		  });
		  
		  if (keepAliveInterval) {
		    clearInterval(keepAliveInterval);
		    keepAliveInterval = null;
		  }
		  
		  if (targetWebSocket.readyState === WebSocket.OPEN) {
			targetWebSocket.close(event.code, event.reason);
		  }
		});
  
		targetWebSocket.addEventListener("error", (error) => {
		  console.error('Gemini WebSocket error:', {
			error: error.message || 'Unknown error',
			timestamp: new Date().toISOString(),
			readyState: targetWebSocket.readyState
		  });
		});
	  });
  
	  ctx.waitUntil(connectPromise);
  
	  return new Response(null, {
		status: 101,
		webSocket: client,
	  });
	},
  };