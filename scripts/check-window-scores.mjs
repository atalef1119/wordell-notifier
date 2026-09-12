// כלי אבחון חד-פעמי: כמה תוצאות כבר נרשמו לחלון מילה נתון (כדי לדעת אם בטוח לשנות
// את בנק המילים בלי לשבור משחק שכבר באמצע)
import { initAdmin } from './lib.mjs';

const { db } = initAdmin();
const windowId = Number(process.env.WINDOW_ID);
if (!Number.isInteger(windowId)) {
    console.log('missing/invalid WINDOW_ID env var');
    process.exit(1);
}

const snap = await db.collection('scores').where('windowId', '==', windowId).get();
console.log(`scores already recorded for windowId ${windowId}: ${snap.size}`);
