// הכרעה מוקדמת של אלוף השבוע + "ויתור" של המוביל. לוגיקה טהורה, בלי Firebase.
// אותו קובץ בדיוק (העתק זהה) נמצא גם ב-whatsapp-claude-relay/src/clinch-core.js וב-wordell-notifier/scripts/clinch-core.mjs. לשנות בשלושתם יחד.
//
// המוביל במקרה הגרוע: מפסיד (מינוס 2) בכל מילה יומית שנשארה לו, ונכנס לכל בונוס פתוח שעוד לא שיחק ומפסיד בו (מינוס 5) —
// אלא אם ויתר עליהם במפורש (waiver). המתחרה במקרה הטוב: מנצח בניסיון 1 בכל מילה ובכל בונוס שנשארו לו (+ שולחן עגול אם עוד לפניו).
// הכרעה = אף מתחרה (וגם שחקן חדש לגמרי) לא עוקף את המוביל במקרה הגרוע שלו, לפי שוברי השוויון.
//
// standings[i]: { uid, name, points, wins, attemptCounts[0..6], windowsPlayed:Set<windowId>, bonusDaysPlayed:Set<bonusWindowId> }, ממוין מהראשון.
// ctx: { standings, weekStart, nowWindow, todayDay, daySeconds, rtBonus (0|5), penaltyFrom }

export const DAILY_PENALTY = 2;
export const BONUS_PENALTY = 5;

export function cmpStandings(a, b) {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    for (let n = 1; n <= 6; n++) if (b.attemptCounts[n] !== a.attemptCounts[n]) return b.attemptCounts[n] - a.attemptCounts[n];
    return a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0;
}

export const isBonusDayNum = (d) => d % 7 === 5 || d % 7 === 2; // שלישי ושבת (יום 0 בעידן = חמישי)

// ימי בונוס בשבוע שעוד לא הסתיימו (היום עצמו רק לפני 23:00)
export function bonusDaysLeft(ctx) {
    const out = [];
    for (let d = ctx.weekStart / 2; d < ctx.weekStart / 2 + 7; d++) {
        if (isBonusDayNum(d) && (d > ctx.todayDay || (d === ctx.todayDay && ctx.daySeconds < 23 * 3600))) out.push(d);
    }
    return out;
}

// waiver: { daily?: bool, bonus?: bool } של המוביל (או null)
export function evalClinch(ctx, waiver = null) {
    const { standings, weekStart, nowWindow, penaltyFrom } = ctx;
    const leader = standings[0];
    if (!leader || leader.points <= 0) return { ok: false, leader: null };
    const wv = waiver || {};
    const windowsLeft = weekStart + 14 - nowWindow;
    const bDays = bonusDaysLeft(ctx);

    const leaderPlayedNow = leader.windowsPlayed.has(nowWindow);
    let penaltyWindows = 0;
    for (let w = nowWindow + (leaderPlayedNow ? 1 : 0); w < weekStart + 14; w++) if (w >= penaltyFrom) penaltyWindows++;
    const bonusOpen = bDays.filter(d => !leader.bonusDaysPlayed.has(d)).length;

    const leaderWorst = {
        ...leader,
        points: leader.points - (wv.daily ? 0 : DAILY_PENALTY * penaltyWindows) - (wv.bonus ? 0 : BONUS_PENALTY * bonusOpen),
    };

    const bestOf = (c) => {
        const myWindowsLeft = windowsLeft - (c.windowsPlayed.has(nowWindow) ? 1 : 0);
        const myBonusLeft = bDays.filter(d => !c.bonusDaysPlayed.has(d)).length;
        return {
            uid: c.uid, name: c.name, points: c.points + 6 * myWindowsLeft + 5 * myBonusLeft + (ctx.rtBonus || 0), wins: c.wins + myWindowsLeft,
            attemptCounts: c.attemptCounts.map((n, i) => (i === 1 ? n + myWindowsLeft : n)),
        };
    };
    // שחקן חדש לגמרי (uid ריק = מנצח בכל שוויון אחרון, הכי שמרני)
    const unseen = { uid: '', name: null, points: 0, wins: 0, attemptCounts: [0, 0, 0, 0, 0, 0, 0], windowsPlayed: new Set(), bonusDaysPlayed: new Set() };
    const chasers = [...standings.slice(1), unseen].map(bestOf);
    chasers.sort(cmpStandings);
    const blockers = chasers.filter(b => cmpStandings(b, leaderWorst) < 0).map(b => b.name);
    return {
        ok: blockers.length === 0, leader, leaderWorst: leaderWorst.points,
        penaltyWindows, bonusOpen, blockers,
        topChaser: { name: chasers[0].name, points: chasers[0].points }, // הרודף/ת החזק/ה ביותר (גם אם הוא "שחקן חדש": name=null)
    };
}

// אילו ויתורים (bonus / daily / both) מספיקים להכרעה כשבלעדיהם אין הכרעה. רק אפשרויות שיש מה לוותר עליו.
export function waiverOptions(ctx, existingWaiver = null) {
    const base = evalClinch(ctx, existingWaiver);
    if (!base.leader || base.ok) return { base, options: [] };
    const have = existingWaiver || {};
    const canB = base.bonusOpen > 0 && !have.bonus, canD = base.penaltyWindows > 0 && !have.daily;
    const options = [];
    if (canB && evalClinch(ctx, { ...have, bonus: true }).ok) options.push('bonus');
    if (canD && evalClinch(ctx, { ...have, daily: true }).ok) options.push('daily');
    if (canB && canD && evalClinch(ctx, { ...have, bonus: true, daily: true }).ok) options.push('both');
    return { base, options };
}
