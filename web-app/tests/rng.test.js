/*jslint long*/
import Rng from "../rng.js";
import assert from "assert";
import {describe, it} from "mocha";

// Draw three floats from a source, to compare whole streams rather than a
// single value.
const stream = function (source) {
    return [source.next(), source.next(), source.next()];
};


describe("The seeded random source is reproducible", function () {
    it("gives the same stream for the same seed", function () {
        assert.deepEqual(stream(Rng.seeded(123)), stream(Rng.seeded(123)));
    });

    it("gives a different stream for a different seed", function () {
        assert.notDeepEqual(stream(Rng.seeded(1)), stream(Rng.seeded(2)));
    });
});


describe("A random source stays within its documented ranges", function () {
    it("next is in [0, 1) and int(n) is an integer in [0, n)", function () {
        const source = Rng.seeded(7);
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach(function () {
            const float = source.next();
            assert.ok(float >= 0 && float < 1, "next out of range: " + float);
            const whole = source.int(10);
            assert.ok(
                Number.isInteger(whole) && whole >= 0 && whole < 10,
                "int out of range: " + whole
            );
        });
    });

    it("pick returns a member of the list", function () {
        const source = Rng.seeded(5);
        const list = ["a", "b", "c", "d"];
        [0, 1, 2, 3, 4].forEach(function () {
            assert.ok(list.includes(source.pick(list)));
        });
    });
});
