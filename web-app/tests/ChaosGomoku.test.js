/*jslint long*/
import Chaos from "../ChaosGomoku.js";
import Rng from "../rng.js";
import assert from "assert";
import {describe, it} from "mocha";
import invariants from "./invariants.js";

const BLACK = Chaos.player_one;
const WHITE = Chaos.player_two;

// Apply an action and assert it was legal, returning the new state.
const ok = function (action, state, rng) {
    const result = Chaos.apply(action, state, rng);
    assert.ok(result.ok, "expected legal action: " + JSON.stringify(result.error));
    return result.state;
};

// Play a list of [row, col] placements, alternating sides, ending each turn
// (unless a placement already won). Used to build up test positions.
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

const count_of = function (state, side) {
    return Chaos.board(state).flat().filter(function (value) {
        return value === side;
    }).length;
};


describe("A new game", function () {
    it("has black to move, an empty board, and no winner", function () {
        const state = Chaos.new_game();
        assert.equal(Chaos.current_player(state), BLACK);
        assert.equal(Chaos.winner(state), 0);
        assert.equal(Chaos.is_over(state), false);
        assert.equal(count_of(state, BLACK), 0);
        assert.equal(count_of(state, WHITE), 0);
    });
});


describe("Placing a stone", function () {
    it("puts the mover's colour on the chosen cell", function () {
        const state = ok(Chaos.place(7, 7), Chaos.new_game());
        assert.equal(Chaos.board(state)[7][7], BLACK);
    });

    it("keeps the turn with the mover (skill or end-turn may follow)", function () {
        const state = ok(Chaos.place(7, 7), Chaos.new_game());
        assert.equal(Chaos.current_player(state), BLACK);
        assert.equal(Chaos.has_placed(state), true);
    });

    it("cannot be done on an occupied cell", function () {
        // Black plays (7,7), ends the turn; white may not reuse the cell.
        const black = ok(Chaos.place(7, 7), Chaos.new_game());
        const white_turn = ok(Chaos.end_turn(), black);
        const result = Chaos.apply(Chaos.place(7, 7), white_turn);
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "CELL_OCCUPIED");
    });

    it("cannot be done off the board", function () {
        const result = Chaos.apply(Chaos.place(15, 0), Chaos.new_game());
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "OUT_OF_BOUNDS");
    });

    it("cannot be done twice in one turn", function () {
        const state = ok(Chaos.place(7, 7), Chaos.new_game());
        const result = Chaos.apply(Chaos.place(8, 8), state);
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "ALREADY_PLACED");
    });
});


describe("Taking turns", function () {
    it("ending a turn passes play to the opponent", function () {
        const placed = ok(Chaos.place(7, 7), Chaos.new_game());
        const next = ok(Chaos.end_turn(), placed);
        assert.equal(Chaos.current_player(next), WHITE);
    });

    it("a turn cannot be ended before a stone is placed", function () {
        const result = Chaos.apply(Chaos.end_turn(), Chaos.new_game());
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "NOT_PLACED_YET");
    });
});


describe("Winning by five in a row", function () {
    it("five horizontally wins for the side that placed", function () {
        const state = play_placements(Chaos.new_game(), [
            [7, 3], [0, 0], [7, 4], [0, 1], [7, 5], [0, 2], [7, 6], [0, 3], [7, 7]
        ]);
        assert.equal(Chaos.winner(state), BLACK);
        assert.equal(Chaos.is_over(state), true);
        assert.equal(Chaos.win_line(state).length, 5);
    });

    it("five vertically wins", function () {
        const state = play_placements(Chaos.new_game(), [
            [3, 7], [0, 0], [4, 7], [0, 1], [5, 7], [0, 2], [6, 7], [0, 3], [7, 7]
        ]);
        assert.equal(Chaos.winner(state), BLACK);
    });

    it("five diagonally wins", function () {
        const state = play_placements(Chaos.new_game(), [
            [3, 3], [0, 0], [4, 4], [0, 1], [5, 5], [0, 2], [6, 6], [0, 3], [7, 7]
        ]);
        assert.equal(Chaos.winner(state), BLACK);
    });

    it("an overline of six also wins", function () {
        // Black fills a gap to make six at once (XX_XXX + middle), so no five
        // existed before the final placement.
        const state = play_placements(Chaos.new_game(), [
            [7, 2], [0, 0], [7, 3], [0, 2], [7, 7], [0, 4], [7, 6], [0, 6],
            [7, 5], [0, 8], [7, 4]
        ]);
        assert.equal(Chaos.winner(state), BLACK);
    });

    it("leaves the game in play when there is no five", function () {
        const state = play_placements(Chaos.new_game(), [[7, 7], [0, 0]]);
        assert.equal(Chaos.winner(state), 0);
        assert.equal(Chaos.is_over(state), false);
    });
});


// There is no draw outcome to assert: when a placement fills the board with no
// five, the engine system-flips (clears) and play continues, so a game only ever
// ends as a black or white win. That full-board auto-flip path is NOT unit-tested
// here on purpose — the state is immutable and opaque, so filling all 225 cells
// through the public API (legal play that never makes a five at any step) is
// impractical. It is covered indirectly by the AI-vs-AI smoke test in ai.test.js
// (every finished game is a win, never a draw) and by manual play-through in the
// browser.


// Reach a state where it is black's turn and black has just placed, so a skill
// is legal. White has a stone at (1, 1) to be targeted.
const black_ready_for_skill = function () {
    let state = Chaos.new_game();
    state = ok(Chaos.place(0, 0), state);   // black places
    state = ok(Chaos.end_turn(), state);    // white to move
    state = ok(Chaos.place(1, 1), state);   // white stone at (1, 1)
    state = ok(Chaos.end_turn(), state);    // black to move
    return ok(Chaos.place(5, 5), state);    // black places, may now skill
};


describe("Skill legality", function () {
    it("a skill cannot be used before a stone is placed", function () {
        const fresh = Chaos.new_game();
        const result = Chaos.apply(Chaos.use_skill("spring"), fresh);
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "NOT_PLACED_YET");
    });

    it("only one skill may be used per turn", function () {
        const state = black_ready_for_skill();
        const after = ok(Chaos.use_skill("yeet", [1, 1]), state);
        // YEET ends the turn, so it is now white's turn: a second YEET is illegal.
        const result = Chaos.apply(Chaos.use_skill("yeet", [0, 0]), after);
        assert.equal(result.ok, false);
    });

    it("a targeted skill rejects a non-enemy target", function () {
        const state = black_ready_for_skill();
        const result = Chaos.apply(Chaos.use_skill("yeet", [9, 9]), state);
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "TARGET_INVALID");
    });
});


describe("YEET METEOR", function () {
    it("removes the targeted enemy stone and ends the turn", function () {
        const state = black_ready_for_skill();
        const after = ok(Chaos.use_skill("yeet", [1, 1]), state);
        assert.equal(Chaos.board(after)[1][1], Chaos.empty);
        assert.equal(Chaos.current_player(after), WHITE);
    });
});


describe("FINDERS KEEPERS", function () {
    it("relocates the target, keeping the enemy stone count", function () {
        const state = black_ready_for_skill();
        const before = count_of(state, WHITE);
        const after = ok(Chaos.use_skill("finders", [1, 1]), state, Rng.seeded(7));
        assert.equal(Chaos.board(after)[1][1], Chaos.empty);
        assert.equal(count_of(after, WHITE), before);
    });
});


describe("SPRING CLEANING", function () {
    it("removes between one and three enemy stones", function () {
        // Give white three stones, then let black SPRING.
        let state = Chaos.new_game();
        state = play_placements(state, [
            [0, 0], [3, 3], [0, 1], [3, 4], [0, 2], [3, 5]
        ]);
        // Now black to move with white stones at (3,3),(3,4),(3,5).
        state = ok(Chaos.place(8, 8), state);
        const before = count_of(state, WHITE);
        const after = ok(Chaos.use_skill("spring"), state, Rng.seeded(3));
        const removed = before - count_of(after, WHITE);
        assert.ok(removed >= 1 && removed <= 3, "removed " + removed);
    });

    it("cannot be used when the enemy has no stones", function () {
        // Black places the opening stone; white has nothing to sweep.
        const state = ok(Chaos.place(7, 7), Chaos.new_game());
        assert.equal(Chaos.skill_usable(state, BLACK, "spring"), false);
        const result = Chaos.apply(Chaos.use_skill("spring"), state);
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "SKILL_UNAVAILABLE");
    });
});


describe("ABSOLUTE ZERO", function () {
    it("freezes the opponent's skills on their next turn", function () {
        const state = black_ready_for_skill();
        const after = ok(Chaos.use_skill("zero"), state);
        assert.equal(Chaos.is_frozen(after, WHITE), true);
        // White places, then a skill is refused because they are frozen.
        const placed = ok(Chaos.place(9, 9), after);
        const result = Chaos.apply(Chaos.use_skill("spring"), placed);
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "SKILL_FROZEN");
    });
});


describe("CORPORATE RESTRUCTURING", function () {
    it("swaps every stone's colour", function () {
        const state = black_ready_for_skill();
        const before_black = count_of(state, BLACK);
        const before_white = count_of(state, WHITE);
        const after = ok(Chaos.use_skill("corporate"), state);
        assert.equal(count_of(after, BLACK), before_white);
        assert.equal(count_of(after, WHITE), before_black);
    });
});


describe("TABLE FLIP", function () {
    it("clears the whole board", function () {
        const state = black_ready_for_skill();
        const after = ok(Chaos.use_skill("flip"), state);
        assert.equal(count_of(after, BLACK), 0);
        assert.equal(count_of(after, WHITE), 0);
    });
});


describe("Validating an action never changes the state", function () {
    it("rejects a second placement in the same turn", function () {
        const placed = ok(Chaos.place(7, 7), Chaos.new_game());
        const before = Chaos.to_string(placed);
        const result = Chaos.can_apply(Chaos.place(8, 8), placed);
        assert.equal(result.ok, false);
        assert.equal(result.error.code, "ALREADY_PLACED");
        assert.equal(Chaos.to_string(placed), before);
    });

    it("rejects placing on an occupied cell", function () {
        const next = ok(Chaos.end_turn(), ok(Chaos.place(7, 7), Chaos.new_game()));
        const result = Chaos.can_apply(Chaos.place(7, 7), next);
        assert.equal(result.error.code, "CELL_OCCUPIED");
    });

    it("rejects an out-of-bounds placement", function () {
        const result = Chaos.can_apply(Chaos.place(-1, 0), Chaos.new_game());
        assert.equal(result.error.code, "OUT_OF_BOUNDS");
    });

    it("rejects a targeted skill with no target", function () {
        const result = Chaos.can_apply(
            Chaos.use_skill("yeet"),
            black_ready_for_skill()
        );
        assert.equal(result.error.code, "TARGET_REQUIRED");
    });
});


describe("Each action reports what happened", function () {
    it("a placement emits a place event for the mover", function () {
        const result = Chaos.apply(Chaos.place(7, 7), Chaos.new_game());
        assert.ok(result.events.some(function (event) {
            return event.type === "place" && event.row === 7 && event.col === 7 && event.side === BLACK;
        }));
    });

    it("a winning placement emits a win event", function () {
        const setup = play_placements(Chaos.new_game(), [
            [7, 3], [0, 0], [7, 4], [0, 1], [7, 5], [0, 2], [7, 6], [0, 3]
        ]);
        const result = Chaos.apply(Chaos.place(7, 7), setup);
        assert.ok(result.events.some(function (event) {
            return event.type === "win" && event.side === BLACK;
        }));
    });

    it("a skill emits skill_used and then ends the turn", function () {
        const result = Chaos.apply(
            Chaos.use_skill("yeet", [1, 1]),
            black_ready_for_skill()
        );
        assert.ok(result.events.some(function (event) {
            return event.type === "skill_used" && event.id === "yeet";
        }));
        assert.ok(result.events.some(function (event) {
            return event.type === "turn_ended";
        }));
    });

    it("YEET emits a remove event at the target cell", function () {
        const result = Chaos.apply(
            Chaos.use_skill("yeet", [1, 1]),
            black_ready_for_skill()
        );
        assert.ok(result.events.some(function (event) {
            return event.type === "remove" && event.row === 1 && event.col === 1;
        }));
    });
});


describe("Random skills are reproducible from a seed", function () {
    // Black has placed and the enemy owns several stones for SPRING to sample.
    const many_enemies = function () {
        const state = play_placements(Chaos.new_game(), [
            [0, 0], [3, 3], [0, 1], [3, 4], [0, 2], [3, 5], [0, 6], [3, 6]
        ]);
        return ok(Chaos.place(8, 8), state);
    };

    it("SPRING sweeps the same stones for the same seed", function () {
        const a = ok(Chaos.use_skill("spring"), many_enemies(), Rng.seeded(42));
        const b = ok(Chaos.use_skill("spring"), many_enemies(), Rng.seeded(42));
        assert.equal(Chaos.to_string(a), Chaos.to_string(b));
    });

    it("FINDERS relocates to the same cell for the same seed", function () {
        const a = ok(Chaos.use_skill("finders", [1, 1]), black_ready_for_skill(), Rng.seeded(7));
        const b = ok(Chaos.use_skill("finders", [1, 1]), black_ready_for_skill(), Rng.seeded(7));
        assert.equal(Chaos.to_string(a), Chaos.to_string(b));
    });

    it("the seed genuinely drives FINDERS (some seeds differ)", function () {
        const boards = [1, 2, 3, 4].map(function (seed) {
            return Chaos.to_string(
                ok(Chaos.use_skill("finders", [1, 1]), black_ready_for_skill(), Rng.seeded(seed))
            );
        });
        assert.ok(new Set(boards).size > 1, "the seed had no effect");
    });
});


describe("Cooldowns and once-per-game skills", function () {
    it("a cooldown skill is not ready immediately after use", function () {
        const after = ok(Chaos.use_skill("yeet", [1, 1]), black_ready_for_skill());
        const status = Chaos.skill_status(after, BLACK, "yeet");
        assert.equal(status.ready, false);
        assert.equal(status.spent, false);
        assert.ok(status.cooldown > 0);
    });

    it("a once-per-game skill stays spent after use", function () {
        const after = ok(Chaos.use_skill("flip"), black_ready_for_skill());
        const status = Chaos.skill_status(after, BLACK, "flip");
        assert.equal(status.spent, true);
        assert.equal(status.ready, false);
        assert.equal(status.once, true);
    });

    it("a cooldown ticks down on the user's next turn", function () {
        const after = ok(Chaos.use_skill("yeet", [1, 1]), black_ready_for_skill());
        const before = Chaos.skill_status(after, BLACK, "yeet").cooldown;
        // White takes a quiet turn, handing play back to black, whose begin-turn
        // ticks the cooldown.
        const back = ok(Chaos.end_turn(), ok(Chaos.place(0, 5), after));
        const now = Chaos.skill_status(back, BLACK, "yeet").cooldown;
        assert.ok(now < before);
    });
});


describe("The board stays a well-formed grid", function () {
    it("after a colour-swapping skill", function () {
        const after = ok(Chaos.use_skill("corporate"), black_ready_for_skill());
        invariants.assert_valid_board(Chaos.board(after));
    });

    it("after clearing the board", function () {
        const after = ok(Chaos.use_skill("flip"), black_ready_for_skill());
        invariants.assert_valid_board(Chaos.board(after));
        assert.equal(invariants.count_side(Chaos.board(after), BLACK), 0);
    });
});


describe("Purity", function () {
    it("apply never mutates the state it is given", function () {
        const state = Chaos.new_game();
        const snapshot = Chaos.to_string(state);
        Chaos.apply(Chaos.place(7, 7), state);
        assert.equal(Chaos.to_string(state), snapshot);
    });
});
