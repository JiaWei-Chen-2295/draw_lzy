import { NextResponse } from "next/server";

const ERROR_MESSAGES = {
  ROOM_NOT_FOUND: "房间没找到，可能输错啦",
  ROOM_FULL: "这个房间已经满员了",
  ROOM_ALREADY_STARTED: "这局已经开始了",
  ONLY_HOST_CAN_START: "这一轮得由房主来开始",
  PLAYER_NOT_READY: "还差一位伙伴，先等等",
  ROOM_FINISHED: "这一局已经结束啦",
  GAME_COMPLETE: "六轮已经都走完了",
  ROUND_NOT_FOUND: "这一轮好像还没准备好",
  INVALID_INTENT_PAYLOAD: "这一步还没选完整，先把两个选项都选上",
  INVALID_GUESS_PAYLOAD: "这一步还没选完整，先把两个选项都选上",
  ONLY_DRAWER_CAN_SET_INTENT: "这一段只有作画的人能先定答案",
  ONLY_DRAWER_CAN_SUBMIT_DRAWING: "完成作画这一步需要作画者来提交",
  ONLY_GUESSER_CAN_SUBMIT: "这一步留给猜的人来选",
  PLAYER_NOT_FOUND: "没有找到你的玩家身份，试试重新加入",
};

export function success(data, init = {}) {
  return NextResponse.json(data, init);
}

export function failure(error, status = 400) {
  const code = typeof error === "string" ? error : error?.message;
  const hasMappedMessage = code && Object.hasOwn(ERROR_MESSAGES, code);
  return NextResponse.json(
    {
      ok: false,
      code: hasMappedMessage ? code : "BAD_REQUEST",
      message: hasMappedMessage ? ERROR_MESSAGES[code] : code || "这一步出了点小岔子，请再试一次",
    },
    { status },
  );
}
