"use client";

import { create } from "zustand";
import { createRealtimeAdapter } from "@/lib/realtime-adapter";
import { readSession, saveSession } from "@/lib/storage";

async function getJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const data = await response.json();

  if (!response.ok || data.ok === false) {
    throw new Error(data.message || "请求没有成功");
  }

  return data;
}

export const useRoomStore = create((set, get) => ({
  room: null,
  session: null,
  isLoading: false,
  error: null,
  connectionState: "idle",
  adapter: null,
  unsubscribe: null,

  hydrateSession() {
    const session = readSession();
    if (session) {
      set({ session });
    }
    return session;
  },

  setSession(session) {
    saveSession(session);
    set({ session });
  },

  clearError() {
    set({ error: null });
  },

  async refreshRoom(roomCode) {
    set({ isLoading: true, error: null });
    try {
      const data = await getJson(`/api/rooms/${roomCode}`);
      set({ room: data.room, isLoading: false });
      return data.room;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  applyRoom(room) {
    set({ room });
  },

  async postAndApply(url, body) {
    set({ isLoading: true, error: null });
    try {
      const data = await getJson(url, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (data.room) {
        set({ room: data.room });
      }
      set({ isLoading: false });
      return data;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  async initRealtime(roomCode, playerId) {
    const currentAdapter = get().adapter;
    if (currentAdapter) {
      return currentAdapter;
    }

    const adapter = createRealtimeAdapter({ roomCode, playerId });
    await adapter.connect(roomCode, playerId);
    const unsubscribe = adapter.subscribeToRoomEvents(roomCode, () => {
      get().refreshRoom(roomCode).catch(() => null);
    });

    set({
      adapter,
      unsubscribe,
      connectionState: "connected",
    });

    return adapter;
  },

  cleanupRealtime() {
    const adapter = get().adapter;
    const unsubscribe = get().unsubscribe;

    unsubscribe?.();
    adapter?.disconnect?.();

    set({
      adapter: null,
      unsubscribe: null,
      connectionState: "idle",
    });
  },
}));
