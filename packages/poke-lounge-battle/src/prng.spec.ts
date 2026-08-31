import { createSeededRandom } from "./prng";

describe("seeded random", function testSuite() {
  it("replays the same sequence for the same seed", function testCase() {
    const first = createSeededRandom("match-1:turn-1");
    const second = createSeededRandom("match-1:turn-1");

    expect(
      Array.from({ length: 8 }, function callback() {
        return first.next();
      }),
    ).toEqual(
      Array.from({ length: 8 }, function callback() {
        return second.next();
      }),
    );
  });

  it("locks the version 1 sequence for replay compatibility", function testCase() {
    const random = createSeededRandom("match-1:turn-1");

    expect(
      Array.from({ length: 8 }, function callback() {
        return random.next();
      }),
    ).toEqual([
      0.6158050235826522, 0.07083799154497683, 0.848704687319696, 0.6879476464819163,
      0.2517451068852097, 0.49163829162716866, 0.2545411146711558, 0.22841727803461254,
    ]);
  });

  it("produces a distinct sequence for a distinct seed", function testCase() {
    const first = createSeededRandom("match-1:turn-1");
    const second = createSeededRandom("match-1:turn-2");

    expect(
      Array.from({ length: 4 }, function callback() {
        return first.next();
      }),
    ).not.toEqual(
      Array.from({ length: 4 }, function callback() {
        return second.next();
      }),
    );
  });

  it("never reads Math.random", function testCase() {
    const spy = jest.spyOn(Math, "random").mockImplementation(function mockImplementation() {
      throw new Error("Math.random is forbidden");
    });

    try {
      const random = createSeededRandom("server-owned-seed");
      const values = Array.from({ length: 16 }, function callback() {
        return random.next();
      });

      expect(
        values.every(function testItem(value) {
          return value >= 0 && value < 1;
        }),
      ).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
