import Link from "next/link";
import { PresenceBadge } from "@/components/PresenceBadge";

export function RoomLobby({ room, session, onStart, isLoading }) {
  const isHost = room.hostPlayerId === session?.playerId;

  return (
    <div className="space-y-5">
      <section className="panel p-5 md:p-6">
        <span className="pill text-xs text-slate-600">房间已就位</span>
        <h1 className="mt-4 text-3xl font-semibold text-slate-900">房间码 {room.roomCode}</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">面对面坐好，各自拿一台设备。等两个人都进来，就可以开始这 6 轮了。</p>
      </section>

      <section className="grid gap-3">
        {room.players.map((player) => (
          <PresenceBadge key={player.playerId} player={player} isSelf={player.playerId === session?.playerId} />
        ))}
      </section>

      {isHost ? (
        <button type="button" className="btn-primary w-full" onClick={onStart} disabled={isLoading || room.players.length < 2}>
          {room.players.length < 2 ? "再等一位伙伴" : "开始这局"}
        </button>
      ) : (
        <div className="panel p-5 text-sm text-slate-600">等房主按下开始。你先深呼吸一下，别急着把画想得太具体。</div>
      )}

      <Link href="/" className="btn-ghost w-full">
        回到首页
      </Link>
    </div>
  );
}
