import { createSeededRandom } from "./index";

describe("seeded random", () => {
  it("replays the same sequence for the same seed", () => {
    const first = createSeededRandom("match-1:turn-1");
    const second = createSeededRandom("match-1:turn-1");

    expect(Array.from({ length: 8 }, () => first.next())).toEqual(
      Array.from({ length: 8 }, () => second.next()),
    );
  });

  it("locks the version 1 sequence for replay compatibility", () => {
    const random = createSeededRandom("match-1:turn-1");

    expect(Array.from({ length: 8 }, () => random.next())).toEqual([
      0.6158050235826522, 0.07083799154497683, 0.848704687319696, 0.6879476464819163,
      0.2517451068852097, 0.49163829162716866, 0.2545411146711558, 0.22841727803461254,
    ]);
  });

  it("produces a distinct sequence for a distinct seed", () => {
    const first = createSeededRandom("match-1:turn-1");
    const second = createSeededRandom("match-1:turn-2");

    expect(Array.from({ length: 4 }, () => first.next())).not.toEqual(
      Array.from({ length: 4 }, () => second.next()),
    );
  });

  it("never reads Math.random", () => {
    const spy = jest.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random is forbidden");
    });

    try {
      const random = createSeededRandom("server-owned-seed");
      const values = Array.from({ length: 16 }, () => random.next());

      expect(values.every(value => value >= 0 && value < 1)).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
