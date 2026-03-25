export const TOTAL_ROUNDS = 6;

export const ROUND_SEQUENCE = ["A", "C", "A", "C", "A", "D"];

export const FOCUS_OPTIONS = ["现在的状态", "最近的生活", "你眼里的我", "接下来的方向"];

export const ROOM_STATUS = {
  WAITING: "waiting",
  PLAYING: "playing",
  FINISHED: "finished",
};

export const ROUND_PHASE = {
  INTENT: "intent",
  DRAWING: "drawing",
  GUESSING: "guessing",
  REVEALED: "revealed",
};

export const ROOM_EVENT_TYPES = {
  PRESENCE_JOIN: "presence.join",
  PRESENCE_LEAVE: "presence.leave",
  ROUND_STARTED: "round.started",
  STROKE_CREATED: "stroke.created",
  CANVAS_CLEARED: "canvas.cleared",
  CANVAS_REPLACED: "canvas.replaceAllStrokes",
  ROUND_SUBMITTED: "round.submitted",
  GUESS_SUBMITTED: "guess.submitted",
  ROUND_REVEALED: "round.revealed",
  GAME_FINISHED: "game.finished",
  ROOM_UPDATED: "room.updated",
};

export const STORAGE_KEY = "any-door-session";

export const DEFAULT_CANVAS = {
  width: 1024,
  height: 1024,
};
