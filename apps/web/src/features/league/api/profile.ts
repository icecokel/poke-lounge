import { leagueRequest } from "./core";
export const setLeagueNickname = (nickname: string) =>
  leagueRequest<{ nickname: string; changeableAtMs: number }>("/profile/nickname", {
    method: "PUT",
    body: { nickname: nickname.normalize("NFC") },
  });
