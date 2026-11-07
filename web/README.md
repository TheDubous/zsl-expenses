# ZSL Expenses PWA

Webová aplikácia / PWA pre iPhone, Android a desktop. **Toto je samostatný návrh v priečinku `web/`** – existujúci Expo projekt zostáva zachovaný v koreňovom priečinku repozitára.

## Stav prototypu
- Registrácia/prihlásenie cez Supabase Auth
- Každý tréner má vlastný profil, akcie, jazdcov a doklady
- Akcie: `Sústredenie` a `Preteky`; pri vzniku voľba jazdcov
- Pohyby záloh: viac vkladov a vratiek, výpočet zostatku
- Nahrávanie viacerých účteniek / fotografovanie na iPhone
- Každý výdavok možno opraviť a označiť spôsob platby
- Bankové potvrdenie sa pridáva **neskôr**, samostatne ku kartovému výdavku
- Kontrola kompletnosti, kategórie, graf a export ZIP s potvrdeniami
- Zabezpečené súkromné súbory cez Supabase Storage a RLS
- PWA manifest a service worker pre inštalovanie na plochu

**Zatiaľ chýba:** OCR/AI rozpoznávanie, hromadné automatické priraďovanie potvrdení, úplný oficiálny Excel ZSL, viac mien v jednej akcii, offline synchronizácia a administrácia celej organizácie. Graf je podľa zadaných kategórií a súm. Testovanie je len prototypové, nie bezpečnostný audit.

## 1. Supabase

1. Vytvor nový projekt na https://supabase.com/dashboard.
2. Otvor **SQL Editor** a spusti celý súbor `../supabase/migrations/20261107_pwa_schema.sql`.
3. V **Authentication → Providers** zapni e-mailové prihlasovanie. Pri verejnom nasadení je vhodné ponechať potvrdenie e-mailu.
4. V **Project Settings → API** skopíruj Project URL a **publishable key** (nie secret, nie service_role).
5. V Supabase **Authentication → URL Configuration** nastav produkčnú URL po prvom nasadení a povolené redirect adresy.

## 2. Lokálny štart

```bash
cd web
npm install
cp .env.example .env.local
```

Do `.env.local` doplň:
```ini
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
```
```bash
npm test
npm run build
npm run dev
```

## 3. Verejné HTTPS nasadenie cez Vercel

1. Pripoj účet GitHub vo Vercel https://vercel.com/new a importuj `TheDubous/zsl-expenses`.
2. V **Root Directory** nastav **web** (nie koreň repozitára).
3. Framework Vite; `Build Command: npm run build`, `Output Directory: dist`.
4. Nastav produkčné aj preview env premenné `VITE_SUPABASE_URL` a `VITE_SUPABASE_PUBLISHABLE_KEY`.
5. Deploy. Pri testovaní vetvy `feature/pwa-supabase` použij preview deployment alebo zmeň production branch. Nezmiešaj ho s pôvodnou Expo aplikáciou.
6. Po nasadení aktualizuj Supabase Auth URL / redirect nastavenia.

## 4. Inštalácia na iPhone

1. Otvor HTTPS adresu vo **Safari**.
2. Daj **Zdieľať → Pridať na plochu** (prípadne **Otvoriť ako webovú aplikáciu**).
3. Na ploche otvor ikonu ZSL Expenses, prihlás sa a sprav skúšobné vyúčtovanie.

**Apple Developer účet ani App Store sa nevyžadujú.**

## 5. Bezpečnosť a hranice prototypu
- Každý užívateľ je oddelený RLS pravidlami. Súbory sú v **private** buckete, prefix cesty začína jeho auth UUID.
- Klient používa iba publishable/anon kľúč; NIKDY do web klienta ani do GitHubu nevkladaj secret alebo service_role kľúč.
- Prihlásenie uchováva reláciu v úložisku prehliadača; na zdieľanom telefóne sa odhlás.
- Vygenerovaný ZIP nie je šifrovaný: posielaj ho iba schváleným príjemcom.
- Service worker cache-uje iba webové assety, nie bankové doklady. Bez internetu sa dá načítať shell aplikácie, ale **dáta sa offline neupravujú**.
- Pred ostrým používaním s bankovými dokladmi: prejsť RLS a Storage policies, zálohy, obnovu dát, dobu uchovávania, súhlasy a GDPR.
