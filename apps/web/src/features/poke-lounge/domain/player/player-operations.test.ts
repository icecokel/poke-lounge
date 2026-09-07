import {
  createDefaultLocalPlayer,
  createGameStateStore,
} from "@/components/poke-lounge/runtime/game/state/game-state-store";
import { loadPublicRuntimeGameDataFixture } from "@/components/poke-lounge/runtime/game/testing/runtime-rom-data.fixture";
import assert from "node:assert/strict";
import test from "node:test";
import { transferPcPokemon } from "../../application/world/pc-transfer";
import { playDice } from "../../application/world/play-dice";
import type { LocalPlayerState } from "../../contracts/game-state";
import { freeze } from "../../testing/freeze";
import {
  consumeInventoryItem,
  useInventoryItemOnPartySlot,
} from "../inventory/inventory-operations";
import { getShopItemById } from "../inventory/item-catalog";
import { purchaseItem } from "../inventory/purchase-item";
import { createDiceGambleRound } from "../wallet/dice-rules";
import { settleDiceGambleResult } from "../wallet/wallet-operations";
import { createStarterPlayerPokemon } from "./create-starter-pokemon";
import {
  healCurrentParty,
  moveBoxPokemonToParty,
  movePartyPokemonToBox,
  setActivePartySlot,
} from "./party-operations";

test.before(loadPublicRuntimeGameDataFixture);
function player(): LocalPlayerState {
  const state = createDefaultLocalPlayer();
  const first = createStarterPlayerPokemon({ speciesId: 152 }),
    second = createStarterPlayerPokemon({ speciesId: 155 });
  return {
    ...state,
    wallet: { pokeDollars: 1000 },
    party: [
      { slotIndex: 0, pokemon: first },
      { slotIndex: 1, pokemon: second },
    ],
  };
}
test("파티·PC 규칙은 동결된 입력을 변경하지 않고 다음 상태를 반환한다", () => {
  const before = freeze(player());
  const copy = structuredClone(before);
  const deposited = movePartyPokemonToBox(before, 1);
  assert.equal(deposited.changed, true);
  assert.equal(deposited.player.pokemonBox.length, 1);
  assert.equal(deposited.player.party.length, 1);
  assert.deepEqual(before, copy);
  const withdrawn = moveBoxPokemonToParty(freeze(deposited.player), 0);
  assert.equal(withdrawn.changed, true);
  assert.equal(withdrawn.player.party.length, 2);
  assert.equal(withdrawn.player.pokemonBox.length, 0);
});
test("마지막 포켓몬 보관·빈 슬롯·기절한 선두 지정은 저장할 변경을 만들지 않는다", () => {
  const p = player();
  p.party = p.party.slice(0, 1);
  const before = freeze(p);
  const last = movePartyPokemonToBox(before, 0);
  assert.deepEqual(last.result, { ok: false, reason: "last-pokemon" });
  assert.equal(last.player, before);
  assert.equal(last.changed, false);
  assert.equal(setActivePartySlot(before, 99).changed, false);
  const fainted = player();
  fainted.party[1]!.pokemon!.currentHp = 0;
  fainted.party[1]!.pokemon!.status = "fainted";
  assert.deepEqual(setActivePartySlot(freeze(fainted), 1).result, { ok: false, reason: "fainted" });
});
test("소지 아이템 차감·회복은 각각 하나의 불변 상태 제안이다", () => {
  const p = player();
  p.party[0]!.pokemon!.currentHp = 1;
  const before = freeze(p);
  const consumed = consumeInventoryItem(before, "potion", 1);
  assert.equal(consumed.player.inventory.potion, 4);
  assert.equal(before.inventory.potion, 5);
  const used = useInventoryItemOnPartySlot(before, "potion", 0);
  assert.equal(used.result.ok, true);
  assert.equal(used.player.inventory.potion, 4);
  assert.ok((used.player.party[0]!.pokemon!.currentHp ?? 0) > 1);
  assert.equal(before.party[0]!.pokemon!.currentHp, 1);
  const healed = healCurrentParty(before);
  assert.equal(healed.player.party[0]!.pokemon!.currentHp, healed.player.party[0]!.pokemon!.maxHp);
});
test("상점 구매는 가격·재고를 함께 계산하고 실패 시 원본을 보존한다", () => {
  const before = freeze(player());
  const price = getShopItemById("potion")!.price;
  const bought = purchaseItem(before, ["potion"], "potion", 2);
  assert.equal(bought.result.ok, true);
  assert.equal(bought.player.wallet.pokeDollars, 1000 - price * 2);
  assert.equal(bought.player.inventory.potion, 7);
  assert.equal(before.wallet.pokeDollars, 1000);
  const failed = purchaseItem(before, ["potion"], "potion", 1000);
  assert.equal(failed.changed, false);
  assert.equal(failed.player, before);
  assert.equal(purchaseItem(before, ["potion"], "potion", 0).changed, false);
});
test("주사위 정산 규칙은 입력을 변경하지 않고 유효한 금액만 반영한다", () => {
  const before = freeze(player());
  const next = settleDiceGambleResult(before, { stakePokeDollars: 100, rewardPokeDollars: 300 });
  assert.equal(next.player.wallet.pokeDollars, 1200);
  assert.equal(before.wallet.pokeDollars, 1000);
  for (const stake of [0, -1, 1.1, NaN, Infinity])
    assert.equal(
      settleDiceGambleResult(before, { stakePokeDollars: stake, rewardPokeDollars: 0 }).changed,
      false,
    );
});
test("저장소 어댑터는 성공한 도메인 변경에만 저장·알림을 한 번 실행한다", () => {
  let saves = 0,
    notifications = 0;
  const store = createGameStateStore({
    storage: {
      loadLocalPlayers: () => null,
      saveLocalPlayers: () => {
        saves++;
      },
      clear: () => {},
    },
  });
  store.upsertLocalPlayer(player());
  saves = 0;
  store.subscribe(() => {
    notifications++;
  });
  store.consumeInventoryItem("potion", 999);
  assert.equal(saves, 0);
  assert.equal(notifications, 0);
  store.consumeInventoryItem("potion", 1);
  assert.equal(saves, 1);
  assert.equal(notifications, 1);
});
test("PC 흐름은 파티가 찼을 때만 교환으로 이어지며 기절한 선두 교환은 거부한다", () => {
  const store = createGameStateStore();
  const p = player();
  const pokemon = p.party[0]!.pokemon!;
  p.party = Array.from({ length: 6 }, (_, slotIndex) => ({
    slotIndex,
    pokemon: structuredClone(pokemon),
  }));
  p.pokemonBox = [{ ...structuredClone(pokemon), currentHp: 0 }];
  store.upsertLocalPlayer(p);
  const result = transferPcPokemon(store, { focus: "box", partySlot: 0, boxIndex: 0 });
  assert.deepEqual(result, { kind: "rejected", reason: "fainted-active-replacement" });
  const next = transferPcPokemon(store, { focus: "box", partySlot: 1, boxIndex: 0 });
  assert.equal(next.kind, "swapped");
  assert.equal(store.getCurrentLocalPlayer().party[1]!.pokemon!.currentHp, 0);
});
test("주사위 진행 서비스는 불가능한 예측이나 잔액 부족에서 금액을 소비하지 않는다", () => {
  const store = createGameStateStore();
  store.upsertLocalPlayer(player());
  const impossible = playDice(store, createDiceGambleRound(1), "lower", 1);
  assert.deepEqual(impossible, { kind: "rejected", reason: "invalid-prediction" });
  assert.equal(store.getCurrentLocalPlayer().wallet.pokeDollars, 1000);
  store.setLocalPlayerPokeDollars(0);
  assert.equal(playDice(store, createDiceGambleRound(3), "higher", 4).kind, "rejected");
  assert.equal(store.getCurrentLocalPlayer().wallet.pokeDollars, 0);
});
