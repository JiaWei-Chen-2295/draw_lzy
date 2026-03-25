"use client";

export class PollingRealtimeAdapter {
  constructor({ roomCode, playerId }) {
    this.roomCode = roomCode;
    this.playerId = playerId;
    this.cursor = 0;
    this.timer = null;
    this.handler = null;
  }

  async connect() {
    await this.publishPresence({
      status: "online",
      lastSeenAt: Date.now(),
    });
  }

  disconnect() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }

    return this.publishPresence({
      status: "offline",
      lastSeenAt: Date.now(),
    }).catch(() => null);
  }

  subscribeToRoomEvents(roomCode, handler) {
    this.roomCode = roomCode;
    this.handler = handler;
    this.poll();

    return () => {
      if (this.timer) {
        window.clearTimeout(this.timer);
        this.timer = null;
      }
    };
  }

  async poll() {
    try {
      const response = await fetch(`/api/realtime/events?roomCode=${this.roomCode}&cursor=${this.cursor}`, {
        cache: "no-store",
      });
      const data = await response.json();

      if (response.ok) {
        this.cursor = data.cursor ?? this.cursor;
        data.events?.forEach((event) => this.handler?.(event));
      }
    } catch {
      // Keep polling even if one request fails.
    } finally {
      this.timer = window.setTimeout(() => this.poll(), 1200);
    }
  }

  async publish(eventType, payload) {
    await fetch("/api/realtime/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode: this.roomCode,
        eventType,
        payload,
        playerId: this.playerId,
      }),
    });
  }

  publishStroke(roomCode, payload) {
    this.roomCode = roomCode;
    return this.publish("stroke.created", payload);
  }

  publishPresence(roomCodeOrPayload, maybePayload) {
    const roomCode = typeof roomCodeOrPayload === "string" ? roomCodeOrPayload : this.roomCode;
    const payload = typeof roomCodeOrPayload === "string" ? maybePayload : roomCodeOrPayload;

    return fetch("/api/realtime/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode,
        playerId: this.playerId,
        payload,
      }),
    });
  }

  publishRoundState(roomCode, payload) {
    this.roomCode = roomCode;
    return this.publish("room.updated", payload);
  }
}

export function createRealtimeAdapter(config) {
  return new PollingRealtimeAdapter(config);
}
