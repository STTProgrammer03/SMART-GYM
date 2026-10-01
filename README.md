# Keahlian Saya

## Website deployment

This project can be published as a website using Flutter Web. Members open its
URL in a browser; no Android or iOS installation is required.

1. Install Flutter and run `flutter pub get` in this folder.
2. Preview the website now, without a backend:

   ```powershell
   flutter run -d chrome
   ```

3. Build the website:

   ```powershell
   flutter build web --release
   ```

4. Publish all files inside `build/web` to an HTTPS static website host.
   If deploying in a subfolder, add `--base-href=/members/` to the build command
   (replace `/members/` with the actual subfolder, including both slashes).
5. When your backend is ready, edit `apiBaseUrl` in `web/config.json` before a
   build, or edit `config.json` in the published website directly (no rebuild
   needed), then reload the website:

   ```json
   { "apiBaseUrl": "https://your-api.example.com" }
   ```

   Leave it empty to preview the sign-in and registration screens without
   contacting a backend. Account actions require the backend. An explicit
   `--dart-define=ACS_API_BASE_URL=...` takes precedence over this file.

6. Keep the existing access-control backend running. The website calls
   `/api/member-app` on the configured backend. If the website uses a different
   origin, configure the backend to allow that exact website origin through
   CORS, including OPTIONS requests, GET/POST and the Authorization header.

The browser layout supports widths up to 960 pixels and smaller phone screens.
Mobile push registration and its setting are disabled on the website. Browser
push notifications require a separate Firebase Web setup; server-side WhatsApp
reminders continue to depend on the existing backend configuration.

Before publishing, verify login, registration, photo and receipt uploads,
renewals, attendance, QR pass and logout against your backend. Android/iOS
folders are not included in the website build and do not need to be deleted.

Flutter app peribadi untuk ahli `access-control-system`. Setiap sesi hanya menerima profil dan permohonan ahli yang dipautkan kepada ID ahli tersebut. App tidak membuka SQLite secara terus; API pada server access control membaca dan menulis fail SQLite sedia ada.

## Aliran

1. Ahli baharu memilih pelan, memuat naik gambar wajah dan bukti bayaran. Permohonan menunggu kelulusan dalam **Membership Management → App Requests**. ID permohonan dipaparkan dalam app untuk login semula sebelum diluluskan.
2. Admin menyemak resit dan gambar, memilih peranti dan meluluskan. Sistem mencipta ahli, keahlian dan transaksi dalam SQLite yang sama lalu cuba sync peranti. Sync yang gagal akan dicuba semula oleh worker access control.
3. Ahli sedia ada masuk menggunakan ID ahli dan nombor telefon berdaftar. Ahli boleh melihat keahlian sendiri dan menghantar permohonan renew beserta resit. Admin perlu meluluskan sebelum tarikh tamat atau akses pintu berubah.
4. Scheduler access control menghantar reminder WhatsApp dan push pada hari yang dikonfigurasi (lalai 7, 3, 1). Log setiap saluran disimpan dalam SQLite.

Selepas login, app mempunyai Home (graf akses 7 hari), Membership (pelan dan renew dengan resit), Pas QR, dan Settings. Graf menggunakan `ENTRY` pertama hingga `EXIT` terakhir pada hari yang sama mengikut waktu Malaysia. Hari tanpa pasangan lengkap tidak diberi tempoh anggaran. Admin mengisi arahan bayaran dan butiran Contact pada **Membership Management → Member app payment and contact**. Suis notifikasi ahli hanya mengawal push app; WhatsApp masih mengikut tetapan reminder server. Tema dan bahasa disimpan pada peranti.

## Konfigurasi app

Gunakan URL HTTPS yang menuju ke server access control:

```powershell
flutter run --dart-define=ACS_API_BASE_URL=https://your-domain.example
```

Untuk menguji melalui browser tanpa emulator apabila `access-control-system` berjalan pada port 3000:

```powershell
flutter run -d web-server --web-hostname localhost --web-port 8080 --dart-define=ACS_API_BASE_URL=http://localhost:3000
```

Buka `http://localhost:8080`. API server membenarkan CORS dari localhost semasa mod pembangunan sahaja.

Untuk Android emulator semasa pembangunan, `http://10.0.2.2:3000` dibenarkan dalam build debug. Server Docker Compose sedia ada hanya bind kepada `127.0.0.1`; akses daripada telefon fizikal memerlukan reverse proxy HTTPS dan konfigurasi rangkaian.

Push menggunakan Firebase Cloud Messaging. Daftarkan app Android dan iOS dalam projek Firebase, sediakan APNs untuk iOS, kemudian berikan Firebase app options semasa build:

```powershell
flutter run --dart-define=ACS_API_BASE_URL=https://your-domain.example --dart-define=FIREBASE_PROJECT_ID=your-project --dart-define=FIREBASE_APP_ID=your-app-id --dart-define=FIREBASE_API_KEY=your-public-api-key --dart-define=FIREBASE_SENDER_ID=your-sender-id
```

Server memerlukan `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, dan `FIREBASE_PRIVATE_KEY` daripada service account dengan izin menghantar mesej FCM. Simpan private key hanya pada server. Push kekal tidak aktif jika Firebase app options tidak ditetapkan. Uji push iOS pada peranti fizikal selepas capability Push Notifications dan APNs key dikonfigurasi dalam akaun Apple/Firebase.

## Semakan

```powershell
flutter analyze --no-pub
flutter test --no-pub
```

Login ID ahli + nombor telefon tidak mengesahkan pemilikan telefon. Had cubaan login disediakan, tetapi OTP atau jemputan admin diperlukan untuk menghalang orang yang mengetahui kedua-duanya daripada menyamar.
