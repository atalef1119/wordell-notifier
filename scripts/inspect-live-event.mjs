// כלי אבחון חד-פעמי: מדפיס את מצב קולקציית liveEvent (או liveEventTest) בפועל
import { initAdmin } from './lib.mjs';

const { db } = initAdmin();
const collectionName = process.env.EVENT_COLLECTION || 'liveEvent';
const snap = await db.collection(collectionName).get();
console.log(`${snap.docs.length} participants in ${collectionName}:`);
snap.docs.forEach(d => {
    const data = d.data();
    console.log(JSON.stringify({
        uidPrefix: d.id.slice(0, 6) + '...',
        username: data.username,
        status: data.status,
        currentAttempt: data.currentAttempt,
        attemptRows: (data.attemptColors || []).length,
        finishedAt: data.finishedAt ? data.finishedAt.toDate().toISOString() : null,
        joinedAt: data.joinedAt ? data.joinedAt.toDate().toISOString() : null,
    }));
});
