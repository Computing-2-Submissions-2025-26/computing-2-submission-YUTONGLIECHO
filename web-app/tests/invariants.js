/*jslint long*/
import Chaos from "../ChaosGomoku.js";

// Board invariants for Chaos Gomoku. Skills add, remove, and recolour stones,
// so the token-count balance of plain gomoku does NOT hold here; this helper
// only asserts what is genuinely always true — a well-formed grid of legal
// cells — mirroring the spirit of a "throw if invalid" board check.

const N = Chaos.board_size;
const TOKENS = [Chaos.empty, Chaos.player_one, Chaos.player_two];

// Throw unless board is an N-by-N grid containing only legal tokens.
const assert_valid_board = function (board) {
    if (!Array.isArray(board) || board.length !== N) {
        throw new Error("board is not an array of length " + N);
    }
    board.forEach(function (row, r) {
        if (!Array.isArray(row) || row.length !== N) {
            throw new Error("row " + r + " is not an array of length " + N);
        }
        row.forEach(function (value, c) {
            if (!TOKENS.includes(value)) {
                throw new Error("illegal token at " + r + ", " + c);
            }
        });
    });
};

// Count the stones of one side on a board grid.
const count_side = function (board, side) {
    return board.flat().filter(function (value) {
        return value === side;
    }).length;
};

export default Object.freeze({assert_valid_board, count_side});
