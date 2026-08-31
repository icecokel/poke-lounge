import { createHash } from "node:crypto";

import { canonicalize, hashCanonicalState, type CanonicalBattleState } from "./canonical-state";

describe("canonical state", function testSuite() {
  it("sorts object keys recursively while preserving array order", function testCase() {
    expect(
      canonicalize({
        z: 3,
        a: [{ z: 2, a: 1 }, "second"],
        m: { y: true, x: null },
      }),
    ).toBe('{"a":[{"a":1,"z":2},"second"],"m":{"x":null,"y":true},"z":3}');
  });

  it.each([undefined, Number.NaN, Number.POSITIVE_INFINITY, 1n])(
    "rejects non-JSON value %p",
    function callback(value) {
      expect(function callback() {
        return canonicalize(value);
      }).toThrow("canonical JSON");
    },
  );

  it("rejects cyclic structures", function testCase() {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(function callback() {
      return canonicalize(cyclic);
    }).toThrow("canonical JSON");
  });

  it("rejects sparse arrays instead of converting holes to null", function testCase() {
    const sparse = new Array(2);
    sparse[1] = "present";

    expect(function callback() {
      return canonicalize(sparse);
    }).toThrow("sparse array");
  });

  it("preserves an own __proto__ key without mutating the output prototype", function testCase() {
    const value = Object.create(null) as Record<string, unknown>;
    value.__proto__ = "data";
    value.a = 1;

    expect(canonicalize(value)).toBe('{"__proto__":"data","a":1}');
  });

  it("hashes canonical state with SHA-256", function testCase() {
    const state = { z: 2, a: 1 } as unknown as CanonicalBattleState;
    const expected = createHash("sha256").update('{"a":1,"z":2}', "utf8").digest("hex");

    expect(hashCanonicalState(state)).toBe(expected);
    expect(hashCanonicalState(state)).toMatch(/^[a-f0-9]{64}$/);
  });
});
