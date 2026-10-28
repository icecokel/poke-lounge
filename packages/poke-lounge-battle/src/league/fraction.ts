import type { LeagueFraction } from "./contract";

export class Fraction {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint | number, den: bigint | number = 1) {
    let n = BigInt(num),
      d = BigInt(den);
    if (d === 0n) throw new RangeError("Zero denominator");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    let a = n < 0n ? -n : n,
      b = d;
    while (b !== 0n) {
      const remainder = a % b;
      a = b;
      b = remainder;
    }
    this.num = n / a;
    this.den = d / a;
  }

  add(other: Fraction): Fraction {
    return new Fraction(this.num * other.den + other.num * this.den, this.den * other.den);
  }
  mul(other: Fraction): Fraction {
    return new Fraction(this.num * other.num, this.den * other.den);
  }
  div(other: Fraction): Fraction {
    return new Fraction(this.num * other.den, this.den * other.num);
  }
  compare(other: Fraction): number {
    const difference = this.num * other.den - other.num * this.den;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }
  roundHalfUp(): bigint {
    if (this.num < 0n) throw new RangeError("roundHalfUp requires a nonnegative value");
    return (2n * this.num + this.den) / (2n * this.den);
  }
  toJSON(): LeagueFraction {
    return { num: String(this.num), den: String(this.den) };
  }
  static fromJSON(value: LeagueFraction): Fraction {
    if (!/^-?(0|[1-9]\d*)$/.test(value.num) || !/^[1-9]\d*$/.test(value.den))
      throw new TypeError("Invalid fraction");
    const result = new Fraction(BigInt(value.num), BigInt(value.den));
    if (result.num.toString() !== value.num || result.den.toString() !== value.den)
      throw new TypeError("Fraction must be reduced");
    return result;
  }
}
