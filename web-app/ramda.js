/*jslint long*/
/**
 * Ramda integration wrapper, so Ramda imports the same way on server and
 * browser. Named imports (not a namespace import) are used so the file passes
 * JSLint; the small set re-exported here is everything the game module uses.
 */
import {
    assoc,
    assocPath,
    map,
    range,
    repeat,
    times,
    xprod
} from "../node_modules/ramda/es/index.js";

export default Object.freeze({
    assoc,
    assocPath,
    map,
    range,
    repeat,
    times,
    xprod
});
