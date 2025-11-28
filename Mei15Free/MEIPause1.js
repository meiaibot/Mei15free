//MEIPause1.js:

const fs = require('fs');
const path = require('path');

function getPauseData(file) {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function savePauseData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function setGlobalPause(file, value) {
    const data = getPauseData(file);
    data.global = value;
    savePauseData(file, data);
    return value;
}

function pauseUser(file, phone) {
    const data = getPauseData(file);
    if (!data.paused.includes(phone)) {
        data.paused.push(phone);
        savePauseData(file, data);
        return true;
    }
    return false;
}

function unpauseUser(file, phone) {
    const data = getPauseData(file);
    const idx = data.paused.indexOf(phone);
    if (idx !== -1) {
        data.paused.splice(idx, 1);
        savePauseData(file, data);
        return true;
    }
    return false;
}

function isUserPaused(file, phone) {
    const data = getPauseData(file);
    return !!(data.global || data.paused.includes(phone));
}

module.exports = {
    getPauseData,
    savePauseData,
    setGlobalPause,
    pauseUser,
    unpauseUser,
    isUserPaused
};
