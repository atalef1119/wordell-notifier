// מנקה חד-פעמית את קולקציית liveEventTest (מוחק את כל המסמכים) — כדי שכל סבב בדיקה
// חדש יתחיל נקי, בלי משתתפים "רפאים" מבדיקות קודמות שנשארים ברשימה
import { initAdmin } from './lib.mjs';

const { db } = initAdmin();
const snap = await db.collection('liveEventTest').get();
console.log(`deleting ${snap.docs.length} docs from liveEventTest`);
await Promise.all(snap.docs.map(d => d.ref.delete()));
console.log('done');
