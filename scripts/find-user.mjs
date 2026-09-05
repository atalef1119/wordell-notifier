// כלי אבחון חד-פעמי: מוצא משתמש לפי כינוי (nickname) ומדווח אם יש לו טוקן פוש רשום.
// הריפו ציבורי — לוגים של GitHub Actions run גלויים לכל אחד באינטרנט לצמיתות, גם בלי
// הרשאת גישה לריפו. לכן לעולם לא מדפיסים כאן מייל מלא, רק גרסה ממוסכת חלקית.
import { initAdmin } from './lib.mjs';
import { getAuth } from 'firebase-admin/auth';

function maskEmail(email) {
    const m = /^(.{2}).*(@.*)$/.exec(email);
    return m ? `${m[1]}***${m[2]}` : '***';
}

const { db } = initAdmin();
const nameQuery = (process.env.USER_QUERY || '').trim().toLowerCase();
if (!nameQuery) {
    console.log('missing USER_QUERY env var');
    process.exit(1);
}

const profilesSnap = await db.collection('profiles').get();
const matches = profilesSnap.docs.filter(d => (d.data().nickname || '').toLowerCase().includes(nameQuery));

if (!matches.length) {
    console.log(`no profile found matching "${nameQuery}"`);
    process.exit(0);
}

const tokensSnap = await db.collection('tokens').get();
const uidsWithToken = new Set(tokensSnap.docs.map(d => d.data().uid));

for (const doc of matches) {
    const uid = doc.id;
    const nickname = doc.data().nickname;
    let email = '(unknown)';
    try {
        const userRecord = await getAuth().getUser(uid);
        email = userRecord.email ? maskEmail(userRecord.email) : '(no email on account)';
    } catch (e) {
        email = `(error fetching auth user: ${e.message})`;
    }
    console.log(JSON.stringify({
        nickname,
        emailMasked: email,
        notificationsEnabled: uidsWithToken.has(uid),
    }));
}
