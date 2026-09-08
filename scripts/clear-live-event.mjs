// מנקה חד-פעמית את קולקציית liveEvent (הקולקציה האמיתית, לא liveEventTest) — מוחק
// משתתפים "רפאים" מהאירוע הקודם לפני שמתחילים אירוע חי חדש
import { initAdmin } from './lib.mjs';

const { db } = initAdmin();
const snap = await db.collection('liveEvent').get();
console.log(`deleting ${snap.docs.length} docs from liveEvent`);
await Promise.all(snap.docs.map(d => d.ref.delete()));
console.log('done');
