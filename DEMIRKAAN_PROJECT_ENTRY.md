ZeiTown — Proje Açıklaması (demirkaan.com/projects için)

Başlık: ZeiTown — Minimal Köy Tahtası Oyunu

Kısa Özet:
ZeiTown, klasik Monopoly akışını modern bir köy/şehir inşa temasıyla birleştiren küçük bir React + TypeScript uygulamasıdır. Tek sayfa uygulaması, çok dilli destek (Türkçe/İngilizce), oyun mekaniği (zar atma, kira, rehin, yükseltme), ve geliştirici yardımcıları (deterministik zar atma, snapshot) içerir.

Teknoloji yığını:
- React 18
- TypeScript
- Vite
- Zustand (state management)
- i18next (yerelleştirme)

Nasıl çalıştırılır (geliştirici):
1. Bağımlılıkları yükle:

```bash
npm install
```

2. Geliştirme sunucusunu başlat:

```bash
npm run dev
```

3. Tip kontrolü:

```bash
npx tsc -p tsconfig.json --noEmit
```

Kısa kullanım notları:
- Geliştirme modunda `window.__gameStore` ile snapshot ve deterministic roll yardımcılarına erişebilirsiniz. Örnek: `window.__gameStore.rollFixed(3,4)`
- Ses oynatma sorunları tarayıcı kısıtlamalarından kaynaklanıyorsa uygulama tekrar denemeyi engelleyecek şekilde korunmuştur.

Demo / Proje Metni (demirkaan.com/projects için öneri):
"ZeiTown — minimal, yerelleştirilebilir masaüstü/tahta oyunu prototipi. React + TypeScript ile geliştirildi; çok dilli (TR/EN) destek ve oyun mekaniği simülasyonu içerir."

Lisans:
Apache License 2.0 (repo içindeki LICENSE dosyasına bakınız)

NOT: README.md'ye doğrudan müdahale etmek yerine ayrı bir proje giriş dosyası oluşturdum; istersen README'yi de güncelleyebilirim veya bu içeriği doğrudan demirkaan.com yönetim paneline yapıştırmak için kısaltabilirim.
