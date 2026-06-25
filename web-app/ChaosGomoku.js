import R from "./ramda.js";
import Rng from "./rng.js";

/**
 * Chaos Gomoku: five-in-a-row on a 15x15 board, with chaotic special skills.
 *
 * This module is the authoritative, render-agnostic game engine. Game state
 * is a plain, immutable data object; every function that changes the game
 * returns a brand new state and never mutates its argument. The web app holds
 * the current state and talks to the game only through this API.
 *
 * The two players are {@link Chaos.player_one} (black, "X", moves first) and
 * {@link Chaos.player_two} (white, "O"). A turn is: place one stone, then
 * optionally use one ready skill, then the turn passes to the opponent.
 *
 * @namespace Chaos
 */
const Chaos = {};

const N = 15;
const WIN = 5;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

const default_rng = Rng.math();

/**
 * @memberof Chaos
 * @typedef {Array<Array<number>>} Board  N rows of N cells; 0 empty, 1 black,
 *  2 white. Indexed board[row][col].
 */

/**
 * @memberof Chaos
 * @typedef {object} State  The whole game as immutable data. Treat it as
 *  opaque: read it through the selectors and build new states only through
 *  {@link Chaos.apply}.
 */

/**
 * @memberof Chaos
 * @typedef {object} Skill
 * @property {(number|string)} cooldown  Turns between uses, or "once" per game.
 * @property {string} description  Short flavour text.
 * @property {string} icon  Emoji shown in the heads-up display.
 * @property {string} id  Stable identifier passed to {@link Chaos.use_skill}.
 * @property {string} name  Display name.
 * @property {boolean} targeted  Whether the skill needs an enemy-stone target.
 */

/** Number of rows and columns on the board. @memberof Chaos */
Chaos.board_size = N;
/** Stones in a row needed to win. @memberof Chaos */
Chaos.win_length = WIN;
/** The empty-cell value. @memberof Chaos */
Chaos.empty = EMPTY;
/** Player one (black, moves first). @memberof Chaos */
Chaos.player_one = BLACK;
/** Player two (white). @memberof Chaos */
Chaos.player_two = WHITE;

/**
 * The skill catalogue, in display order.
 * @memberof Chaos
 * @type {Array<Chaos.Skill>}
 */
const SKILLS = Object.freeze([
    Object.freeze({
        cooldown: 5,
        description: "Launch one enemy stone into low orbit.",
        icon: "☄️",
        id: "yeet",
        name: "YEET METEOR",
        targeted: true
    }),
    Object.freeze({
        cooldown: 4,
        description: "Relocate one enemy stone to a random square.",
        icon: "🧲",
        id: "finders",
        name: "FINDERS KEEPERS",
        targeted: true
    }),
    Object.freeze({
        cooldown: 7,
        description: "Sweep away one to three random enemy stones.",
        icon: "🧹",
        id: "spring",
        name: "SPRING CLEANING",
        targeted: false
    }),
    Object.freeze({
        cooldown: 5,
        description: "Freeze the enemy's skills next turn.",
        icon: "❄️",
        id: "zero",
        name: "ABSOLUTE ZERO",
        targeted: false
    }),
    Object.freeze({
        cooldown: "once",
        description: "Swap every stone's colour. Synergy!",
        icon: "🔄",
        id: "corporate",
        name: "CORPORATE RESTRUCTURING",
        targeted: false
    }),
    Object.freeze({
        cooldown: "once",
        description: "Clear the board through furniture violence.",
        icon: "🪑",
        id: "flip",
        name: "TABLE FLIP",
        targeted: false
    })
]);

/** The skill catalogue. @memberof Chaos @type {Array<Chaos.Skill>} */
Chaos.skills = SKILLS;

const skill_lookup = SKILLS.reduce(function (acc, def) {
    return R.assoc(def.id, def, acc);
}, {});

const skill_def = function (id) {
    return skill_lookup[id];
};

const DIRECTIONS = Object.freeze([[0, 1], [1, 0], [1, 1], [1, -1]]);

const all_coords = R.xprod(R.range(0, N), R.range(0, N));

const other = function (side) {
    return (
        side === BLACK
        ? WHITE
        : BLACK
    );
};

const make_board = function () {
    return R.times(function () {
        return R.repeat(EMPTY, N);
    }, N);
};

const in_bounds = function (row, col) {
    return row >= 0 && row < N && col >= 0 && col < N;
};

const set_cell = function (board, row, col, value) {
    return board.with(row, board[row].with(col, value));
};

const pieces_of = function (board, side) {
    return all_coords.filter(function ([row, col]) {
        return board[row][col] === side;
    });
};

const empty_cells = function (board) {
    return all_coords.filter(function ([row, col]) {
        return board[row][col] === EMPTY;
    });
};

const is_full = function (board) {
    return empty_cells(board).length === 0;
};

const walk = function (board, side, row, col, drow, dcol, acc) {
    if (!in_bounds(row, col) || board[row][col] !== side) {
        return acc;
    }
    return walk(
        board,
        side,
        row + drow,
        col + dcol,
        drow,
        dcol,
        acc.concat([[row, col]])
    );
};

/**
 * Find a run of five or more stones of `side` and return its first five cells.
 * An overline (six or more) also counts, matching the rules.
 * @memberof Chaos
 * @param {Chaos.Board} board  The board to scan.
 * @param {number} side  The side to test (1 or 2).
 * @returns {(Array<Array<number>>|null)} Five winning cells, or null.
 */
const find_five = function (board, side) {
    const runs = pieces_of(board, side).flatMap(function ([row, col]) {
        return DIRECTIONS.map(function ([drow, dcol]) {
            return walk(board, side, row, col, drow, dcol, []);
        });
    });
    const winning = runs.find(function (run) {
        return run.length >= WIN;
    });
    return (
        winning === undefined
        ? null
        : winning.slice(0, WIN)
    );
};

const tick_cooldowns = function (state, side) {
    const key = String(side);
    const decremented = R.map(function (turns) {
        return Math.max(0, turns - 1);
    }, state.cooldowns[key]);
    return R.assocPath(["cooldowns", key], decremented, state);
};

const set_cooldown = function (state, side, id) {
    const def = skill_def(id);
    const key = String(side);
    return (
        def.cooldown === "once"
        ? R.assocPath(["used_once", key, id], true, state)
        : R.assocPath(["cooldowns", key, id], def.cooldown, state)
    );
};

const mark_skill_used = function (state, side, id) {
    return set_cooldown(
        Object.assign({}, state, {used_skill_this_turn: true}),
        side,
        id
    );
};

const freeze_side = function (state, side) {
    return R.assocPath(["frozen", String(side)], true, state);
};

const skill_ready = function (state, side, id) {
    const def = skill_def(id);
    const key = String(side);
    return (
        def.cooldown === "once"
        ? state.used_once[key][id] !== true
        : (state.cooldowns[key][id] || 0) === 0
    );
};

const begin_turn = function (state, side, skip_tick) {
    const reset = Object.assign({}, state, {
        current: side,
        phase: (
            state.winner === 0
            ? "place"
            : "over"
        ),
        placed_this_turn: false,
        used_skill_this_turn: false
    });
    return (
        skip_tick
        ? reset
        : tick_cooldowns(reset, side)
    );
};

const finish_turn = function (state, side) {
    const unfrozen = R.assocPath(["frozen", String(side)], false, state);
    return (
        unfrozen.winner !== 0
        ? Object.assign({}, unfrozen, {phase: "over"})
        : begin_turn(unfrozen, other(side), false)
    );
};

// A skill may need a precondition beyond its cooldown: SPRING CLEANING needs
// at least one enemy stone to sweep. Other skills are usable whenever ready.
const skill_usable = function (state, side, id) {
    return (
        id !== "spring"
        || pieces_of(state.board, other(side)).length > 0
    );
};

const set_winner = function (state, side, line) {
    return Object.assign({}, state, {
        phase: "over",
        win_line: line,
        winner: side
    });
};

const clear_board = function (state) {
    return Object.assign({}, state, {
        board: make_board(),
        last_move: null,
        win_line: null
    });
};

const place_at = function (state, row, col, side) {
    return Object.assign({}, state, {
        board: set_cell(state.board, row, col, side),
        last_move: {col, row, side}
    });
};

const remove_at = function (state, row, col) {
    return Object.assign({}, state, {
        board: set_cell(state.board, row, col, EMPTY)
    });
};

const swap_colors = function (state) {
    const swapped = state.board.map(function (row) {
        return row.map(function (value) {
            return (
                value === BLACK
                ? WHITE
                : (
                    value === WHITE
                    ? BLACK
                    : EMPTY
                )
            );
        });
    });
    return Object.assign({}, state, {board: swapped});
};

const sample = function (list, count, rng) {
    const decorated = list.map(function (item) {
        return [rng.next(), item];
    });
    const sorted = decorated.slice().sort(function (left, right) {
        return left[0] - right[0];
    });
    return sorted.slice(0, count).map(function (pair) {
        return pair[1];
    });
};

const win_for_placement = function (state, side) {
    const line = find_five(state.board, side);
    return (
        line === null
        ? null
        : {line, side}
    );
};

const resolve_after_skill = function (state, user_side, skill_id) {
    const five_black = find_five(state.board, BLACK);
    const five_white = find_five(state.board, WHITE);
    if (
        skill_id === "corporate"
        && five_black !== null
        && five_white !== null
    ) {
        const winner = other(user_side);
        return {
            line: (
                winner === BLACK
                ? five_black
                : five_white
            ),
            side: winner
        };
    }
    if (five_black !== null && five_white !== null) {
        return {
            line: (
                user_side === BLACK
                ? five_black
                : five_white
            ),
            side: user_side
        };
    }
    if (five_black !== null) {
        return {line: five_black, side: BLACK};
    }
    if (five_white !== null) {
        return {line: five_white, side: WHITE};
    }
    return null;
};

const settle = function (state, side, skill_id) {
    const resolution = (
        skill_id === null
        ? win_for_placement(state, side)
        : resolve_after_skill(state, side, skill_id)
    );
    if (resolution !== null) {
        return {
            ended: true,
            events: [{
                line: resolution.line,
                side: resolution.side,
                type: "win"
            }],
            state: set_winner(state, resolution.side, resolution.line)
        };
    }
    if (is_full(state.board)) {
        return {
            ended: false,
            events: [{type: "auto_flip"}],
            state: clear_board(state)
        };
    }
    return {ended: false, events: [], state};
};

const fail = function (code, message) {
    return {error: {code, message}, ok: false};
};

const check_target = function (state, side, target) {
    if (!Array.isArray(target)) {
        return fail("TARGET_REQUIRED", "This skill needs an enemy target.");
    }
    const [row, col] = target;
    if (!in_bounds(row, col) || state.board[row][col] !== other(side)) {
        return fail("TARGET_INVALID", "Target must be an enemy stone.");
    }
    return {ok: true};
};

const can_apply = function (action, state) {
    if (state.winner !== 0) {
        return fail("GAME_OVER", "The game is already over.");
    }
    const side = state.current;
    if (action.type === "PLACE") {
        if (state.phase !== "place") {
            return fail("WRONG_PHASE", "Not in the placing phase.");
        }
        if (state.placed_this_turn) {
            return fail("ALREADY_PLACED", "You already placed this turn.");
        }
        if (!in_bounds(action.row, action.col)) {
            return fail("OUT_OF_BOUNDS", "That cell is off the board.");
        }
        if (state.board[action.row][action.col] !== EMPTY) {
            return fail("CELL_OCCUPIED", "That cell is occupied.");
        }
        return {ok: true};
    }
    if (action.type === "SKILL") {
        const def = skill_def(action.id);
        if (def === undefined) {
            return fail("SKILL_UNKNOWN", "Unknown skill: " + action.id);
        }
        if (state.frozen[String(side)]) {
            return fail("SKILL_FROZEN", "Your skills are frozen this turn.");
        }
        if (!state.placed_this_turn) {
            return fail("NOT_PLACED_YET", "Place a stone before a skill.");
        }
        if (state.used_skill_this_turn) {
            return fail("SKILL_USED", "Only one skill per turn.");
        }
        if (!skill_ready(state, side, action.id)) {
            return fail("SKILL_NOT_READY", "That skill is not ready.");
        }
        if (!skill_usable(state, side, action.id)) {
            return fail(
                "SKILL_UNAVAILABLE",
                "There are no enemy stones to sweep."
            );
        }
        if (def.targeted) {
            return check_target(state, side, action.target);
        }
        return {ok: true};
    }
    if (action.type === "END_TURN") {
        if (!state.placed_this_turn) {
            return fail("NOT_PLACED_YET", "Place a stone before ending.");
        }
        return {ok: true};
    }
    return fail("ACTION_UNKNOWN", "Unknown action: " + action.type);
};

const finalize_skill = function (state, side, id, events) {
    const used = mark_skill_used(state, side, id);
    const settled = settle(used, side, id);
    const base = events.concat(
        [{id, side, type: "skill_used"}],
        settled.events
    );
    if (settled.ended) {
        return {events: base, ok: true, state: settled.state};
    }
    return {
        events: base.concat([{side, type: "turn_ended"}]),
        ok: true,
        state: finish_turn(settled.state, side)
    };
};

const apply_yeet = function (state, action, side, foe) {
    const [row, col] = action.target;
    return finalize_skill(
        remove_at(state, row, col),
        side,
        "yeet",
        [{col, row, side: foe, type: "remove"}]
    );
};

const apply_finders = function (state, action, rng, side, foe) {
    const [row, col] = action.target;
    const removed = remove_at(state, row, col);
    const empties = empty_cells(removed.board);
    const dest = (
        empties.length === 0
        ? [row, col]
        : rng.pick(empties)
    );
    return finalize_skill(
        place_at(removed, dest[0], dest[1], foe),
        side,
        "finders",
        [
            {col, row, side: foe, type: "remove"},
            {
                col: dest[1],
                relocated: true,
                row: dest[0],
                side: foe,
                type: "place"
            }
        ]
    );
};

const apply_spring = function (state, rng, side, foe) {
    const enemies = pieces_of(state.board, foe);
    const count = Math.min(enemies.length, 1 + rng.int(3));
    const chosen = sample(enemies, count, rng);
    const cleared = chosen.reduce(function (acc, [row, col]) {
        return remove_at(acc, row, col);
    }, state);
    const events = chosen.map(function ([row, col]) {
        return {col, row, side: foe, type: "remove"};
    });
    return finalize_skill(cleared, side, "spring", events);
};

const apply_zero = function (state, side, foe) {
    return finalize_skill(
        freeze_side(state, foe),
        side,
        "zero",
        [{side: foe, type: "freeze"}]
    );
};

const apply_corporate = function (state, side) {
    return finalize_skill(
        swap_colors(state),
        side,
        "corporate",
        [{type: "swap_colors"}]
    );
};

const apply_flip = function (state, side) {
    return finalize_skill(
        clear_board(state),
        side,
        "flip",
        [{type: "clear_board"}]
    );
};

const apply_skill = function (state, action, rng, side, foe) {
    const id = action.id;
    if (id === "yeet") {
        return apply_yeet(state, action, side, foe);
    }
    if (id === "finders") {
        return apply_finders(state, action, rng, side, foe);
    }
    if (id === "spring") {
        return apply_spring(state, rng, side, foe);
    }
    if (id === "zero") {
        return apply_zero(state, side, foe);
    }
    if (id === "corporate") {
        return apply_corporate(state, side);
    }
    if (id === "flip") {
        return apply_flip(state, side);
    }
    return fail("SKILL_UNKNOWN", "Unknown skill: " + id);
};

/**
 * Validate and apply an action, returning a result. On success the result
 * holds a brand new {@link Chaos.State} and an ordered list of events the view
 * can use for feedback. On an illegal action it returns `{ ok: false, error }`
 * and the original state is untouched (it never mutates or throws).
 * @memberof Chaos
 * @param {object} action  An action from {@link Chaos.place},
 *  {@link Chaos.use_skill} or {@link Chaos.end_turn}.
 * @param {Chaos.State} state  The current game state.
 * @param {Rng.Source} [rng]  Random source for the random skills; defaults
 *  to Math.random.
 * @returns {object} `{ ok: true, state, events }` or `{ ok: false, error }`.
 */
const apply = function (action, state, rng) {
    const check = can_apply(action, state);
    if (!check.ok) {
        return check;
    }
    const source = (
        rng === undefined
        ? default_rng
        : rng
    );
    const side = state.current;
    const foe = other(side);
    if (action.type === "PLACE") {
        const placed = Object.assign(
            {},
            place_at(state, action.row, action.col, side),
            {placed_this_turn: true}
        );
        const settled = settle(placed, side, null);
        return {
            events: [
                {col: action.col, row: action.row, side, type: "place"}
            ].concat(settled.events),
            ok: true,
            state: settled.state
        };
    }
    if (action.type === "SKILL") {
        return apply_skill(state, action, source, side, foe);
    }
    return {
        events: [{side, type: "turn_ended"}],
        ok: true,
        state: finish_turn(state, side)
    };
};

/**
 * Create a fresh game: empty board, black to move, all skills ready.
 * @memberof Chaos
 * @returns {Chaos.State} A new game ready for the first turn.
 */
Chaos.new_game = function () {
    const base = {
        board: make_board(),
        cooldowns: {"1": {}, "2": {}},
        current: BLACK,
        frozen: {"1": false, "2": false},
        last_move: null,
        phase: "place",
        placed_this_turn: false,
        used_once: {"1": {}, "2": {}},
        used_skill_this_turn: false,
        win_line: null,
        winner: 0
    };
    return begin_turn(base, BLACK, true);
};

/**
 * Build a PLACE action: drop a stone at (row, col).
 * @memberof Chaos
 * @param {number} row  Row, 0 to 14.
 * @param {number} col  Column, 0 to 14.
 * @returns {object} A PLACE action.
 */
Chaos.place = function (row, col) {
    return {col, row, type: "PLACE"};
};

/**
 * Build a SKILL action.
 * @memberof Chaos
 * @param {string} id  A skill id from {@link Chaos.skills}.
 * @param {(Array<number>|null)} [target]  `[row, col]` for targeted skills.
 * @returns {object} A SKILL action.
 */
Chaos.use_skill = function (id, target) {
    return {
        id,
        target: target || null,
        type: "SKILL"
    };
};

/**
 * Build an END_TURN action: pass the turn to the opponent.
 * @memberof Chaos
 * @returns {object} An END_TURN action.
 */
Chaos.end_turn = function () {
    return {type: "END_TURN"};
};

Chaos.can_apply = can_apply;
Chaos.apply = apply;

/**
 * The board grid of the given state.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @returns {Chaos.Board} The board.
 */
Chaos.board = function (state) {
    return state.board;
};

/**
 * The side to move.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @returns {number} 1 (black) or 2 (white).
 */
Chaos.current_player = function (state) {
    return state.current;
};

/**
 * The winner, or 0 if the game is still in play.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @returns {number} 0, 1, or 2.
 */
Chaos.winner = function (state) {
    return state.winner;
};

/**
 * The winning five cells, or null.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @returns {(Array<Array<number>>|null)} The winning line, or null.
 */
Chaos.win_line = function (state) {
    return state.win_line;
};

/**
 * Whether the game has ended.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @returns {boolean} True if there is a winner.
 */
Chaos.is_over = function (state) {
    return state.winner !== 0;
};

/**
 * Whether (row, col) is an empty, in-bounds cell.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @param {number} row  Row index.
 * @param {number} col  Column index.
 * @returns {boolean} True if the cell is free.
 */
Chaos.is_free = function (state, row, col) {
    return in_bounds(row, col) && state.board[row][col] === EMPTY;
};

/**
 * Whether the side to move has already placed this turn.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @returns {boolean} True after a stone has been placed this turn.
 */
Chaos.has_placed = function (state) {
    return state.placed_this_turn;
};

/**
 * Whether a side's skills are frozen this turn.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @param {number} side  1 or 2.
 * @returns {boolean} True if frozen.
 */
Chaos.is_frozen = function (state, side) {
    return state.frozen[String(side)] === true;
};

/**
 * Whether a skill's non-cooldown precondition is met right now. SPRING CLEANING
 * needs at least one enemy stone on the board; every other skill is always
 * usable once ready. The view disables a ready-but-unusable skill, and
 * {@link Chaos.apply} enforces the same rule.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @param {number} side  1 or 2.
 * @param {string} id  A skill id.
 * @returns {boolean} True unless a precondition is unmet.
 */
Chaos.skill_usable = function (state, side, id) {
    return skill_usable(state, side, id);
};

/**
 * The current status of a skill for a side: readiness, cooldown, once-spent.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @param {number} side  1 or 2.
 * @param {string} id  A skill id.
 * @returns {object} `{ cooldown, once, ready, spent }`.
 */
Chaos.skill_status = function (state, side, id) {
    const def = skill_def(id);
    const key = String(side);
    return Object.freeze({
        cooldown: (
            def.cooldown === "once"
            ? 0
            : (state.cooldowns[key][id] || 0)
        ),
        once: def.cooldown === "once",
        ready: skill_ready(state, side, id),
        spent: def.cooldown === "once" && state.used_once[key][id] === true
    });
};

/**
 * Whether placing `side` at (row, col) would immediately make five. Useful for
 * highlighting and for the AI's tactics. Does not change the state.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @param {number} side  1 or 2.
 * @param {number} row  Row index.
 * @param {number} col  Column index.
 * @returns {boolean} True if that placement wins.
 */
Chaos.would_win = function (state, side, row, col) {
    if (!Chaos.is_free(state, row, col)) {
        return false;
    }
    return find_five(set_cell(state.board, row, col, side), side) !== null;
};

/**
 * Every empty cell, as [row, col] pairs.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @returns {Array<Array<number>>} The empty cells.
 */
Chaos.empty_cells = function (state) {
    return empty_cells(state.board);
};

/**
 * Every cell holding a stone of `side`, as [row, col] pairs.
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @param {number} side  1 or 2.
 * @returns {Array<Array<number>>} The stones of that side.
 */
Chaos.pieces_of = function (state, side) {
    return pieces_of(state.board, side);
};

/**
 * A text view of the board: rows of ".", "X", "O".
 * @memberof Chaos
 * @param {Chaos.State} state  A game state.
 * @returns {string} The board as text, one line per row.
 */
Chaos.to_string = function (state) {
    const symbols = [".", "X", "O"];
    return state.board.map(function (row) {
        return row.map(function (value) {
            return symbols[value];
        }).join(" ");
    }).join("\n");
};

export default Object.freeze(Chaos);
