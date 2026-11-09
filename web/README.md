# ZSL Expenses · Lokální PWA (bez databázového serveru)

## Vylepšení OCR v0.5 – důkladné čtení účtenek

Novým výchozím nastavením je **Důkladné rozpoznávání**. Jedna fotka se čte postupně vícekrát pomocí různých nastavení obrazu a OCR segmentace. Samostatný průchod horní částí účtenky se zaměřuje na **dodavatele**; když je nejasná částka, může přibýt další průchod spodní částí. Rychlý režim zůstává dostupný v rozbalovacím výběru na záložce **Doklady**.

- OCR používá jeden pracovní proces, rozpoznávání angličtiny a němčiny (pokud se jejich modely načtou), předzpracování kontrastu a více průchodů. Na slabším telefonu může být důkladné čtení znatelně pomalejší; nemusí zvýšit úspěšnost u každé fotografie.
- U starších účtenek použij **Přečíst znovu**. Původní fotografie a ručně potvrzené údaje zůstanou zachované; nové návrhy najdeš v **Upravit**.
- Detail dokladu nyní nabízí **možné dodavatele** a alternativní částky. Klepnutím na návrh vyplníš pole, ale správnost je stále nutné ověřit na originální fotografii.
- Pokud se jednotlivé průchody neshodnou na částce či obchodníkovi, aplikace výsledek označí jako nejistý místo automatického rozhodnutí.
- Pro OCR fotografií první spuštění vyžaduje internet ke stažení jazykových modelů. Fotografie jsou analyzované místně v telefonu. PDF OCR stále nepodporujeme.
- **Před aktualizací doporučujeme Kompletní zálohu ZIP.** Tato verze zachovává stejné IndexedDB úložiště a nevyžaduje jeho výmaz.

## Novinky v0.4: náhled formuláře, lokální OCR a soupiska

- **Náhled → s.1 – Pokyn / s.3 – Výdavky / Kontrola**: mobilní pracovní náhled polí původního ZSL formuláře. Ukazuje, co je vyplněné a chybí. **Zatím nejde o skutečné úpravy či export originálního XLSX.** ZIP nadále obsahuje CSV a fotografické doklady.
- **Trenéři**: jméno, titul, funkce, oddělení ZSL, trvalá adresa, telefon, e-mail, IBAN, volitelně BIC a banka. Staré uložené profily lze doplnit a nebudou smazané.
- **Sústredenie / Preteky**: můžeš kdykoliv upravit datum, čas, místo odchodu a návratu, destinaci/stát, účel a číslo zálohy.
- **OCR přímo v telefonu (Tesseract.js)**: po nahrání fotografie se pokusí navrhnout částku, datum, obchodníka, kategorii a způsob platby. Jazykový model a pracovní moduly OCR se **při prvním použití stahují z CDN**, proto první OCR vyžaduje internet; pozdější offline OCR na iPhonu není garantováno. Fotografie se kvůli OCR neodesílají na server. Rozpoznané hodnoty vždy ručně zkontroluj – mohou být nepřesné.
- OCR zatím funguje pro **fotografie**, ne pro PDF. U dříve nahrané fotografie použij **Přečíst znovu**. Fotografie a PDF mají vlastní **Náhled dokladu**.
- **Aktuální soupiska**: jezdce lze přidat i odebrat po vytvoření akce, historie změn se zachová. Globální **Archivovat** skryje jezdce z nových akcí, starší evidence zůstává.
- Lokální IndexedDB se **nevytváří znovu** – v0.4 používá stejné tabulky a soubory jako v0.3. Přesto je vhodné vytvořit úplnou ZIP zálohu před aktualizací a po ní.

**Aktuální doporučená varianta.** PWA pro iPhone, Android i počítač. Účtenky, bankovní potvrzení, profily, jezdci a finanční záznamy ukládá **přímo do IndexedDB v tomto zařízení**. Nepotřebuje Supabase, login ani vlastní server. V kořeni repozitáře zůstává starší Expo verze.

## Co již funguje
- Aplikace s ikonou na ploše telefonu (Safari → Sdílet → Přidat na plochu)
- Profily více trenérů a databáze jezdců
- Nové **Sústredenie** nebo **Preteky**: trenér, jezdci, termín, měna a počáteční záloha
- Další zálohy / vklady a vrácení peněz, zůstatek a graf kategorií
- Hromadné nahrání účtenek / focení; ruční doplnění obchodníka, sumy, data, kategorie a způsobu platby
- **Pozdější** přidání jednoho bankovního potvrzení k jednotlivé platbě kartou, hotovost bez potvrzení
- Nafta, benzín a AdBlue patří společně do kategorie Tankování
- ZIP konkrétního vyúčtování: doklady + potvrzení + CSV + kontrola chybějících dokladů
- **Kompletní záloha ZIP a obnova**: všechna soustředění, profily i původní přílohy
- Bez internetového připojení fungují lokální operace **po prvním úspěšném načtení a uložení PWA pro offline použití**

## Co ještě není hotové
Automatické rozpoznání účtenek (AI OCR), hromadné automatické párování bankovních potvrzení podle částky, oficiální ZSL Excel, více měn během jedné akce a komplexní účetní výpočty. Offline chování ještě musí projít testem na skutečném iPhonu.

## Lokální vývoj
```bash
cd web
npm install
npm test
npm run build
npm run dev
```
Na počítači se otevře adresa, kterou Vite vypíše. Kód PWA nevyžaduje žádné .env soubory.

## Jak zpřístupnit aplikaci přes HTTPS
**Důležité:** GitHub repozitář obsahuje zdrojový kód, ale jeho adresa není URL hotové webové aplikace. PWA potřebuje jednorázově zveřejnit své statické soubory na HTTPS hostingu.

### Jednoduchá možnost – Vercel
1. Na https://vercel.com/new importuj repo `TheDubous/zsl-expenses`.
2. Vyber větev `feature/pwa-supabase` (dokud není změna sloučena do `main`).
3. **Root Directory** nastav na `web`.
4. Framework `Vite`, Build Command `npm run build`, Output Directory `dist`.
5. **Žádné environment variables** nejsou potřeba; deploy a otevři dodanou HTTPS adresu.
6. Na iPhonu ji otevři v **Safari → Sdílet → Přidat na plochu → Otevřít jako webovou aplikaci**.
7. **Začni pracovat přímo v ikoně na ploše.** Data vytvořená v Safari mohou mít odlišné úložiště než data PWA spuštěné z plochy.

### Volitelně – GitHub Pages
Připravený workflow `.github/workflows/deploy-pwa-pages.yml` umožní statické nasazení do `https://TheDubous.github.io/zsl-expenses/`. Je třeba v GitHub Settings → Pages nastavit Source na GitHub Actions a spustit workflow. **Pozor:** GitHub Free podporuje Pages pouze ve veřejných repozitářích; soukromé repozitáře vyžadují oprávněný placený plán. Není nutné repozitář zveřejňovat; Vercel umí deploy i ze soukromého repozitáře.

Hosting slouží jen k doručení webové aplikace. **Doklady se na tento hosting neposílají.**

## Zálohování a ochrana dat
- Data v IndexedDB jsou v zařízení, nikoli v souborech viditelných v aplikaci Soubory. Smazání aplikace nebo jejích dat je může odstranit.
- Po každém dni a zejména po dokončení akce zvol **Záloha → Stáhnout kompletní zálohu ZIP** a ulož ZIP mimo aplikaci, například na iCloud Drive.
- Obnova ze ZIPu **nahradí všechny současné lokální záznamy** a znovu uloží všechny přílohy.
- Záložní ZIP není šifrovaný, nepředávej ho veřejně a ukládej ho bezpečně.
- Každé zařízení má vlastní databázi; trenéři mezi telefony nic automaticky nesdílejí.
- Bez vlastních účtů ani přihlášení: každý, kdo má odemčené dané zařízení a přístup k PWA, může otevřít uložené doklady.
- Pro první test používej fiktivní účetní doklady. S reálnými bankovními přílohami až po ověření na telefonu a zavedení zálohovacího postupu.

## Technické soubory
- `src/main.jsx`: mobilní rozhraní, soustředění/závody, doklady, grafy a zálohování
- `src/localdb.js`: IndexedDB tabulky a soubory
- `src/archive.js`: ZIP export, kompletní zálohování a obnova
- `src/utils.mjs`: kategorie, částky a výpočet zbývající zálohy
- `vite.config.js`: PWA, servisní pracovník a ikonky
- `tests/`: testy výpočtů a lokální databáze
