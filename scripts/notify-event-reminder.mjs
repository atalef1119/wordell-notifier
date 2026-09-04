// שולח פוש תזכורת חד-פעמית על אירוע "מרוץ חי" (04/09/2026 20:00) — מריצים ידנית, לא ב-cron
import { initAdmin, getAllTokens, sendToTokens } from './lib.mjs';

const { db, messaging } = initAdmin();

const tokens = await getAllTokens(db);
await sendToTokens(db, messaging, tokens, {
    title: '🎉 האירוע המיוחד היום ב-20:00!',
    body: 'כולם משחקים יחד באותה מילה, בזמן אמת — בואו לא תפספסו!'
});
