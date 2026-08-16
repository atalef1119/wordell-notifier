// כלי אבחון: מי הפעיל התראות פוש (לא שולח כלום, רק קורא ומדפיס)
import { initAdmin } from './lib.mjs';

const { db } = initAdmin();

const [tokensSnap, profilesSnap] = await Promise.all([
    db.collection('tokens').get(),
    db.collection('profiles').get()
]);

const nicknameByUid = {};
profilesSnap.docs.forEach(d => { nicknameByUid[d.id] = d.data().nickname; });

const tokensByUid = {};
tokensSnap.docs.forEach(d => {
    const uid = d.data().uid;
    tokensByUid[uid] = (tokensByUid[uid] || 0) + 1;
});

const uids = Object.keys(tokensByUid);
console.log(`${tokensSnap.size} טוקנים רשומים, ${uids.length} משתמשים ייחודיים:`);
for (const uid of uids) {
    const name = nicknameByUid[uid] || `(אין כינוי שמור, uid: ${uid})`;
    const count = tokensByUid[uid];
    console.log(`- ${name} — ${count} מכשיר${count > 1 ? 'ים' : ''}`);
}
