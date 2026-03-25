export function PresenceBadge({ player, isSelf }) {
  return (
    <div className="pill justify-between w-full">
      <div>
        <div className="text-sm font-semibold text-slate-800">{player.nickname}</div>
        <div className="text-xs text-slate-500">{isSelf ? "你" : "对方"}</div>
      </div>
      <span
        className={`text-xs font-medium ${player.status === "offline" ? "text-amber-600" : "text-emerald-700"}`}
      >
        {player.status === "offline" ? "离线中" : "在线"}
      </span>
    </div>
  );
}
