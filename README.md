# ZSL Expenses

Aplikace pro vyúčtování snowboardových **Sústredení a Pretekov**.

## Doporučená verze: lokální PWA pro iPhone a Android
Složka **[web/](./web/)** obsahuje webovou aplikaci, kterou lze z prohlížeče **přidat na plochu telefonu**.

- **Bez externí databáze, účtu a Apple Developer Programu**.
- Profily trenérů, jezdci, akce, zálohy, nákupy a účtenky jsou uloženy v telefonu pomocí **IndexedDB**.
- Účtenky nahraješ nejdřív; bankovní potvrzení k platbám kartou přidáš později.
- Přehled zůstatku zálohy, grafy kategorií a kontrola chybějících dokladů.
- Export vyúčtování jako ZIP a **kompletní záloha / obnova lokálních dat**.
- PWA lze po prvním načtení používat i bez internetu. Kód je staticky hostovaný přes HTTPS.

**[Návod k nasazení, iPhonu a zálohám](./web/README.md)**.

```bash
cd web
npm install
npm test
npm run build
npm run dev
```

### Důležité
Aplikace **zatím není veřejně nasazená**. Otevření samotného repozitáře GitHubu nespustí instalovatelnou aplikaci; je potřeba statický HTTPS hosting (například Vercel nebo GitHub Pages, pokud to umožňuje plán GitHubu). Při nasazení hosting uchovává **pouze kód aplikace, nikoliv soukromé účtenky a bankovní dokumenty**.

**Data jsou jen v konkrétním telefonu.** Vymazání dat Safari nebo odstranění aplikace je může smazat. Pravidelně vytvářej kompletní zálohu ZIP a ulož ji do Souborů/iCloud Drive. Při prvním testování používej fiktivní doklady. AI OCR a originální ZSL XLSX export zatím nejsou implementované.

## Starší nativní prototyp: Expo
Kořenové soubory `App.jsx`, `app.json`, `eas.json` a `package.json` nadále obsahují původní Expo/React Native prototyp. Nejsou nutné pro provoz lokální PWA.

```bash
npm install
npm test
npx expo start
```
