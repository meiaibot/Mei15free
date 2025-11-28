// MEIBoss2.js

// === EXPORTED BOSS FUNCTION ===
function isBossMode(msg, BOSS_PHONE) {
    if (msg.from === BOSS_PHONE) {
        console.log("Boss detected... switching to Boss Mode!");
        return true;
    }
    return false;
}

module.exports = {
    isBossMode
};
