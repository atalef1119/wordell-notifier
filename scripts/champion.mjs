// הכרעה מוקדמת של אלוף השבוע — אותו אלגוריתם כמו findClinchedChampion ב-public/app.js (ריפו נפרד) וכמו clinchStatus ב-whatsapp-claude-relay.
// המוביל מפסיד (מינוס 2) בכל סבב שנשאר לו, וכל מתחרה (וגם שחקן חדש) מנצח בניסיון 1 בכל סבב ובכל בונוס שנשארו לו.
// אם אף אחד לא יכול להדביק — האלוף הוכרע כבר עכשיו.
import { compareStandings, addRoundTablePoints, rtGameStillAhead } from './lib.mjs';

const DAILY_LOSS_PENALTY_FROM_WINDOW = 41446;
const isBonusDay = (d) => { const wd = ((d % 7) - 3 + 7) % 7; return wd === 2 || wd === 6; }; // שלישי ושבת

export async function currentWeekDetail(db, weekStart) {
    const byUser = {};
    const ensure = (s) => byUser[s.uid] ||= {
        uid: s.uid, name: s.username, points: 0, wins: 0, attemptCounts: [0, 0, 0, 0, 0, 0, 0],
        windowsPlayed: new Set(), bonusDaysPlayed: new Set(), lastTs: 0,
    };
    const touch = (u, s) => { const ts = s.timestamp ? s.timestamp.seconds : 0; if (ts >= u.lastTs) { u.lastTs = ts; u.name = s.username; } };
    const snap = await db.collection('scores').where('windowId', '>=', weekStart).where('windowId', '<', weekStart + 14).get();
    snap.docs.forEach(d => {
        const s = d.data(); const u = ensure(s); touch(u, s); u.windowsPlayed.add(s.windowId);
        if (s.status !== 'WON') { if (s.windowId >= DAILY_LOSS_PENALTY_FROM_WINDOW) u.points -= 2; return; }
        u.wins++; u.attemptCounts[s.attempts]++; u.points += Math.max(0, 7 - s.attempts);
    });
    const bsnap = await db.collection('bonusScores').where('bonusWindowId', '>=', weekStart / 2).where('bonusWindowId', '<', weekStart / 2 + 7).get();
    bsnap.docs.forEach(d => { const s = d.data(); const u = ensure(s); touch(u, s); u.points += s.points; u.bonusDaysPlayed.add(s.bonusWindowId); });
    await addRoundTablePoints(db, weekStart, weekStart + 14, (g, a) => { ensure({ uid: a.uid, username: a.username }).points += a.points; });
    return Object.values(byUser).sort(compareStandings);
}

export function clinchStatus(detail, weekStart, nowWindow, todayDay, daySeconds) {
    const leader = detail[0];
    if (!leader || leader.points <= 0) return { decided: false };
    const windowsLeft = weekStart + 14 - nowWindow;
    const bonusDaysLeft = [];
    for (let d = weekStart / 2; d < weekStart / 2 + 7; d++) {
        if (isBonusDay(d) && (d > todayDay || (d === todayDay && daySeconds < 23 * 3600))) bonusDaysLeft.push(d);
    }
    const leaderPlayed = leader.windowsPlayed.has(nowWindow);
    let penalties = 0;
    for (let w = nowWindow + (leaderPlayed ? 1 : 0); w < weekStart + 14; w++) if (w >= DAILY_LOSS_PENALTY_FROM_WINDOW) penalties++;
    const leaderWorst = { ...leader, points: leader.points - 2 * penalties };
    const rtBonus = rtGameStillAhead(weekStart, todayDay, daySeconds) ? 5 : 0; // השולחן העגול של השבוע עוד לפנינו
    const canOvertake = (c) => {
        const myWindowsLeft = windowsLeft - (c.windowsPlayed.has(nowWindow) ? 1 : 0);
        const myBonusLeft = bonusDaysLeft.filter(d => !c.bonusDaysPlayed.has(d)).length;
        const best = {
            uid: c.uid, points: c.points + 6 * myWindowsLeft + 5 * myBonusLeft + rtBonus, wins: c.wins + myWindowsLeft,
            attemptCounts: c.attemptCounts.map((n, i) => (i === 1 ? n + myWindowsLeft : n)),
        };
        return compareStandings(best, leaderWorst) < 0;
    };
    const unseen = { uid: '', points: 0, wins: 0, attemptCounts: [0, 0, 0, 0, 0, 0, 0], windowsPlayed: new Set(), bonusDaysPlayed: new Set() };
    const decided = !canOvertake(unseen) && !detail.slice(1).some(canOvertake);
    return { decided, champion: leader };
}
