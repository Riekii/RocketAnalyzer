import { normalizeReplay } from "./replay.ts";

export const demoReplay = {
  ...normalizeReplay({
    game_type: "TAGame.Replay_Soccar_TA",
    properties: {
      ReplayName: "Una noche en Champions Field",
      MapName: "Champions Field",
      Date: null,
      TeamSize: 2,
      Team0Score: 4,
      Team1Score: 2,
      NumFrames: 10080,
      RecordFPS: 30,
      PlayerStats: [
        { Name: "You", Team: 0, Score: 724, Goals: 3, Assists: 1, Saves: 3, Shots: 7 },
        { Name: "orbit.", Team: 0, Score: 412, Goals: 1, Assists: 2, Saves: 2, Shots: 4 },
        { Name: "nova", Team: 1, Score: 486, Goals: 1, Assists: 1, Saves: 4, Shots: 5 },
        { Name: "EXO", Team: 1, Score: 298, Goals: 1, Assists: 0, Saves: 1, Shots: 3 },
      ],
      Goals: [
        { PlayerName: "You", PlayerTeam: 0, frame: 1140 },
        { PlayerName: "nova", PlayerTeam: 1, frame: 2640 },
        { PlayerName: "You", PlayerTeam: 0, frame: 4290 },
        { PlayerName: "EXO", PlayerTeam: 1, frame: 6120 },
        { PlayerName: "orbit.", PlayerTeam: 0, frame: 7590 },
        { PlayerName: "You", PlayerTeam: 0, frame: 9150 },
      ],
    },
  }, "ejemplo.replay", "demo"),
  demo: true,
};
