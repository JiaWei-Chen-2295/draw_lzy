export function scoreRound(drawerIntent, guesserAnswer) {
  const focusMatched = drawerIntent?.focusChoice === guesserAnswer?.focusChoice;
  const vibeMatched = drawerIntent?.vibeChoice === guesserAnswer?.vibeChoice;

  return {
    focusMatched,
    vibeMatched,
    score: Number(focusMatched) + Number(vibeMatched),
  };
}

export function buildSummary(room, rounds) {
  const totalRounds = rounds.length;
  const focusHits = rounds.filter((round) => round.result?.focusMatched).length;
  const vibeHits = rounds.filter((round) => round.result?.vibeMatched).length;
  const sortedByScore = [...rounds].sort((left, right) => (right.result?.score ?? 0) - (left.result?.score ?? 0));
  const sortedByMismatch = [...rounds].sort((left, right) => (left.result?.score ?? 0) - (right.result?.score ?? 0));

  return {
    roomCode: room.roomCode,
    totalRounds,
    focusHits,
    vibeHits,
    closestRoundId: sortedByScore[0]?.roundId ?? null,
    biggestDriftRoundId: sortedByMismatch[0]?.roundId ?? null,
    generatedAt: Date.now(),
    giftPageReserved: {
      keywords: [],
      narrativeSeed: null,
    },
  };
}
