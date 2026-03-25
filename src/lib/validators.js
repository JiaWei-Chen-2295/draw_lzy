import { FOCUS_OPTIONS } from "@/lib/constants";

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateNickname(nickname) {
  if (!isNonEmptyString(nickname)) {
    return "先起个昵称吧";
  }

  if (nickname.trim().length > 24) {
    return "昵称别太长，24 个字内刚刚好";
  }

  return null;
}

export function validateRoomCode(roomCode) {
  if (!isNonEmptyString(roomCode)) {
    return "需要房间码才能加入";
  }

  if (!/^[A-Z0-9]{6}$/.test(roomCode.trim().toUpperCase())) {
    return "房间码看起来不太对";
  }

  return null;
}

export function validateIntentPayload(payload, vibeOptions) {
  if (!payload || !FOCUS_OPTIONS.includes(payload.focusChoice)) {
    return "先选这张画更像在说什么";
  }

  if (!payload.vibeChoice || !vibeOptions.includes(payload.vibeChoice)) {
    return "再选一个最接近的感觉";
  }

  return null;
}
