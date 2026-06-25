/*jslint long*/
/**
 * Character roster for Chaos Gomoku.
 *
 * Pure data plus a couple of pure helpers. Choosing a character only changes the
 * avatar and the displayed identity shown by the web app; it never changes the
 * board rules, skills, or balance, so the game module does not depend on it.
 *
 * @namespace Characters
 */
const Characters = {};

/**
 * A selectable identity.
 * @memberof Characters
 * @typedef {object} Character
 * @property {string} avatar  Emoji shown in the heads-up display.
 * @property {string} description  Short flavour text.
 * @property {string} id  Stable identifier.
 * @property {string} name  Display name.
 */

/**
 * The five selectable player characters. Names and descriptions are fictional.
 * @memberof Characters
 * @type {Array<Characters.Character>}
 */
Characters.roster = Object.freeze([
    Object.freeze({
        avatar: "🔥",
        description: "A grinning duelist who treats every match like a brawl.",
        id: "vex-cinder",
        name: "Vex Cinder"
    }),
    Object.freeze({
        avatar: "📐",
        description: "A calm strategist who files defeats in triplicate.",
        id: "auditor-quill",
        name: "Auditor Quill"
    }),
    Object.freeze({
        avatar: "🎭",
        description: "A masked infiltrator never quite where you expect.",
        id: "shroud",
        name: "Shroud"
    }),
    Object.freeze({
        avatar: "🔧",
        description: "A cheerful tinkerer who bolts chaos onto everything.",
        id: "sprocket",
        name: "Sprocket"
    }),
    Object.freeze({
        avatar: "👑",
        description: "A scarred warlord who plays for keeps and ceremony.",
        id: "lord-ember",
        name: "Lord Ember"
    })
]);

/**
 * The computer opponent's identity. Not part of the selectable roster.
 * @memberof Characters
 * @type {Characters.Character}
 */
Characters.adversary = Object.freeze({
    avatar: "🤖",
    description: "A gold-masked machine that wants very much for you to lose.",
    id: "the-adversary",
    name: "Professor Beep-Boop"
});

/**
 * The id of the default selected character (first in the roster).
 * @memberof Characters
 * @type {string}
 */
Characters.default_id = Characters.roster[0].id;

/**
 * Look up a player character by id.
 * @memberof Characters
 * @param {string} id  The character id to find.
 * @returns {(Characters.Character | undefined)} The character, or undefined.
 */
Characters.by_id = function (id) {
    return Characters.roster.find(function (character) {
        return character.id === id;
    });
};

/**
 * Return id if it names a real character, otherwise the default id.
 * @memberof Characters
 * @param {string} id  A possibly-invalid character id.
 * @returns {string} A guaranteed-valid character id.
 */
Characters.coerce_id = function (id) {
    return (
        Characters.by_id(id) === undefined
        ? Characters.default_id
        : id
    );
};

export default Object.freeze(Characters);
