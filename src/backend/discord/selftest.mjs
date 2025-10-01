import 'dotenv/config';
import { postRaidAnnouncement, ensureBotReady } from './bot.js';

(async () => {
  try {
    await ensureBotReady();
    const t = new Date(); t.setMinutes(t.getMinutes() + 10);
    const raid = {
      title: 'Debug Mythic 1/8 VIP',
      difficulty: 'Mythic',
      lootType: 'VIP',
      bosses: 1,
      date: t.toISOString(),
      lead: process.env.DEBUG_LEAD_ID || '', // irgendeine User-ID vom Server
    };
    await postRaidAnnouncement(raid);
    console.log('✅ Selftest erfolgreich – Channel & Nachricht erstellt/gefunden.');
    process.exit(0);
  } catch (e) {
    console.error('❌ Selftest fehlgeschlagen:', e?.message || e);
    process.exit(1);
  }
})();
