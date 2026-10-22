use crate::domain::MAX_PARTICIPANTS;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};

// Must match packages/poke-lounge-battle/src/tournament-bracket.ts TOURNAMENT_SEED_ORDER_2/4/8 (pnpm check:rust-ts-constants).
pub const SEED_ORDER_2: [usize; 2] = [1, 2];
pub const SEED_ORDER_4: [usize; 4] = [1, 4, 2, 3];
pub const SEED_ORDER_8: [usize; 8] = [1, 8, 4, 5, 3, 6, 2, 7];
// Must match packages/poke-lounge-battle/src/tournament-scoring.ts DEFAULT_TOURNAMENT_SCORE_BY_RANK (pnpm check:rust-ts-constants).
pub const SCORE_BY_RANK: [u64; 6] = [100, 70, 45, 30, 15, 5];

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Entrant {
    pub player_id: String,
    pub display_name: String,
    pub seed: usize,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BracketMatch {
    pub match_id: String,
    pub round_number: usize,
    pub match_number: usize,
    pub participant_a: Entrant,
    pub participant_b: Entrant,
    pub participant_ids: [String; 2],
    pub status: String,
    pub winner_player_id: Option<String>,
    pub loser_player_id: Option<String>,
    pub result_reason: Option<String>,
    pub completed_at_ms: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bye {
    pub bye_id: String,
    pub round_number: usize,
    pub slot_number: usize,
    pub entrant: Entrant,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase", deny_unknown_fields)]
pub enum Slot {
    Match {
        #[serde(rename = "matchId")]
        match_id: String,
    },
    Bye {
        #[serde(rename = "byeId")]
        bye_id: String,
    },
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BracketRound {
    pub round_number: usize,
    pub matches: Vec<BracketMatch>,
    pub byes: Vec<Bye>,
    pub slots: Vec<Slot>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Elimination {
    pub player_id: String,
    pub display_name: String,
    pub seed: usize,
    pub round_number: usize,
    pub match_id: String,
    pub order: usize,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bracket {
    pub version: u8,
    pub game_round_index: u8,
    pub status: String,
    pub participants: Vec<Entrant>,
    pub current_round: Option<BracketRound>,
    pub completed_rounds: Vec<BracketRound>,
    pub eliminations: Vec<Elimination>,
    pub champion_player_id: Option<String>,
}
impl Bracket {
    pub fn new(participants: Vec<Entrant>, index: u8) -> AppResult<Self> {
        if !(2..=MAX_PARTICIPANTS).contains(&participants.len()) {
            return Err(AppError::Invalid("Invalid tournament participant count"));
        }
        let order: &[usize] = if participants.len() <= 2 {
            &SEED_ORDER_2
        } else if participants.len() <= 4 {
            &SEED_ORDER_4
        } else {
            &SEED_ORDER_8
        };
        let entrants = order
            .iter()
            .map(|seed| participants.get(seed - 1).cloned())
            .collect();
        Ok(Self {
            version: 1,
            game_round_index: index,
            status: "in-progress".into(),
            current_round: Some(make_round(index, 1, entrants)?),
            participants,
            completed_rounds: vec![],
            eliminations: vec![],
            champion_player_id: None,
        })
    }
    pub fn ready(&self) -> Vec<BracketMatch> {
        self.current_round
            .as_ref()
            .map(|r| {
                r.matches
                    .iter()
                    .filter(|m| m.status == "ready")
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }
    pub fn record(&mut self, id: &str, winner: &str, reason: &str, now: u64) -> AppResult<()> {
        if self.status == "completed" {
            return Err(AppError::Invalid("Tournament already completed"));
        }
        let round = self
            .current_round
            .as_mut()
            .ok_or(AppError::Invalid("Missing active bracket"))?;
        let m = round
            .matches
            .iter_mut()
            .find(|m| m.match_id == id && m.status == "ready")
            .ok_or(AppError::Invalid("Match is not ready"))?;
        let loser = if m.participant_a.player_id == winner {
            &m.participant_b
        } else if m.participant_b.player_id == winner {
            &m.participant_a
        } else {
            return Err(AppError::Invalid("Winner is not a participant"));
        };
        self.eliminations.push(Elimination {
            player_id: loser.player_id.clone(),
            display_name: loser.display_name.clone(),
            seed: loser.seed,
            round_number: round.round_number,
            match_id: id.into(),
            order: self.eliminations.len() + 1,
        });
        m.status = "completed".into();
        m.winner_player_id = Some(winner.into());
        m.loser_player_id = Some(loser.player_id.clone());
        m.result_reason = Some(reason.into());
        m.completed_at_ms = Some(now);
        if round.matches.iter().any(|m| m.status == "ready") {
            return Ok(());
        }
        let mut entrants = Vec::new();
        for slot in &round.slots {
            let entrant = match slot {
                Slot::Match { match_id } => {
                    let winner = round
                        .matches
                        .iter()
                        .find(|m| &m.match_id == match_id)
                        .and_then(|m| m.winner_player_id.as_ref())
                        .ok_or(AppError::Invalid("Missing match winner"))?;
                    self.participants
                        .iter()
                        .find(|p| &p.player_id == winner)
                        .cloned()
                }
                Slot::Bye { bye_id } => round
                    .byes
                    .iter()
                    .find(|b| &b.bye_id == bye_id)
                    .map(|b| b.entrant.clone()),
            }
            .ok_or(AppError::Invalid("Missing bracket entrant"))?;
            entrants.push(Some(entrant));
        }
        let next_round = round.round_number + 1;
        self.completed_rounds.push(round.clone());
        if entrants.len() == 1 {
            self.champion_player_id = entrants[0].as_ref().map(|p| p.player_id.clone());
            self.status = "completed".into();
            self.current_round = None;
        } else {
            self.current_round = Some(make_round(self.game_round_index, next_round, entrants)?);
        }
        Ok(())
    }
    pub fn scores(&self) -> AppResult<Vec<(String, u64)>> {
        let champion = self
            .champion_player_id
            .clone()
            .ok_or(AppError::Invalid("Tournament is unfinished"))?;
        let mut scores = vec![(champion, 100)];
        let mut rounds = self
            .eliminations
            .iter()
            .map(|e| e.round_number)
            .collect::<Vec<_>>();
        rounds.sort_unstable_by(|a, b| b.cmp(a));
        rounds.dedup();
        for round in rounds {
            // scores.len() + 1 is the rank about to be assigned; ranks past the table score 0.
            let score = SCORE_BY_RANK.get(scores.len()).copied().unwrap_or(0);
            for e in self.eliminations.iter().filter(|e| e.round_number == round) {
                scores.push((e.player_id.clone(), score));
            }
        }
        Ok(scores)
    }
}
fn make_round(game: u8, number: usize, entrants: Vec<Option<Entrant>>) -> AppResult<BracketRound> {
    let mut round = BracketRound {
        round_number: number,
        matches: vec![],
        byes: vec![],
        slots: vec![],
    };
    for pair in entrants.chunks(2) {
        let a = pair.first().and_then(Clone::clone);
        let b = pair.get(1).and_then(Clone::clone);
        match (a, b) {
            (Some(a), Some(b)) => {
                let match_number = round.matches.len() + 1;
                let id = format!("game-round-{game}-bracket-{number}-match-{match_number}");
                round.matches.push(BracketMatch {
                    match_id: id.clone(),
                    round_number: number,
                    match_number,
                    participant_ids: [a.player_id.clone(), b.player_id.clone()],
                    participant_a: a,
                    participant_b: b,
                    status: "ready".into(),
                    winner_player_id: None,
                    loser_player_id: None,
                    result_reason: None,
                    completed_at_ms: None,
                });
                round.slots.push(Slot::Match { match_id: id });
            }
            (Some(entrant), None) | (None, Some(entrant)) => {
                let id = format!(
                    "game-round-{game}-bracket-{number}-bye-{}",
                    round.byes.len() + 1
                );
                round.byes.push(Bye {
                    bye_id: id.clone(),
                    round_number: number,
                    slot_number: round.slots.len() + 1,
                    entrant,
                });
                round.slots.push(Slot::Bye { bye_id: id });
            }
            _ => return Err(AppError::Invalid("Empty bracket slot")),
        }
    }
    Ok(round)
}
