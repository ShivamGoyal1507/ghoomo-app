import { getApiBaseUrl } from "./api";

function toWebSocketUrl(httpUrl) {
  if (httpUrl.startsWith("https://")) {
    return httpUrl.replace("https://", "wss://");
  }
  if (httpUrl.startsWith("http://")) {
    return httpUrl.replace("http://", "ws://");
  }
  return `ws://${httpUrl}`;
}

export function subscribeRideRealtime(rideId, { onRideUpdate, onError } = {}) {
  if (!rideId) {
    return () => {};
  }

  const baseUrl = getApiBaseUrl();
  const wsUrl = `${toWebSocketUrl(baseUrl)}/ws`;
  let socket;
  let reconnectTimer;
  let closedByClient = false;

  const connect = () => {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          action: "subscribe_ride",
          rideId,
        })
      );
    };

    socket.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload?.type === "ride:update" && payload.ride?.id === rideId) {
        onRideUpdate?.(payload.ride);
      }
    };

    socket.onerror = (error) => {
      onError?.(error);
    };

    socket.onclose = () => {
      if (closedByClient) return;
      reconnectTimer = setTimeout(connect, 1500);
    };
  };

  connect();

  return () => {
    closedByClient = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: "unsubscribe_ride", rideId }));
    }
    socket?.close?.();
  };
}

export function subscribeBusRealtime({ onBusUpdate, onError } = {}) {
  const baseUrl = getApiBaseUrl();
  const wsUrl = `${toWebSocketUrl(baseUrl)}/ws`;
  let socket;
  let reconnectTimer;
  let closedByClient = false;

  const connect = () => {
    socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      socket.send(JSON.stringify({ action: "subscribe_bus" }));
    };

    socket.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (payload?.type === "bus:update") {
        onBusUpdate?.(payload);
      }
    };

    socket.onerror = (error) => {
      onError?.(error);
    };

    socket.onclose = () => {
      if (closedByClient) return;
      reconnectTimer = setTimeout(connect, 1500);
    };
  };

  connect();

  return () => {
    closedByClient = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ action: "unsubscribe_bus" }));
    }
    socket?.close?.();
  };
}
