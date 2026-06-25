/*jslint browser, long*/
import Chaos from "./ChaosGomoku.js";
import Ai from "./ai.js";
import Characters from "./characters.js";

const HUMAN = Chaos.player_one;
const AI = Chaos.player_two;
const SIZE = Chaos.board_size;
const AI_THINK = 950;       // pause before the AI starts its move (feels deliberate)
const AI_DELAY = 620;       // pause between the AI placing and using a skill

let state = Chaos.new_game();
let difficulty = "medium";
let mode = "ai";            // "ai" or "local"; whether the AI plays white
let armed_skill = null;     // id of a targeted skill awaiting a target click
let pending_cell = null;    // staged placement [row, col]; committed on Confirm
let pending_skill = null;   // staged skill {id, target}; committed on Confirm
let busy = false;           // true while the computer is taking its turn
let character_index = 0;        // Player One (black) character
let character_index_two = 1;    // Player Two (white) character, local mode only
let cells = [];             // 2D array of <td>, filled once the grid is built
let skill_buttons = {};     // skill id -> { badge, button }
let howto_opener = null;    // button to refocus when the help modal closes
let muted = false;          // UI-only sound toggle
let volume = 0.7;           // UI-only sound volume, 0..1
let audio_ctx = null;       // created lazily on the first user gesture
let preview_td = null;      // cell currently showing a ghost-stone preview
let relocating_cell = null; // dest cell hidden while a FINDERS glide is in air
let black_chips = {};       // skill id -> chip elements for the black panel
let white_chips = {};       // skill id -> chip elements for the white panel
let win_line_el = null;     // the gold line drawn through the winning five

const splash_screen = document.getElementById("splash-screen");
const begin_button = document.getElementById("begin-button");
const start_screen = document.getElementById("start-screen");
const game_screen = document.getElementById("game-screen");
const board_el = document.getElementById("board");
const board_grid_el = document.getElementById("board-grid");
const status_el = document.getElementById("status");
const message_el = document.getElementById("message");
const skill_list = document.getElementById("skill-list");
const end_turn_button = document.getElementById("end-turn");
const new_game_button = document.getElementById("new-game");
const menu_button = document.getElementById("menu-button");
const difficulty_row = document.getElementById("difficulty-row");
const difficulty_buttons = [
    {button: document.getElementById("diff-easy"), level: "easy"},
    {button: document.getElementById("diff-medium"), level: "medium"},
    {button: document.getElementById("diff-hard"), level: "hard"}
];
const mode_ai_button = document.getElementById("mode-ai");
const mode_local_button = document.getElementById("mode-local");
const start_button = document.getElementById("start-button");
const char_prev_button = document.getElementById("char-prev");
const char_next_button = document.getElementById("char-next");
const char2_prev_button = document.getElementById("char2-prev");
const char2_next_button = document.getElementById("char2-next");
const p2_group = document.getElementById("p2-group");
const pick2_avatar = document.getElementById("pick2-avatar");
const pick2_name = document.getElementById("pick2-name");
const pick2_desc = document.getElementById("pick2-desc");
const over_modal = document.getElementById("over-modal");
const over_result = document.getElementById("over-result");
const over_new_button = document.getElementById("over-new");
const over_menu_button = document.getElementById("over-menu");
const howto_modal = document.getElementById("howto-modal");
const howto_open_button = document.getElementById("howto-open");
const howto_game_button = document.getElementById("howto-game");
const howto_close_button = document.getElementById("howto-close");
const player_avatar = document.getElementById("player-avatar");
const player_name = document.getElementById("player-name");
const player_desc = document.getElementById("player-desc");
const pick_avatar = document.getElementById("pick-avatar");
const pick_name = document.getElementById("pick-name");
const pick_desc = document.getElementById("pick-desc");
const foe_avatar = document.getElementById("foe-avatar");
const foe_name = document.getElementById("foe-name");
const foe_desc = document.getElementById("foe-desc");
const mute_buttons = [
    document.getElementById("mute-splash"),
    document.getElementById("mute-start"),
    document.getElementById("mute-game")
];
const volume_slider = document.getElementById("volume");
const skills_black_el = document.getElementById("skills-black");
const skills_white_el = document.getElementById("skills-white");

const indices = Array.from({length: SIZE}, function (ignore, index) {
    return index;
});

board_grid_el.style.setProperty("--n", String(SIZE));

const current_character = function () {
    return Characters.roster[character_index];
};

const current_character_two = function () {
    return Characters.roster[character_index_two];
};

const skill_by_id = function (id) {
    return Chaos.skills.find(function (skill) {
        return skill.id === id;
    });
};

// A short note on what a skill affects, for its tooltip.
const skill_scope = function (def) {
    if (def.targeted) {
        return "Targets one enemy stone.";
    }
    if (def.id === "spring") {
        return "Hits one to three random enemy stones.";
    }
    if (def.id === "zero") {
        return "Affects the opponent's next turn.";
    }
    return "Affects the whole board.";
};

// A live description of a skill's current availability, for its tooltip.
const skill_state_text = function (status, usable, placed, frozen) {
    if (status.spent) {
        return "State: used (once per game).";
    }
    if (!status.ready) {
        return "State: cooling down (" + status.cooldown + " turn).";
    }
    if (!placed) {
        return "State: place a stone first.";
    }
    if (frozen) {
        return "State: frozen this turn.";
    }
    if (usable) {
        return "State: ready.";
    }
    return "State: unavailable.";
};

const set_message = function (text) {
    message_el.textContent = text;
};

// ---- sound (presentation only; never touches game state) ----------------
// All effects are synthesised with the Web Audio API, so there are no audio
// files to ship. If the browser blocks or lacks audio, every call is a no-op
// and the game plays on in silence.

const ensure_audio = function () {
    if (audio_ctx === null && window.AudioContext !== undefined) {
        audio_ctx = new window.AudioContext();
    }
    return audio_ctx;
};

const tone = function (ctx, freq, start, length, shape, peak) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = ctx.currentTime + start;
    const level = Math.max(0.0001, peak * volume);
    osc.type = shape;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
};

// Like tone, but the pitch glides from one frequency to another — used for the
// rising "zip" as the gold winning line is drawn.
const glide = function (ctx, from, to, start, length, shape, peak) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = ctx.currentTime + start;
    const level = Math.max(0.0001, peak * volume);
    osc.type = shape;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + length);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
};

const play = function (name) {
    if (muted) {
        return;
    }
    const ctx = ensure_audio();
    if (ctx === null) {
        return;
    }
    if (ctx.state === "suspended") {
        ctx.resume();
    }
    if (name === "place") {
        tone(ctx, 196, 0, 0.12, "sine", 0.35);
        tone(ctx, 98, 0, 0.16, "triangle", 0.22);
        return;
    }
    if (name === "skill") {
        tone(ctx, 330, 0, 0.1, "square", 0.16);
        tone(ctx, 540, 0.08, 0.16, "square", 0.14);
        return;
    }
    if (name === "invalid") {
        tone(ctx, 120, 0, 0.18, "sawtooth", 0.2);
        return;
    }
    if (name === "win_line") {
        // a bright rising zip that tracks the gold line being drawn
        glide(ctx, 330, 990, 0, 0.36, "triangle", 0.2);
        tone(ctx, 1320, 0.32, 0.12, "sine", 0.12);
        return;
    }
    if (name === "victory") {
        // a warm ascending major fanfare (triangle + sine, no harsh squares)
        tone(ctx, 523, 0, 0.18, "triangle", 0.22);      // C5
        tone(ctx, 659, 0.16, 0.18, "triangle", 0.22);   // E5
        tone(ctx, 784, 0.32, 0.18, "triangle", 0.22);   // G5
        tone(ctx, 1047, 0.5, 0.5, "triangle", 0.26);    // C6, held
        tone(ctx, 1319, 0.5, 0.5, "sine", 0.14);        // E6 sparkle
        return;
    }
    tone(ctx, 440, 0, 0.05, "square", 0.12);
};

// Pick one sound for an action's events, in priority order.
const play_for_events = function (events) {
    const has = function (type) {
        return events.some(function (event) {
            return event.type === type;
        });
    };
    if (has("win")) {
        // The win line zip and victory fanfare are played by the win sequence
        // (handle_win / show_over), so nothing plays here on the winning move.
        return;
    }
    if (has("skill_used")) {
        play("skill");
        return;
    }
    if (has("place")) {
        play("place");
        return;
    }
    if (has("turn_ended")) {
        play("click");
    }
};

// Brief board animation for an event, removed after it finishes. Presentation
// only — it reads the events the module already returned, never game state.
const flash_board = function (name, ms) {
    board_el.classList.add(name);
    window.setTimeout(function () {
        board_el.classList.remove(name);
    }, ms);
};

// Whoever's turn it is may act when: a local human owns the side, or in AI mode
// it is the human (black) side, and the game is live and not mid-AI-move.
const human_to_act = function () {
    return (
        !Chaos.is_over(state)
        && !busy
        && (mode === "local" || Chaos.current_player(state) === HUMAN)
    );
};

// The side to move stages a placement by clicking a point; the ghost preview is
// shown while it is their turn and they are not currently picking a skill target.
const can_place_now = function () {
    return human_to_act() && armed_skill === null;
};

const other_side = function (side) {
    return (
        side === Chaos.player_one
        ? Chaos.player_two
        : Chaos.player_one
    );
};

const clear_preview = function () {
    if (preview_td !== null) {
        preview_td.classList.remove("preview");
        preview_td = null;
    }
};

const show_preview = function (td) {
    clear_preview();
    const occupied = (
        td.classList.contains("stone-black")
        || td.classList.contains("stone-white")
    );
    // The staged cell already shows the gold-ringed pending stone, so it does
    // not also get a ghost preview on top.
    const is_pending = (
        pending_cell !== null
        && cells[pending_cell[0]][pending_cell[1]] === td
    );
    if (can_place_now() && !occupied && !is_pending) {
        td.classList.add("preview");
        preview_td = td;
    }
};

const side_name = function (side) {
    if (mode === "local") {
        return (
            side === HUMAN
            ? current_character().name + " (Black)"
            : current_character_two().name + " (White)"
        );
    }
    return (
        side === HUMAN
        ? current_character().name
        : Characters.adversary.name
    );
};

const at_cell = function (cell, row, col) {
    return cell !== null && cell[0] === row && cell[1] === col;
};

const point_class = function (board, row, col, win_keys, arming) {
    const value = board[row][col];
    const parts = ["point"];
    if (value === HUMAN) {
        parts.push("stone-black");
    }
    if (value === AI) {
        parts.push("stone-white");
    }
    if (win_keys.includes(row * SIZE + col)) {
        parts.push("win");
    }
    const current = Chaos.current_player(state);
    if (value === Chaos.empty && at_cell(pending_cell, row, col)) {
        parts.push(
            current === Chaos.player_one
            ? "pending-black"
            : "pending-white"
        );
    }
    const is_enemy = value !== Chaos.empty && value !== current;
    if (arming && is_enemy) {
        parts.push("targetable");
    }
    if (pending_skill !== null && at_cell(pending_skill.target, row, col)) {
        parts.push("target-chosen");
    }
    return parts.join(" ");
};

const render_board = function () {
    const board = Chaos.board(state);
    const line = Chaos.win_line(state);
    const win_keys = (
        line === null
        ? []
        : line.map(function (cell) {
            return cell[0] * SIZE + cell[1];
        })
    );
    const arming = armed_skill !== null;
    cells.forEach(function (row_points, row) {
        row_points.forEach(function (button, col) {
            button.className = point_class(board, row, col, win_keys, arming);
        });
    });
    // Re-apply the transient hover preview that the class reset above cleared.
    if (preview_td !== null) {
        preview_td.classList.add("preview");
    }
    // Keep a relocating stone hidden across re-renders until its glide lands.
    if (relocating_cell !== null) {
        relocating_cell.classList.add("relocating");
    }
};

const skill_badge = function (status) {
    if (status.spent) {
        return "spent";
    }
    if (status.ready) {
        return "ready";
    }
    return "CD " + status.cooldown;
};

const render_skills = function () {
    const actor = Chaos.current_player(state);
    const can_act = human_to_act();
    const staged = pending_cell !== null;
    const frozen = Chaos.is_frozen(state, actor);
    skill_list.classList.toggle("phase-active", can_act && staged && !frozen);
    Chaos.skills.forEach(function (def) {
        const entry = skill_buttons[def.id];
        const status = Chaos.skill_status(state, actor, def.id);
        const available = Chaos.skill_usable(state, actor, def.id);
        const usable = (
            can_act
            && status.ready
            && available
            && staged
            && !frozen
        );
        const chosen = pending_skill !== null && pending_skill.id === def.id;
        entry.button.disabled = !usable;
        entry.button.classList.toggle(
            "armed",
            armed_skill === def.id || chosen
        );
        entry.badge.textContent = skill_badge(status);
        entry.state.textContent = skill_state_text(
            status,
            usable,
            staged,
            frozen
        );
    });
};

const render_status = function () {
    const winner = Chaos.winner(state);
    if (winner !== 0) {
        status_el.textContent = side_name(winner) + " wins! 🎉";
        return;
    }
    const actor = Chaos.current_player(state);
    if (mode === "ai" && actor === AI) {
        status_el.textContent = Characters.adversary.name + " is thinking…";
        return;
    }
    if (armed_skill !== null) {
        return;
    }
    status_el.textContent = side_name(actor) + (
        pending_cell === null
        ? " — click a point to place, then Confirm."
        : " — Confirm your move, or pick a skill."
    );
};

// UI-only art maps: the image that stands in for each character and skill. The
// game and character modules stay emoji-only; the web app supplies the artwork
// and falls back to the emoji when no image is mapped.
const CHARACTER_IMAGES = {
    "auditor-quill": "assets/char-auditor-quill.png",
    "lord-ember": "assets/char-lord-ember.png",
    "shroud": "assets/char-shroud.png",
    "sprocket": "assets/char-sprocket.png",
    "the-adversary": "assets/char-adversary.png",
    "vex-cinder": "assets/char-vex-cinder.png"
};

const SKILL_IMAGES = {
    corporate: "assets/skill-corporate.png",
    finders: "assets/skill-finders.png",
    flip: "assets/skill-flip.png",
    spring: "assets/skill-spring.png",
    yeet: "assets/skill-yeet.png",
    zero: "assets/skill-zero.png"
};

const set_art = function (el, src, fallback) {
    if (src === undefined) {
        el.style.backgroundImage = "none";
        el.textContent = fallback;
        return;
    }
    el.style.backgroundImage = "url(\"" + src + "\")";
    el.textContent = "";
};

const set_avatar = function (el, character) {
    set_art(el, CHARACTER_IMAGES[character.id], character.avatar);
};

const set_skill_art = function (el, def) {
    set_art(el, SKILL_IMAGES[def.id], def.icon);
};

const render_character = function () {
    const one = current_character();
    set_avatar(player_avatar, one);
    player_name.textContent = one.name;
    player_desc.textContent = one.description;
    set_avatar(pick_avatar, one);
    pick_name.textContent = one.name;
    pick_desc.textContent = one.description;
    const two = current_character_two();
    set_avatar(pick2_avatar, two);
    pick2_name.textContent = two.name;
    pick2_desc.textContent = two.description;
};

// The right panel shows the opponent: the AI in AI mode (with its difficulty),
// or the chosen Player Two character in local mode.
const render_opponent = function () {
    if (mode === "ai") {
        set_avatar(foe_avatar, Characters.adversary);
        foe_name.textContent = Characters.adversary.name;
        foe_desc.textContent = "AI opponent — difficulty: " + difficulty + ".";
        return;
    }
    const two = current_character_two();
    set_avatar(foe_avatar, two);
    foe_name.textContent = two.name;
    foe_desc.textContent = two.description;
};

const update_chip = function (entry, status) {
    entry.mark.textContent = (
        status.spent
        ? "✗"
        : (
            status.ready
            ? "✓"
            : String(status.cooldown)
        )
    );
    entry.chip.classList.toggle("chip-spent", status.spent);
    entry.chip.classList.toggle("chip-ready", status.ready && !status.spent);
    entry.chip.classList.toggle("chip-cd", !status.ready && !status.spent);
};

// Each player panel shows that side's own skill availability.
const render_player_skills = function () {
    Chaos.skills.forEach(function (def) {
        update_chip(
            black_chips[def.id],
            Chaos.skill_status(state, Chaos.player_one, def.id)
        );
        update_chip(
            white_chips[def.id],
            Chaos.skill_status(state, Chaos.player_two, def.id)
        );
    });
    // Frost overlay on a frozen side's skills (ABSOLUTE ZERO).
    skills_black_el.classList.toggle(
        "frozen",
        Chaos.is_frozen(state, Chaos.player_one)
    );
    skills_white_el.classList.toggle(
        "frozen",
        Chaos.is_frozen(state, Chaos.player_two)
    );
    skill_list.classList.toggle(
        "frozen",
        Chaos.is_frozen(state, Chaos.current_player(state))
        && !Chaos.is_over(state)
    );
};

// Name + colour of a side, for the game-over result line.
const winner_label = function (side) {
    const colour = (
        side === Chaos.player_one
        ? "Black"
        : "White"
    );
    const name = (
        side === Chaos.player_one
        ? current_character().name
        : (
            mode === "ai"
            ? Characters.adversary.name
            : current_character_two().name
        )
    );
    return name + " (" + colour + ")";
};

// Show the game-over modal. The result is read from the game module only; the
// UI never decides the winner. The module's no-draw rule means a draw cannot
// actually occur, but the draw line is handled defensively.
const show_over = function () {
    const winner = Chaos.winner(state);
    over_result.textContent = (
        winner === 0
        ? "Draw — the board filled with no five in a row."
        : winner_label(winner) + " wins — five in a row!"
    );
    over_modal.hidden = false;
    over_new_button.focus();
    if (winner !== 0) {
        play("victory");
    }
};

// Draw a gold line through the winning five (the line "grows" via a CSS
// width transition). Positions use the same per-cell fractions as the points.
const draw_win_line = function (line) {
    const span = SIZE - 1;
    const head = line[0];
    const tail = line[line.length - 1];
    const x1 = head[1] / span * 100;
    const y1 = head[0] / span * 100;
    const dx = tail[1] / span * 100 - x1;
    const dy = tail[0] / span * 100 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
    win_line_el.style.left = x1 + "%";
    win_line_el.style.top = y1 + "%";
    win_line_el.style.transform = "rotate(" + angle + "deg)";
    win_line_el.style.width = "0%";
    win_line_el.hidden = false;
    window.setTimeout(function () {
        win_line_el.style.width = length + "%";
    }, 40);
};

// On a win, draw the gold line through the five, then hold on it for a beat
// before the game-over modal. No board flash — the line is the whole animation.
const handle_win = function () {
    const line = Chaos.win_line(state);
    if (line !== null) {
        draw_win_line(line);
        play("win_line");
    }
    window.setTimeout(show_over, 2400);
};

// Brief board reactions to chaotic skills, plus the win sequence. Reads only the
// events the game module returned; it never decides outcomes.
const run_effects = function (events) {
    const has = function (type) {
        return events.some(function (event) {
            return event.type === type;
        });
    };
    if (has("clear_board") || has("auto_flip")) {
        flash_board("fx-flip", 850);
    } else if (has("swap_colors")) {
        flash_board("fx-swap", 700);
    } else if (has("remove")) {
        flash_board("fx-sweep", 520);
    }
    if (has("win")) {
        handle_win();
    }
};

// A short-lived stone clone, absolutely placed at an intersection, used to
// animate stones leaving the board. It removes itself after the flight.
const make_fly_stone = function (row, col, value) {
    const span = SIZE - 1;
    const node = document.createElement("div");
    node.className = "fly-stone " + (
        value === Chaos.player_one
        ? "fly-black"
        : "fly-white"
    );
    node.style.left = (col / span * 100) + "%";
    node.style.top = (row / span * 100) + "%";
    board_grid_el.append(node);
    return node;
};

const fly_to = function (node, dx, dy, scale) {
    window.setTimeout(function () {
        node.style.opacity = "0";
        node.style.transform = (
            "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy
            + "px)) scale(" + scale + ")"
        );
    }, 20);
    window.setTimeout(function () {
        node.remove();
    }, 760);
};

// The skill id behind a batch of events, or null for a plain placement.
const skill_in = function (events) {
    const used = events.find(function (event) {
        return event.type === "skill_used";
    });
    return (
        used === undefined
        ? null
        : used.id
    );
};

// FINDERS KEEPERS glides the stone from its old square to the new random one,
// hiding the freshly-rendered destination stone until the glide lands, so it
// reads as one piece moving rather than one vanishing and another appearing.
const glide_relocation = function (events, size) {
    const span = SIZE - 1;
    const src = events.find(function (event) {
        return event.type === "remove";
    });
    const dst = events.find(function (event) {
        return event.type === "place" && event.relocated === true;
    });
    if (src === undefined || dst === undefined) {
        return;
    }
    const target = cells[dst.row][dst.col];
    relocating_cell = target;
    target.classList.add("relocating");
    const node = make_fly_stone(src.row, src.col, src.side);
    const dx = (dst.col - src.col) / span * size;
    const dy = (dst.row - src.row) / span * size;
    window.setTimeout(function () {
        node.style.transform = (
            "translate(calc(-50% + " + dx + "px), calc(-50% + " + dy + "px))"
        );
    }, 20);
    window.setTimeout(function () {
        relocating_cell = null;
        target.classList.remove("relocating");
        node.remove();
    }, 660);
};

// Per-skill stone animations, driven only by the events and the pre-skill
// board, so they never affect play. YEET swells the struck stone in place;
// FINDERS glides it to its new home; SPRING flings the swept stones outward;
// TABLE FLIP slides every stone up and off the board.
const spawn_fly_effects = function (events, board_before) {
    const size = board_grid_el.getBoundingClientRect().width;
    const centre = (SIZE - 1) / 2;
    const id = skill_in(events);
    const flipped = events.some(function (event) {
        return event.type === "clear_board" || event.type === "auto_flip";
    });
    if (flipped) {
        board_before.forEach(function (cells_row, row) {
            cells_row.forEach(function (value, col) {
                if (value !== Chaos.empty) {
                    fly_to(
                        make_fly_stone(row, col, value),
                        (col - centre) * 3,
                        -size * 0.95,
                        0.7
                    );
                }
            });
        });
        return;
    }
    if (id === "finders") {
        glide_relocation(events, size);
        return;
    }
    events.forEach(function (event) {
        if (event.type !== "remove") {
            return;
        }
        const node = make_fly_stone(event.row, event.col, event.side);
        if (id === "yeet") {
            fly_to(node, 0, 0, 1.5);
            return;
        }
        const ox = event.col - centre;
        const oy = event.row - centre;
        const len = Math.sqrt(ox * ox + oy * oy) || 1;
        const dist = size * 0.72;
        fly_to(node, ox / len * dist, oy / len * dist, 0.4);
    });
};

const render_all = function () {
    render_board();
    render_skills();
    render_player_skills();
    render_status();
    board_el.classList.toggle(
        "turn-black",
        Chaos.current_player(state) === Chaos.player_one
    );
    board_el.classList.toggle(
        "turn-white",
        Chaos.current_player(state) === Chaos.player_two
    );
    if (!can_place_now()) {
        clear_preview();
    }
    end_turn_button.disabled = !(human_to_act() && pending_cell !== null);
};

const run_ai_turn = function () {
    const cell = Ai.choose_placement(state, difficulty);
    const placed = Chaos.apply(Chaos.place(cell[0], cell[1]), state);
    if (placed.ok) {
        state = placed.state;
        play_for_events(placed.events);
        run_effects(placed.events);
    }
    render_all();
    if (Chaos.is_over(state)) {
        busy = false;
        render_all();
        return;
    }
    const skill = Ai.choose_skill(state, difficulty);
    window.setTimeout(function () {
        const action = (
            skill === null
            ? Chaos.end_turn()
            : skill
        );
        const board_before = Chaos.board(state);
        const result = Chaos.apply(action, state);
        if (result.ok) {
            state = result.state;
            // The AI never presses Confirm, so its plain turn-end makes no
            // click; a skill it casts still plays its own sound.
            if (skill !== null) {
                play_for_events(result.events);
            }
        }
        busy = false;
        render_all();
        if (result.ok) {
            spawn_fly_effects(result.events, board_before);
            run_effects(result.events);
        }
    }, AI_DELAY);
};

const kick_ai = function () {
    if (
        mode !== "ai"
        || busy
        || Chaos.current_player(state) !== AI
        || Chaos.is_over(state)
    ) {
        return;
    }
    busy = true;
    render_all();
    window.setTimeout(run_ai_turn, AI_THINK);
};

const clear_pending = function () {
    pending_cell = null;
    pending_skill = null;
    armed_skill = null;
};

// Clicking a point stages a placement (or picks a target for an armed skill).
// Nothing is committed to the game module until Confirm.
const on_cell = function (row, col) {
    if (!human_to_act()) {
        return;
    }
    const board = Chaos.board(state);
    if (armed_skill !== null) {
        if (board[row][col] === other_side(Chaos.current_player(state))) {
            pending_skill = {id: armed_skill, target: [row, col]};
            armed_skill = null;
            set_message("");
            play("click");
        } else {
            set_message("Target must be an enemy stone.");
            play("invalid");
        }
        render_all();
        return;
    }
    if (Chaos.is_free(state, row, col)) {
        pending_cell = [row, col];
        set_message("");
        play("place");
        render_all();
        return;
    }
    play("invalid");
};

// Selecting a skill stages it (or arms target picking); it is applied on Confirm.
const on_skill = function (id) {
    if (!human_to_act()) {
        return;
    }
    if (pending_cell === null) {
        set_message("Place a stone first, then choose a skill.");
        play("invalid");
        return;
    }
    const def = skill_by_id(id);
    const chosen = pending_skill !== null && pending_skill.id === id;
    if (chosen || armed_skill === id) {
        pending_skill = null;
        armed_skill = null;
        set_message("");
        render_all();
        return;
    }
    play("click");
    pending_skill = null;
    if (def.targeted) {
        armed_skill = id;
        set_message("Pick an enemy stone for " + def.name + ".");
        render_all();
        return;
    }
    armed_skill = null;
    pending_skill = {id, target: null};
    render_all();
};

// Confirm commits the staged move to the game module: place, then the staged
// skill (or end the turn). The module decides every outcome.
const on_confirm = function () {
    if (busy || !human_to_act() || pending_cell === null) {
        return;
    }
    const cell = pending_cell;
    const skill = pending_skill;
    clear_pending();
    const placed = Chaos.apply(Chaos.place(cell[0], cell[1]), state);
    if (!placed.ok) {
        set_message(placed.error.message);
        play("invalid");
        render_all();
        return;
    }
    state = placed.state;
    play_for_events(placed.events);
    let effects = placed.events;
    const board_before = Chaos.board(state);
    if (!Chaos.is_over(state)) {
        const action = (
            skill === null
            ? Chaos.end_turn()
            : Chaos.use_skill(skill.id, skill.target)
        );
        const result = Chaos.apply(action, state);
        if (result.ok) {
            state = result.state;
            play_for_events(result.events);
            effects = effects.concat(result.events);
        }
    }
    set_message("");
    render_all();
    spawn_fly_effects(effects, board_before);
    run_effects(effects);
    kick_ai();
};

// Clear leftover presentation from a previous game so a fresh board starts
// clean (the win line, any in-flight stone clones, a pending relocation).
const reset_board_effects = function () {
    win_line_el.hidden = true;
    win_line_el.style.width = "0%";
    relocating_cell = null;
    board_grid_el.querySelectorAll(".fly-stone").forEach(function (node) {
        node.remove();
    });
};

const on_new_game = function () {
    play("click");
    over_modal.hidden = true;
    reset_board_effects();
    state = Chaos.new_game();
    clear_pending();
    busy = false;
    set_message("");
    render_all();
};

const on_mode_select = function (chosen) {
    play("click");
    mode = chosen;
    mode_ai_button.classList.toggle("selected", chosen === "ai");
    mode_local_button.classList.toggle("selected", chosen === "local");
    // Both sections always reserve their space (toggle visibility, not display)
    // so the menu box stays the same size and nothing jumps between modes.
    difficulty_row.classList.toggle("mode-off", chosen !== "ai");
    p2_group.classList.toggle("mode-off", chosen !== "local");
};

const on_difficulty_select = function (chosen) {
    play("click");
    difficulty = chosen;
    difficulty_buttons.forEach(function (entry) {
        const selected = entry.level === chosen;
        entry.button.classList.toggle("selected", selected);
        entry.button.setAttribute("aria-checked", String(selected));
    });
};

const on_start = function () {
    play("click");
    reset_board_effects();
    state = Chaos.new_game();
    clear_pending();
    busy = false;
    set_message("");
    render_opponent();
    render_all();
    start_screen.hidden = true;
    game_screen.hidden = false;
};

const on_menu = function () {
    play("click");
    over_modal.hidden = true;
    busy = false;
    clear_pending();
    game_screen.hidden = true;
    start_screen.hidden = false;
    mode_ai_button.focus();
};

const on_over_new = function () {
    on_new_game();
};

const on_over_menu = function () {
    on_menu();
};

const on_char_prev = function () {
    play("click");
    const count = Characters.roster.length;
    character_index = (character_index - 1 + count) % count;
    render_character();
};

const on_char_next = function () {
    play("click");
    character_index = (character_index + 1) % Characters.roster.length;
    render_character();
};

const on_char2_prev = function () {
    play("click");
    const count = Characters.roster.length;
    character_index_two = (character_index_two - 1 + count) % count;
    render_character();
};

const on_char2_next = function () {
    play("click");
    character_index_two = (character_index_two + 1) % Characters.roster.length;
    render_character();
};

const render_mute = function () {
    mute_buttons.forEach(function (button) {
        button.textContent = (
            muted
            ? "🔇 Muted"
            : "🔊 Sound"
        );
        button.setAttribute("aria-pressed", String(muted));
        button.setAttribute(
            "aria-label",
            (
                muted
                ? "Unmute sound"
                : "Mute sound"
            )
        );
    });
};

const on_mute = function () {
    muted = !muted;
    render_mute();
    play("click");
};

const open_howto = function (opener) {
    play("click");
    howto_opener = opener;
    howto_modal.hidden = false;
    howto_close_button.focus();
};

const on_howto_close = function () {
    play("click");
    howto_modal.hidden = true;
    if (howto_opener !== null) {
        howto_opener.focus();
    }
};

// Leave the title screen and reveal the mode-selection screen. UI flow only.
const dismiss_splash = function () {
    if (splash_screen.hidden) {
        return;
    }
    play("click");
    splash_screen.hidden = true;
    start_screen.hidden = false;
    mode_ai_button.focus();
};

const splash_target_is_audio = function (target) {
    return target !== null && target.closest(".splash-audio") !== null;
};

const on_splash_click = function (event) {
    if (!splash_target_is_audio(event.target)) {
        dismiss_splash();
    }
};

const arrow_delta = function (key) {
    if (key === "ArrowUp") {
        return [-1, 0];
    }
    if (key === "ArrowDown") {
        return [1, 0];
    }
    if (key === "ArrowLeft") {
        return [0, -1];
    }
    if (key === "ArrowRight") {
        return [0, 1];
    }
    return null;
};

// Arrow keys nudge the staged (not yet confirmed) stone to an adjacent empty
// intersection. Skipped while a skill card is focused (those arrows move skill
// focus) or while picking a skill target.
const move_pending_by_key = function (event) {
    const focused = document.activeElement;
    if (
        pending_cell === null
        || armed_skill !== null
        || !human_to_act()
        || (focused !== null && focused.closest("#skill-list") !== null)
    ) {
        return;
    }
    const delta = arrow_delta(event.key);
    if (delta === null) {
        return;
    }
    event.preventDefault();
    const row = pending_cell[0] + delta[0];
    const col = pending_cell[1] + delta[1];
    if (Chaos.is_free(state, row, col)) {
        pending_cell = [row, col];
        render_all();
        cells[row][col].focus();
    }
};

const on_key = function (event) {
    if (!splash_screen.hidden) {
        const on_audio = splash_target_is_audio(document.activeElement);
        if (event.key !== "Tab" && !on_audio) {
            dismiss_splash();
        }
        return;
    }
    if (event.key === "Escape" && !howto_modal.hidden) {
        on_howto_close();
        return;
    }
    if (event.key === "Escape" && !over_modal.hidden) {
        on_over_menu();
        return;
    }
    move_pending_by_key(event);
};

// One absolutely positioned button per playable intersection. Its --r/--c
// custom properties place it exactly on the (row, col) crossing via CSS; the
// game coordinates and board state are unchanged.
const make_point = function (row, col) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "point";
    button.style.setProperty("--r", String(row));
    button.style.setProperty("--c", String(col));
    button.setAttribute(
        "aria-label",
        "Place stone at row " + (row + 1) + " column " + (col + 1)
    );
    board_grid_el.append(button);
    button.onclick = function () {
        on_cell(row, col);
    };
    button.onpointerenter = function () {
        show_preview(button);
    };
    button.onpointerleave = clear_preview;
    button.onfocus = function () {
        show_preview(button);
    };
    button.onblur = clear_preview;
    return button;
};

const make_row = function (row) {
    return indices.map(function (col) {
        return make_point(row, col);
    });
};

// The skill buttons that the side to move can currently use, in order.
const focusable_skills = function () {
    return Chaos.skills.map(function (def) {
        return skill_buttons[def.id].button;
    }).filter(function (button) {
        return !button.disabled;
    });
};

// Roving arrow-key focus across the usable skill cards (disabled ones skipped).
const move_skill_focus = function (current, delta) {
    const list = focusable_skills();
    if (list.length === 0) {
        return;
    }
    const at = list.indexOf(current);
    const base = (
        at < 0
        ? 0
        : at
    );
    list[(base + delta + list.length) % list.length].focus();
};

const on_skill_key = function (event, button) {
    if (event.key === "ArrowRight") {
        event.preventDefault();
        move_skill_focus(button, 1);
        return;
    }
    if (event.key === "ArrowLeft") {
        event.preventDefault();
        move_skill_focus(button, -1);
    }
};

const make_tip_line = function (content) {
    const line = document.createElement("span");
    line.className = "tip-line";
    line.textContent = content;
    return line;
};

const make_skill_slot = function (def) {
    const slot = document.createElement("div");
    slot.className = "skill-slot";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "skill";
    button.setAttribute("aria-describedby", "tip-" + def.id);

    const icon = document.createElement("span");
    icon.className = "icon";
    set_skill_art(icon, def);

    const name = document.createElement("span");
    name.className = "label";
    name.textContent = def.name;

    const badge = document.createElement("span");
    badge.className = "badge";

    button.append(icon, name, badge);
    button.onclick = function () {
        on_skill(def.id);
        // Dismiss the popover after a selection so it stops covering the board;
        // it re-enables when the pointer next leaves and re-enters the card.
        slot.classList.add("tip-dismissed");
        slot.classList.remove("show-tip");
        button.blur();
    };
    button.onkeydown = function (event) {
        on_skill_key(event, button);
    };
    button.onfocus = function () {
        slot.classList.add("show-tip");
    };
    button.onblur = function () {
        slot.classList.remove("show-tip");
    };
    slot.onpointerleave = function () {
        slot.classList.remove("tip-dismissed");
    };

    const tip = document.createElement("div");
    tip.className = "tooltip";
    tip.id = "tip-" + def.id;
    tip.setAttribute("role", "tooltip");
    const tip_name = document.createElement("strong");
    tip_name.textContent = def.name;
    const tip_state = document.createElement("span");
    tip_state.className = "tip-state";
    tip.append(
        tip_name,
        make_tip_line(def.description),
        make_tip_line(skill_scope(def)),
        make_tip_line("Use after placing your stone."),
        make_tip_line(
            def.cooldown === "once"
            ? "Once per game."
            : "Cooldown: " + def.cooldown + " turns."
        ),
        tip_state
    );

    slot.append(button, tip);
    skill_list.append(slot);
    skill_buttons[def.id] = {badge, button, state: tip_state};
};

const make_skill_chips = function (container) {
    const map = {};
    Chaos.skills.forEach(function (def) {
        const chip = document.createElement("span");
        chip.className = "chip";
        chip.title = def.description;
        const icon = document.createElement("span");
        icon.className = "chip-icon";
        set_skill_art(icon, def);
        const name = document.createElement("span");
        name.className = "chip-name";
        name.textContent = def.name;
        const mark = document.createElement("span");
        mark.className = "chip-mark";
        chip.append(icon, name, mark);
        container.append(chip);
        map[def.id] = {chip, mark};
    });
    return map;
};

const on_volume = function () {
    volume = Number(volume_slider.value);
};

cells = indices.map(make_row);
black_chips = make_skill_chips(skills_black_el);
white_chips = make_skill_chips(skills_white_el);
Chaos.skills.forEach(make_skill_slot);

win_line_el = document.createElement("div");
win_line_el.className = "win-line";
win_line_el.hidden = true;
board_grid_el.append(win_line_el);

end_turn_button.onclick = on_confirm;
new_game_button.onclick = on_new_game;
menu_button.onclick = on_menu;
start_button.onclick = on_start;
howto_open_button.onclick = function () {
    open_howto(howto_open_button);
};
howto_game_button.onclick = function () {
    open_howto(howto_game_button);
};
howto_close_button.onclick = on_howto_close;
char_prev_button.onclick = on_char_prev;
char_next_button.onclick = on_char_next;
char2_prev_button.onclick = on_char2_prev;
char2_next_button.onclick = on_char2_next;
over_new_button.onclick = on_over_new;
over_menu_button.onclick = on_over_menu;
mode_ai_button.onclick = function () {
    on_mode_select("ai");
};
mode_local_button.onclick = function () {
    on_mode_select("local");
};
difficulty_buttons.forEach(function (entry) {
    entry.button.setAttribute("role", "radio");
    entry.button.setAttribute("aria-checked", String(entry.level === "medium"));
    entry.button.onclick = function () {
        on_difficulty_select(entry.level);
    };
});
mute_buttons.forEach(function (button) {
    button.onclick = on_mute;
});
volume_slider.oninput = on_volume;
splash_screen.onclick = on_splash_click;
begin_button.onclick = dismiss_splash;
document.addEventListener("keydown", on_key);

// Initial mode selection without a sound (no user gesture has happened yet, so
// the audio context is left uncreated until the first real click).
mode_ai_button.classList.add("selected");
difficulty_row.classList.remove("mode-off");
p2_group.classList.add("mode-off");
render_mute();
render_character();
render_opponent();
render_all();
begin_button.focus();
