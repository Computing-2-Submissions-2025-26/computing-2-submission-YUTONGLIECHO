/*jslint long*/
import Chaos from "../ChaosGomoku.js";
import Ai from "../ai.js";
import Rng from "../rng.js";
import assert from "assert";
import {describe, it} from "mocha";
import invariants from "./invariants.js";

const BLACK = Chaos.player_one;
const WHITE = Chaos.player_two;
const TRIALS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// Apply an action and assert it was legal, returning the new state.
const ok = function (action, state, rng) {
    const result = Chaos.apply(action, state, rng);
    assert.ok(result.ok, "expected legal action: " + JSON.stringify(result.error));
    return result.state;
};

// Build a position by playing a fixed list of [row, col] placements, ending
// each turn unless the placement already won.
const play_placements = function (state, moves) {
    return moves.reduce(function (current, move) {
        const placed = ok(Chaos.place(move[0], move[1]), current);
        return (
            Chaos.is_over(placed)
            ? placed
            : ok(Chaos.end_turn(), placed)
        );
    }, state);
};

// Play `plies` always-legal random placements (alternating sides) so the AI can
// be probed on varied, realistic positions without reaching inside the opaque
// state. Stops early if someone wins or the board fills.
const random_position = function (plies, rng) {
    let state = Chaos.new_game();
    let played = 0;
    while (played < plies && !Chaos.is_over(state)) {
        const empties = Chaos.empty_cells(state);
        if (empties.length === 0) {
            return state;
        }
        const cell = empties[rng.int(empties.length)];
        state = ok(Chaos.place(cell[0], cell[1]), state, rng);
        if (!Chaos.is_over(state)) {
            state = ok(Chaos.end_turn(), state, rng);
        }
        played += 1;
    }
    return state;
};


describe("The AI only ever proposes legal moves", function () {
    it("opens in the centre on an empty board", function () {
        const move = Ai.choose_placement(Chaos.new_game(), "medium", Rng.seeded(1));
        assert.deepEqual(move, [7, 7]);
    });

    it("never returns an occupied or off-board cell on busy boards", function () {
        Ai.difficulties.forEach(function (difficulty) {
            TRIALS.forEach(function (trial) {
                const state = random_position(8 + trial, Rng.seeded(trial * 13 + 1));
                if (!Chaos.is_over(state)) {
                    const move = Ai.choose_placement(
                        state,
                        difficulty,
                        Rng.seeded(trial + 100)
                    );
                    assert.equal(Chaos.is_free(state, move[0], move[1]), true);
                }
            });
        });
    });
});


describe("The AI plays the obvious tactics", function () {
    it("takes an immediate winning move", function () {
        // White has four in a row at (3,0..3); white to move should win at (3,4).
        const state = play_placements(Chaos.new_game(), [
            [0, 0], [3, 0], [0, 1], [3, 1], [0, 2], [3, 2], [0, 5], [3, 3], [0, 6]
        ]);
        assert.equal(Chaos.current_player(state), WHITE);
        const move = Ai.choose_placement(state, "hard", Rng.seeded(1));
        assert.equal(Chaos.would_win(state, WHITE, move[0], move[1]), true);
    });

    it("blocks the opponent's immediate win on hard", function () {
        // Black has an open four at (5,0..3); white must block.
        const state = play_placements(Chaos.new_game(), [
            [5, 0], [9, 9], [5, 1], [9, 10], [5, 2], [9, 11], [5, 3]
        ]);
        assert.equal(Chaos.current_player(state), WHITE);
        const move = Ai.choose_placement(state, "hard", Rng.seeded(1));
        assert.equal(Chaos.would_win(state, BLACK, move[0], move[1]), true);
    });
});


describe("Difficulty changes the AI's behaviour", function () {
    // A position with several reasonable replies, so easy's jitter can show.
    const tactical = function () {
        return play_placements(Chaos.new_game(), [[7, 7], [7, 8], [6, 7], [8, 8]]);
    };

    it("hard is stable on a fixed board, whatever the seed", function () {
        const board = tactical();
        const a = Ai.choose_placement(board, "hard", Rng.seeded(1));
        const b = Ai.choose_placement(board, "hard", Rng.seeded(999));
        assert.deepEqual(a, b);
    });

    it("easy shows controlled variety across seeds", function () {
        const board = tactical();
        const moves = [1, 2, 3, 4, 5, 6].map(function (seed) {
            return Ai.choose_placement(board, "easy", Rng.seeded(seed)).join(",");
        });
        assert.ok(new Set(moves).size > 1, "easy never varied");
    });
});


describe("A full AI-vs-AI game stays legal to the end", function () {
    it("keeps every move legal and the board well-formed", function () {
        const rng = Rng.seeded(2024);
        let state = Chaos.new_game();
        let plies = 0;
        while (!Chaos.is_over(state) && plies < 400) {
            const move = Ai.choose_placement(state, "medium", rng);
            assert.equal(Chaos.is_free(state, move[0], move[1]), true);
            state = ok(Chaos.place(move[0], move[1]), state, rng);
            invariants.assert_valid_board(Chaos.board(state));
            if (!Chaos.is_over(state)) {
                const skill = Ai.choose_skill(state, "medium", rng);
                const action = (
                    skill === null
                    ? Chaos.end_turn()
                    : skill
                );
                const result = Chaos.apply(action, state, rng);
                state = (
                    result.ok
                    ? result.state
                    : ok(Chaos.end_turn(), state, rng)
                );
                invariants.assert_valid_board(Chaos.board(state));
            }
            plies += 1;
        }
        const winner = Chaos.winner(state);
        assert.ok(winner === BLACK || winner === WHITE || plies >= 400);
    });
});
