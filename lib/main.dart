import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'app_preferences.dart';
import 'member_api.dart';
import 'member_design.dart';
import 'member_pages.dart';
import 'push_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  if (kIsWeb) await MemberApi.loadWebsiteConfig();
  await initializeDateFormatting('en_MY');
  await initializeDateFormatting('ms');
  await PushService.initialize();
  runApp(const MemberApp());
}

class MemberApp extends StatefulWidget {
  const MemberApp({super.key});
  @override
  State<MemberApp> createState() => _MemberAppState();
}

class _MemberAppState extends State<MemberApp> {
  String language = 'ms';
  bool dark = false;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await preferences();
    if (mounted) {
      setState(() {
        language = prefs.getString('language') ?? 'ms';
        dark = prefs.getBool('dark') ?? false;
      });
    }
  }

  void _setLanguage(String value) {
    setState(() => language = value);
    preferences().then((prefs) => prefs.setString('language', value));
  }

  void _setDark(bool value) {
    setState(() => dark = value);
    preferences().then((prefs) => prefs.setBool('dark', value));
  }

  @override
  Widget build(BuildContext context) => AppPreferences(
    language: language,
    dark: dark,
    setLanguage: _setLanguage,
    setDark: _setDark,
    child: MaterialApp(
      title: language == 'en' ? 'My Membership' : 'Keahlian Saya',
      debugShowCheckedModeBanner: false,
      builder: (context, child) {
        if (!kIsWeb || child == null) return child ?? const SizedBox.shrink();
        return LayoutBuilder(
          builder: (context, constraints) {
            const contentWidth = 960.0;
            if (constraints.maxWidth <= contentWidth) return child;
            return ColoredBox(
              color: dark ? const Color(0xFF09170E) : shell,
              child: Center(
                child: Container(
                  width: contentWidth,
                  height: constraints.maxHeight,
                  decoration: BoxDecoration(
                    color: Theme.of(context).scaffoldBackgroundColor,
                    boxShadow: const [
                      BoxShadow(color: Color(0x22000000), blurRadius: 28),
                    ],
                  ),
                  child: MediaQuery(
                    data: MediaQuery.of(
                      context,
                    ).copyWith(size: Size(contentWidth, constraints.maxHeight)),
                    child: child,
                  ),
                ),
              ),
            );
          },
        );
      },
      locale: Locale(language),
      supportedLocales: const [Locale('ms'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: brand,
          brightness: Brightness.dark,
        ),
        textTheme: Theme.of(context).textTheme
            .apply(bodyColor: Colors.white, displayColor: Colors.white),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: brand,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(56),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(17),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: Colors.white,
        colorScheme: ColorScheme.fromSeed(seedColor: brand, primary: brand),
        textTheme: Theme.of(context).textTheme
            .apply(bodyColor: ink, displayColor: ink),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 18,
            vertical: 18,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(17),
            borderSide: const BorderSide(color: line),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(17),
            borderSide: const BorderSide(color: line),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(17),
            borderSide: const BorderSide(color: brand, width: 1.6),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: darkGreen,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(56),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(17),
            ),
            textStyle: const TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      ),
      home: const MemberHome(),
    ),
  );
}

class MemberHome extends StatefulWidget {
  const MemberHome({super.key});
  @override
  State<MemberHome> createState() => _MemberHomeState();
}

class _MemberHomeState extends State<MemberHome> {
  final api = MemberApi();
  Map<String, dynamic>? profile;
  List<Map<String, dynamic>> plans = [];
  List<Map<String, dynamic>> attendanceDays = [];
  Map<String, dynamic> appSettings = {};
  bool loading = true, busy = false;
  int tab = 0;
  String? error, pushToken;

  void _showReminder(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  void initState() {
    super.initState();
    _initialize();
  }

  Future<void> _initialize() async {
    if (MemberApi.baseUrl.isEmpty) {
      setState(() => loading = false);
      return;
    }
    try {
      plans = await api.plans();
      if (await api.savedToken != null) {
        profile = await api.me();
        attendanceDays = await api.attendance();
        appSettings = await api.settings();
        if (profile?['pushEnabled'] != false) {
          pushToken = await PushService.register(
            api,
            onForeground: _showReminder,
          );
        }
      }
    } catch (e) {
      error = e.toString();
    } finally {
      if (mounted) setState(() => loading = false);
    }
  }

  Future<void> _refresh() async {
    final latest = await api.me();
    final days = await api.attendance();
    final settings = await api.settings();
    if (mounted) {
      setState(() {
        profile = latest;
        attendanceDays = days;
        appSettings = settings;
        error = null;
      });
    }
    if (latest['pushEnabled'] != false) {
      pushToken ??= await PushService.register(
        api,
        onForeground: _showReminder,
      );
    }
    if (mounted) setState(() {});
  }

  Future<void> _submit(Future<void> Function() action) async {
    if (MemberApi.baseUrl.isEmpty) {
      _showReminder(
        tr(
          context,
          'Pratonton sahaja. Log masuk dan pendaftaran tersedia selepas server disambungkan.',
          'Preview only. Sign in and registration will be available once the server is connected.',
        ),
      );
      return;
    }
    if (busy) return;
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await action();
      await _refresh();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> _logout() async {
    await PushService.stop();
    await api.logout(pushToken: pushToken);
    if (mounted) {
      setState(() {
        profile = null;
        pushToken = null;
        error = null;
        tab = 0;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final member = profile;
    return Scaffold(
      body: SafeArea(
        child: loading
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(22, 12, 22, 0),
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: const Color(0xFFFDECEE),
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Text(
                          translatedError(context, error!),
                          style: const TextStyle(color: Color(0xFFC92A37)),
                        ),
                      ),
                    ),
                  if (MemberApi.baseUrl.isEmpty)
                    Padding(
                      padding: const EdgeInsets.fromLTRB(22, 12, 22, 0),
                      child: Text(
                        tr(
                          context,
                          'Pratonton laman web — server belum disambungkan.',
                          'Website preview — server is not connected yet.',
                        ),
                      ),
                    ),
                  Expanded(
                    child: member == null
                        ? SingleChildScrollView(
                            child: AccountForms(
                              api: api,
                              plans: plans,
                              busy: busy,
                              submit: _submit,
                            ),
                          )
                        : RefreshIndicator(
                            onRefresh: _refresh,
                            child: ListView(
                              key: ValueKey(tab),
                              padding: const EdgeInsets.fromLTRB(
                                24,
                                24,
                                24,
                                28,
                              ),
                              children: [
                                if (tab == 0)
                                  HomeView(
                                    profile: member,
                                    attendance: attendanceDays,
                                    onPass: () => setState(() => tab = 2),
                                    onAccount: () => setState(() => tab = 3),
                                    onMembership: () => setState(() => tab = 1),
                                    onRefresh: () => _submit(() async {}),
                                  )
                                else if (tab == 1)
                                  MembershipView(
                                    profile: member,
                                    plans: plans,
                                    settings: appSettings,
                                    api: api,
                                    busy: busy,
                                    submit: _submit,
                                  )
                                else if (tab == 2)
                                  QrPassView(profile: member)
                                else
                                  SettingsView(
                                    api: api,
                                    profile: member,
                                    settings: appSettings,
                                    submit: _submit,
                                    onLogout: _logout,
                                  ),
                              ],
                            ),
                          ),
                  ),
                  if (member != null)
                    MemberNav(
                      selected: tab,
                      onChanged: (value) => setState(() => tab = value),
                    ),
                ],
              ),
      ),
    );
  }
}

class AccountForms extends StatefulWidget {
  const AccountForms({
    super.key,
    required this.api,
    required this.plans,
    required this.busy,
    required this.submit,
  });
  final MemberApi api;
  final List<Map<String, dynamic>> plans;
  final bool busy;
  final Future<void> Function(Future<void> Function()) submit;
  @override
  State<AccountForms> createState() => _AccountFormsState();
}

class _AccountFormsState extends State<AccountForms> {
  final id = TextEditingController(),
      loginPhone = TextEditingController(),
      name = TextEditingController(),
      phone = TextEditingController(),
      email = TextEditingController();
  bool registering = false, showPhone = false;
  String? planId;
  XFile? receipt, photo;
  final picker = ImagePicker();

  @override
  void dispose() {
    id.dispose();
    loginPhone.dispose();
    name.dispose();
    phone.dispose();
    email.dispose();
    super.dispose();
  }

  Future<XFile?> _chooseImage() =>
      picker.pickImage(source: ImageSource.gallery, imageQuality: 85);

  @override
  Widget build(BuildContext context) => Center(
    child: ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 480),
      child: Padding(
        padding: EdgeInsets.fromLTRB(24, registering ? 36 : 90, 24, 48),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Center(child: BrandMark(size: 68)),
            const SizedBox(height: 22),
            Center(
              child: Text(
                tr(
                  context,
                  'K E A H L I A N   S A Y A',
                  'M Y   M E M B E R S H I P',
                ),
                style: TextStyle(
                  color: brand,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 2,
                ),
              ),
            ),
            const SizedBox(height: 13),
            Text(
              registering
                  ? tr(
                      context,
                      'Daftar ahli baharu',
                      'Register as a new member',
                    )
                  : tr(context, 'Selamat kembali', 'Welcome back'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w800,
                letterSpacing: -1.1,
              ),
            ),
            const SizedBox(height: 7),
            Text(
              registering
                  ? tr(
                      context,
                      'Isi maklumat dan hantar bukti bayaran untuk semakan admin.',
                      'Fill in your details and send payment proof for admin review.',
                    )
                  : tr(
                      context,
                      'Masuk dengan ID ahli dan nombor telefon berdaftar.',
                      'Sign in with your member ID and registered phone number.',
                    ),
              textAlign: TextAlign.center,
              style: const TextStyle(color: muted, fontSize: 15, height: 1.4),
            ),
            const SizedBox(height: 34),
            if (!registering) ...[
              TextField(
                controller: id,
                textInputAction: TextInputAction.next,
                decoration: InputDecoration(
                  labelText: tr(
                    context,
                    'ID ahli atau ID permohonan',
                    'Member or application ID',
                  ),
                ),
              ),
              const SizedBox(height: 14),
              TextField(
                controller: loginPhone,
                keyboardType: TextInputType.phone,
                obscureText: !showPhone,
                decoration: InputDecoration(
                  labelText: tr(
                    context,
                    'Nombor telefon berdaftar',
                    'Registered phone number',
                  ),
                  suffixIcon: IconButton(
                    tooltip: showPhone
                        ? tr(context, 'Sembunyikan nombor', 'Hide number')
                        : tr(context, 'Lihat nombor', 'Show number'),
                    onPressed: () => setState(() => showPhone = !showPhone),
                    icon: Icon(
                      showPhone
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 22),
              FilledButton(
                onPressed: widget.busy
                    ? null
                    : () => widget.submit(
                        () => widget.api.login(id.text, loginPhone.text),
                      ),
                child: Text(
                  widget.busy
                      ? tr(context, 'Sila tunggu...', 'Please wait...')
                      : tr(context, 'Masuk', 'Sign in'),
                ),
              ),
            ] else ...[
              TextField(
                controller: name,
                decoration: InputDecoration(
                  labelText: tr(context, 'Nama penuh', 'Full name'),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                decoration: InputDecoration(
                  labelText: tr(
                    context,
                    'Telefon dengan kod negara',
                    'Phone with country code',
                  ),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: email,
                keyboardType: TextInputType.emailAddress,
                decoration: InputDecoration(
                  labelText: tr(context, 'E-mel (pilihan)', 'Email (optional)'),
                ),
              ),
              const SizedBox(height: 12),
              PlanPicker(
                plans: widget.plans,
                value: planId,
                onChanged: (value) => setState(() => planId = value),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: widget.busy
                    ? null
                    : () async {
                        final chosen = await _chooseImage();
                        if (chosen != null) setState(() => photo = chosen);
                      },
                icon: const Icon(Icons.face_outlined),
                label: Text(
                  photo?.name ??
                      tr(context, 'Pilih gambar wajah', 'Choose face photo'),
                ),
              ),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: widget.busy
                    ? null
                    : () async {
                        final chosen = await _chooseImage();
                        if (chosen != null) setState(() => receipt = chosen);
                      },
                icon: const Icon(Icons.receipt_long_outlined),
                label: Text(
                  receipt?.name ??
                      tr(context, 'Pilih gambar resit', 'Choose receipt image'),
                ),
              ),
              const SizedBox(height: 18),
              FilledButton(
                onPressed:
                    widget.busy ||
                        planId == null ||
                        receipt == null ||
                        photo == null
                    ? null
                    : () => widget.submit(() async {
                        await widget.api.register(
                          name: name.text,
                          phone: phone.text,
                          email: email.text,
                          planId: planId!,
                          receipt: receipt!,
                          photo: photo!,
                        );
                      }),
                child: Text(
                  widget.busy
                      ? tr(context, 'Sila tunggu...', 'Please wait...')
                      : tr(context, 'Hantar permohonan', 'Submit application'),
                ),
              ),
              const SizedBox(height: 12),
              Text(
                tr(
                  context,
                  'Akses pintu hanya aktif selepas admin meluluskan.',
                  'Door access starts only after admin approval.',
                ),
                textAlign: TextAlign.center,
                style: TextStyle(color: muted, fontSize: 13),
              ),
            ],
            const SizedBox(height: 20),
            TextButton(
              onPressed: widget.busy
                  ? null
                  : () => setState(() => registering = !registering),
              child: Text(
                registering
                    ? tr(
                        context,
                        'Sudah ada ID? Masuk',
                        'Already have an ID? Sign in',
                      )
                    : tr(
                        context,
                        'Belum jadi ahli? Daftar',
                        'New member? Register',
                      ),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}
