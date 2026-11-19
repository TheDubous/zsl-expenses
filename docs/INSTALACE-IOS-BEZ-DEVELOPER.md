# Instalace ZSL Expenses 0.9.4 na iPhone bez placeného Apple Developer účtu

## Doporučená distribuce: PWA přes GitHub Pages

- Aplikace: https://thedubous.github.io/zsl-expenses/
- Instalační návod pro kolegy: https://thedubous.github.io/zsl-expenses/instalace.html
- Není to nativní .app/.ipa. V iOS neexistuje způsob, jak prostým ZIPem s nepodepsaným .app obejít ověřování aplikací.
- Nepoužívej kořenový Expo prototyp v0.1.0 jako náhradu za současnou webovou PWA v0.9.4.

## Předání kolegům
1. Pošli odkaz na instalační návod.
2. Kolega otevře v Safari odkaz na aplikaci.
3. Safari → Sdílet → Přidat na plochu → Otevřít jako webovou aplikaci (je-li tato volba dostupná) → Přidat.
4. Spustí ikonu ZSL Expenses z plochy, se zapnutým internetem nechá aplikaci poprvé načíst.
5. Otestuje založení záznamu, účtenku, OCR a export. Funkce závislé na externích zdrojích otestuje také offline.

## Nasazení přes GitHub
Workflow `.github/workflows/deploy-pwa-pages.yml` po pushi do `main` s úpravami `web/**` provede testy, stáhne originální XLSX šablonu, sestaví PWA a nasadí `web/dist` na GitHub Pages. Repo → Settings → Pages musí mít jako zdroj **GitHub Actions**. Stav nasazení ověř v GitHub → Actions. Odkaz začne fungovat po úspěšném deploymentu; samotná existence workflow neznamená, že web právě běží.

Instalační `web/public/instalace.html` je statický soubor, který Vite při `npm run build` kopíruje jako `dist/instalace.html`. Nepřesměrovává příchozí do nainstalované aplikace automaticky a nepotřebuje vlastní přístup k účtenkám.

## Proč kolega nemusí vidět ikonu
- Volba **Přidat na plochu** neproběhla do konce nebo se přidala obyčejná záložka.
- Odkaz je otevřený ve vestavěném prohlížeči WhatsAppu / Gmailu / jiné aplikace, ne v Safari.
- Ikona je na jiné stránce plochy nebo v knihovně aplikací.
- Zařízení má omezení správy/MDM/Času u obrazovky.
- iOS nabízí volbu Otevřít jako webovou aplikaci; pro samostatné spuštění má být zapnutá.

## Zásadní bezpečnost dat
Lokální IndexedDB při spuštění z plochy nemusí být totožná s úložištěm stejné stránky v Safari. Účtenky se samy nesynchronizují mezi telefony ani mezi instalacemi. Před přeinstalací nebo změnou režimu vždy exportuj kompletní ZIP zálohu a obnov ji v nové instalaci. Účtenky nejsou automaticky ukládány do GitHubu. Neodinstalovávej a nemaž data bez ověřené zálohy.

## Alternativa: skutečná .ipa bez placeného Developer programu
Sideload přes bezplatné Apple ID (např. pomocí AltStore/Sideloadly a počítače) může sloužit pro omezené testování, ale obvykle vyžaduje obnovu podpisu po 7 dnech, dostupný počítač a další údržbu na každém zařízení. Není vhodný pro bezproblémovou distribuci větší skupině kolegů. Bez podpisu nelze doručit běžně instalovatelný .app přes ZIP.

**Před zveřejněním doporučeno:** ověřit iPhone Safari instalaci, spuštění, OCR, zálohu/obnovu a export při reálném použití. Nelze potvrdit z GitHub zdrojů samotných, že každý telefon a každá funkce funguje.
