/*jslint bitwise */

/**
 * A tiny, seedable random source.
 *
 * Randomised skills (SPRING CLEANING removes 1-3 random pieces, FINDERS KEEPERS
 * relocates to a random empty cell) take an injected {@link Rng.Source} so that
 * games can be made fully reproducible in unit tests. Production code injects
 * {@link Rng.math}; tests inject {@link Rng.seeded}.
 *
 * @namespace Rng
 */
const Rng = {};

/**
 * A random source: three pure-looking helpers over an internal stream.
 * @memberof Rng
 * @typedef {object} Source
 * @property {function(): number} next  A float in the range [0, 1).
 * @property {function(number): number} int  Given n, an integer in [0, n).
 * @property {function(Array): *} pick  A uniformly chosen array element.
 */

/**
 * A random source backed by Math.random. Not reproducible; for production use.
 * @memberof Rng
 * @returns {Rng.Source} A fresh Math.random-backed source.
 */
Rng.math = function () {
    const next = function () {
        return Math.random();
    };
    const int = function (n) {
        return Math.floor(next() * n);
    };
    const pick = function (list) {
        return list[int(list.length)];
    };
    return Object.freeze({int, next, pick});
};

/**
 * A deterministic random source (mulberry32) for tests and replays. The same
 * seed always produces the same stream.
 * @memberof Rng
 * @param {number} seed  Any integer seed.
 * @returns {Rng.Source} A reproducible source.
 */
Rng.seeded = function (seed) {
    let state = seed;
    const next = function () {
        state |= 0;
        state = (state + 0x6d2b79f5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = function (n) {
        return Math.floor(next() * n);
    };
    const pick = function (list) {
        return list[int(list.length)];
    };
    return Object.freeze({int, next, pick});
};

export default Object.freeze(Rng);
