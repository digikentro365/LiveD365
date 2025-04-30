// utils/jdCache.js
const crypto = require('crypto');
const NodeCache = require('node-cache');

const jdCache = new NodeCache({ stdTTL: 3600 }); // Cache for 1 hour

function hashJD(text) {
    return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}

async function getCachedJDInfo(jobDescription, extractJDInfoFn) {
    const hash = hashJD(jobDescription);

    const cached = jdCache.get(hash);
    if (cached) return cached;

    const extracted = await extractJDInfoFn(jobDescription);
    if (extracted) jdCache.set(hash, extracted);
    return extracted;
}

module.exports = { getCachedJDInfo };
