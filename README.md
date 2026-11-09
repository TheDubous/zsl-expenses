# ZSL Expenses

**v0.8:** PWA nyní automaticky používá veřejnou originální šablonu ZSL, která je součástí offline aplikace; bez ručního importu. Druhou možností zůstává vlastní upravený XLSX. OCR lépe vyhledává a zvětšuje úzké světlé účtenky (např. IMG_7834) a kontroluje skutečnou částku. [Vysvětlení rozdílu šablon a návod](./web/README.md).

**Nově v0.7:** import skutečného ZSL XLSX z telefonu, úprava pouze prázdných vstupních buněk při zachování původních 11 listů a vzorců, samostatné PDF účtenek s individuálními bankovními potvrzeními a protokol zapsaných/skipped položek. Oprava OCR: Summe není Ihre Ersparnis. [Návod v aplikaci](./web/README.md).

**v0.6:** Přehled má přesné názvy podle originální ZSL tabulky a umí stáhnout celý kontrolní PDF výkaz (`s.1`, `s.3`, tuzemské a zahraniční stravné, knihu jízd a správu z cesty). PDF neobsahuje fotografie dokladů a nenahrazuje originální XLSX. [Podrobnosti](./web/README.md).

## Aktualizace v0.4
Lokální PWA teď obsahuje **náhled připravovaných dat pro originální Excel ZSL** (`s.1 – pokyn`, `s.3 – výdavky`), bohatší profil trenéra (včetně adresy, telefonu a IBAN), úpravy soupisky a archivaci jezdců. Fotografie účtenek se nově pokouší číst pomocí OCR v telefonu; zjištěné částky je nutné ručně potvrdit. Dříve nahrané doklady lze znovu analyzovat. Podrobný popis a omezení: [web/README.md](./web/README.md).

**Pozor:** náhled ještě nevpisuje údaje do originálního XLSX. OCR při prvním použití vyžaduje internet a může se mýlit. Před používáním nové verze vytvoř kompletní ZIP zálohu; stejné lokální úložiště jako ve v0.3 zůstává zachované.

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
Aplikace běží na **https://thedubous.github.io/zsl-expenses/**. Otevření samotného repozitáře GitHubu nespustí instalovatelnou aplikaci; je potřeba statický HTTPS hosting (například Vercel nebo GitHub Pages, pokud to umožňuje plán GitHubu). Při nasazení hosting uchovává **pouze kód aplikace, nikoliv soukromé účtenky a bankovní dokumenty**.

**Data jsou jen v konkrétním telefonu.** Vymazání dat Safari nebo odstranění aplikace je může smazat. Pravidelně vytvářej kompletní zálohu ZIP a ulož ji do Souborů/iCloud Drive. Při prvním testování používej fiktivní doklady. OCR fotografií i doplňování originálního XLSX jsou implementované, ale jejich správnost musí člověk před vyúčtováním zkontrolovat.

## Starší nativní prototyp: Expo
Kořenové soubory `App.jsx`, `app.json`, `eas.json` a `package.json` nadále obsahují původní Expo/React Native prototyp. Nejsou nutné pro provoz lokální PWA.

```bash
npm install
npm test
npx expo start
```
