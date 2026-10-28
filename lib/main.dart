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
  final id = TextEditingController();
  final loginPhone = TextEditingController();

  final name = TextEditingController();
  final phone = TextEditingController();
  final email = TextEditingController();

  bool registering = false;

  String? selectedGym;
  String? planId;

  XFile? receipt;
  XFile? photo;

  final picker = ImagePicker();

  // Temporary gym list for the new UI.
  // We will connect this to the real gym/workspace API in Stage 2.
  final List<String> gyms = const [
    'U FITNESS GYM',
  ];

  @override
  void dispose() {
    id.dispose();
    loginPhone.dispose();
    name.dispose();
    phone.dispose();
    email.dispose();
    super.dispose();
  }

  Future<XFile?> _chooseImage() {
    return picker.pickImage(
      source: ImageSource.gallery,
      imageQuality: 85,
    );
  }

  InputDecoration _inputDecoration({
    required String hint,
  }) {
    return InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(
        color: Color(0xFF888888),
        fontSize: 14,
      ),
      filled: true,
      fillColor: Colors.white,
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 16,
        vertical: 14,
      ),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(7),
        borderSide: const BorderSide(
          color: Color(0xFFD0D0D0),
        ),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(7),
        borderSide: const BorderSide(
          color: Color(0xFFD0D0D0),
        ),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(7),
        borderSide: const BorderSide(
          color: Color(0xFF222222),
          width: 1.2,
        ),
      ),
    );
  }

  Widget _blackButton({
    required String text,
    required VoidCallback? onPressed,
  }) {
    return SizedBox(
      width: double.infinity,
      height: 47,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: const Color(0xFF222222),
          foregroundColor: Colors.white,
          disabledBackgroundColor: const Color(0xFF888888),
          disabledForegroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(7),
          ),
        ),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final background = const Color(0xFFF3F4F5);

    if (registering) {
      return _buildRegisterForm(context, background);
    }

    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 16,
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: 380,
                ),
                child: Column(
                  children: [
                    const SizedBox(height: 2),

                    // =====================================================
                    // U FITNESS GYM HEADER
                    // =====================================================
                    const Text(
                      'U FITNESS GYM',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: Colors.black,
                        fontSize: 27,
                        fontWeight: FontWeight.w700,
                        letterSpacing: -0.5,
                      ),
                    ),

                    const SizedBox(height: 2),

                    const Text(
                      'Member Portal',
                      style: TextStyle(
                        color: Color(0xFF777777),
                        fontSize: 14,
                      ),
                    ),

                    const SizedBox(height: 25),

                    // =====================================================
                    // LOGIN CARD
                    // =====================================================
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(
                        35,
                        33,
                        35,
                        34,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x18000000),
                            blurRadius: 24,
                            offset: Offset(0, 7),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // -------------------------------------------------
                          // TITLE
                          // -------------------------------------------------
                          const Center(
                            child: Text(
                              'Member Login',
                              style: TextStyle(
                                color: Colors.black,
                                fontSize: 28,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.6,
                              ),
                            ),
                          ),

                          const SizedBox(height: 10),

                          const Center(
                            child: Text(
                              'Enter your registered WhatsApp number to\n'
                              'receive an OTP.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Color(0xFF777777),
                                fontSize: 14,
                                height: 1.45,
                              ),
                            ),
                          ),

                          const SizedBox(height: 32),

                          // -------------------------------------------------
                          // CHOOSE YOUR GYM
                          // -------------------------------------------------
                          const Text(
                            'Choose Your Gym',
                            style: TextStyle(
                              color: Colors.black,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),

                          const SizedBox(height: 8),

                          DropdownButtonFormField<String>(
                            value: selectedGym,
                            decoration: _inputDecoration(
                              hint: 'Select your gym',
                            ),
                            icon: const Icon(
                              Icons.keyboard_arrow_down,
                              color: Colors.black,
                            ),
                            items: gyms.map((gym) {
                              return DropdownMenuItem<String>(
                                value: gym,
                                child: Text(
                                  gym,
                                  style: const TextStyle(
                                    color: Colors.black,
                                    fontSize: 14,
                                  ),
                                ),
                              );
                            }).toList(),
                            onChanged: widget.busy
                                ? null
                                : (value) {
                                    setState(() {
                                      selectedGym = value;
                                    });
                                  },
                          ),

                          const SizedBox(height: 19),

                          // -------------------------------------------------
                          // CONFIRM GYM
                          // -------------------------------------------------
                          _blackButton(
                            text: 'Confirm Gym',
                            onPressed: widget.busy ||
                                    selectedGym == null
                                ? null
                                : () {
                                    ScaffoldMessenger.of(context)
                                        .showSnackBar(
                                      SnackBar(
                                        content: Text(
                                          '$selectedGym selected',
                                        ),
                                      ),
                                    );
                                  },
                          ),

                          const SizedBox(height: 1),

                          // -------------------------------------------------
                          // WHATSAPP NUMBER
                          // -------------------------------------------------
                          const Text(
                            'WhatsApp Number',
                            style: TextStyle(
                              color: Colors.black,
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),

                          const SizedBox(height: 8),

                          TextField(
                            controller: loginPhone,
                            keyboardType: TextInputType.phone,
                            decoration: _inputDecoration(
                              hint: 'e.g. 60123456789',
                            ),
                          ),

                          const SizedBox(height: 20),

                          // -------------------------------------------------
                          // GET OTP
                          // -------------------------------------------------
                          _blackButton(
                            text: widget.busy
                                ? 'Please wait...'
                                : 'Get WhatsApp OTP',
                            onPressed: widget.busy
                                ? null
                                : () {
                                    // OTP functionality will be connected
                                    // in Stage 2.
                                    ScaffoldMessenger.of(context)
                                        .showSnackBar(
                                      const SnackBar(
                                        content: Text(
                                          'WhatsApp OTP integration will be connected next.',
                                        ),
                                      ),
                                    );
                                  },
                          ),

                          const SizedBox(height: 14),

                          // -------------------------------------------------
                          // REGISTER
                          // -------------------------------------------------
                          const Text(
                            'New member?',
                            style: TextStyle(
                              color: Colors.black,
                              fontSize: 16,
                            ),
                          ),

                          const SizedBox(height: 2),

                          GestureDetector(
                            onTap: widget.busy
                                ? null
                                : () {
                                    setState(() {
                                      registering = true;
                                    });
                                  },
                            child: const Text(
                              'Register Here',
                              style: TextStyle(
                                color: Colors.blue,
                                fontSize: 16,
                                decoration: TextDecoration.underline,
                                decorationColor: Colors.blue,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 30),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildRegisterForm(
    BuildContext context,
    Color background,
  ) {
    return Scaffold(
      backgroundColor: background,
      body: SafeArea(
        child: SingleChildScrollView(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 30,
              ),
              child: ConstrainedBox(
                constraints: const BoxConstraints(
                  maxWidth: 480,
                ),
                child: Container(
                  padding: const EdgeInsets.all(30),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: const [
                      BoxShadow(
                        color: Color(0x18000000),
                        blurRadius: 24,
                        offset: Offset(0, 7),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'U FITNESS GYM',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.black,
                          fontSize: 27,
                          fontWeight: FontWeight.w700,
                        ),
                      ),

                      const SizedBox(height: 3),

                      const Text(
                        'Member Portal',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Color(0xFF777777),
                          fontSize: 14,
                        ),
                      ),

                      const SizedBox(height: 25),

                      const Text(
                        'New Member Registration',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.black,
                          fontSize: 25,
                          fontWeight: FontWeight.w700,
                        ),
                      ),

                      const SizedBox(height: 25),

                      TextField(
                        controller: name,
                        decoration: _inputDecoration(
                          hint: 'Full name',
                        ),
                      ),

                      const SizedBox(height: 12),

                      TextField(
                        controller: phone,
                        keyboardType: TextInputType.phone,
                        decoration: _inputDecoration(
                          hint: 'Phone with country code',
                        ),
                      ),

                      const SizedBox(height: 12),

                      TextField(
                        controller: email,
                        keyboardType: TextInputType.emailAddress,
                        decoration: _inputDecoration(
                          hint: 'Email (optional)',
                        ),
                      ),

                      const SizedBox(height: 12),

                      PlanPicker(
                        plans: widget.plans,
                        value: planId,
                        onChanged: (value) {
                          setState(() {
                            planId = value;
                          });
                        },
                      ),

                      const SizedBox(height: 12),

                      OutlinedButton.icon(
                        onPressed: widget.busy
                            ? null
                            : () async {
                                final chosen = await _chooseImage();

                                if (chosen != null) {
                                  setState(() {
                                    photo = chosen;
                                  });
                                }
                              },
                        icon: const Icon(Icons.face_outlined),
                        label: Text(
                          photo?.name ?? 'Choose face photo',
                        ),
                      ),

                      const SizedBox(height: 8),

                      OutlinedButton.icon(
                        onPressed: widget.busy
                            ? null
                            : () async {
                                final chosen = await _chooseImage();

                                if (chosen != null) {
                                  setState(() {
                                    receipt = chosen;
                                  });
                                }
                              },
                        icon: const Icon(
                          Icons.receipt_long_outlined,
                        ),
                        label: Text(
                          receipt?.name ?? 'Choose receipt image',
                        ),
                      ),

                      const SizedBox(height: 18),

                      _blackButton(
                        text: widget.busy
                            ? 'Please wait...'
                            : 'Submit application',
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
                      ),

                      const SizedBox(height: 15),

                      const Text(
                        'Door access starts only after admin approval.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Color(0xFF777777),
                          fontSize: 13,
                        ),
                      ),

                      const SizedBox(height: 18),

                      TextButton(
                        onPressed: widget.busy
                            ? null
                            : () {
                                setState(() {
                                  registering = false;
                                });
                              },
                        child: const Text(
                          'Already have an account? Member Login',
                          style: TextStyle(
                            color: Colors.blue,
                            decoration:
                                TextDecoration.underline,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
