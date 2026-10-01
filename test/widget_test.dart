import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:reminder_app/main.dart';
import 'package:reminder_app/app_preferences.dart';
import 'package:reminder_app/member_api.dart';
import 'package:reminder_app/member_design.dart';
import 'package:reminder_app/member_pages.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('en_MY');
    await initializeDateFormatting('ms');
  });

  testWidgets('shows member sign in and registration choices', (tester) async {
    await tester.pumpWidget(const MemberApp());
    await tester.pumpAndSettle();
    expect(find.text('Selamat kembali'), findsOneWidget);
    expect(find.text('ID ahli atau ID permohonan'), findsOneWidget);
    expect(find.text('Nombor telefon berdaftar'), findsOneWidget);
    await tester.ensureVisible(find.text('Belum jadi ahli? Daftar'));
    await tester.tap(find.text('Belum jadi ahli? Daftar'));
    await tester.pumpAndSettle();
    expect(find.text('Daftar ahli baharu'), findsOneWidget);
    expect(find.byIcon(Icons.face_outlined), findsOneWidget);
  });

  testWidgets('home and account show the signed-in member data', (
    tester,
  ) async {
    final profile = <String, dynamic>{
      'name': 'Naziha Nazri',
      'memberId': '8329y4',
      'phone': '60123456789',
      'email': null,
      'deviceSync': 'SYNCED',
      'membership': <String, dynamic>{
        'plan': '1 Week',
        'status': 'ACTIVE',
        'validStart': '2026-09-17T00:00:00.000Z',
        'validEnd': '2026-09-24T00:00:00.000Z',
      },
      'requests': <Map<String, dynamic>>[],
    };
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView(
            children: [
              HomeView(
                profile: profile,
                onPass: () {},
                onAccount: () {},
                onRefresh: () {},
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('Hai, Naziha'), findsOneWidget);
    expect(find.text('Sah hingga 24 Sept 2026'), findsOneWidget);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView(children: [QrPassView(profile: profile)]),
        ),
      ),
    );
    expect(find.text('Belum sah untuk membuka pintu'), findsOneWidget);
    expect(find.byKey(const Key('demo-member-qr')), findsOneWidget);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ListView(
            children: [
              AccountView(
                api: MemberApi(),
                profile: profile,
                plans: const [],
                busy: false,
                submit: (action) async {},
                onLogout: () async {},
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('ID ahli / permohonan: 8329y4'), findsOneWidget);
  });

  testWidgets('four navigation items and attendance details render', (
    tester,
  ) async {
    var selected = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Column(
            children: [
              Expanded(
                child: ListView(
                  children: [
                    AttendanceChart(
                      days: [
                        {
                          'date': '2026-09-18',
                          'firstEntry': '2026-09-18T01:00:00.000Z',
                          'lastExit': '2026-09-18T03:00:00.000Z',
                          'durationMinutes': 120,
                          'status': 'complete',
                        },
                        {
                          'date': '2026-09-17',
                          'firstEntry': '2026-09-17T01:00:00.000Z',
                          'lastExit': null,
                          'durationMinutes': null,
                          'status': 'incomplete',
                        },
                      ],
                    ),
                  ],
                ),
              ),
              MemberNav(
                selected: selected,
                onChanged: (value) => selected = value,
              ),
            ],
          ),
        ),
      ),
    );
    expect(find.text('09:00 → 11:00'), findsNothing);
    expect(find.textContaining('09:00 → 11:00'), findsOneWidget);
    expect(find.textContaining('Belum lengkap'), findsOneWidget);
    expect(find.text('Membership'), findsOneWidget);
    expect(find.text('Pas QR'), findsOneWidget);
    expect(find.text('Tetapan'), findsOneWidget);
    await tester.tap(find.text('Tetapan'));
    expect(selected, 3);
  });

  testWidgets('saved English and dark preferences are restored', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({'language': 'en', 'dark': true});
    await tester.pumpWidget(const MemberApp());
    await tester.pumpAndSettle();
    expect(find.text('Welcome back'), findsOneWidget);
    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.themeMode, ThemeMode.dark);
  });

  testWidgets('QR keeps demo code while labels follow English', (tester) async {
    final profile = <String, dynamic>{
      'name': 'Naziha Nazri',
      'memberId': '8329y4',
      'membership': <String, dynamic>{
        'status': 'ACTIVE',
        'validEnd': '2026-09-24T00:00:00.000Z',
      },
    };
    await tester.pumpWidget(
      AppPreferences(
        language: 'en',
        dark: true,
        setLanguage: (_) {},
        setDark: (_) {},
        child: MaterialApp(
          themeMode: ThemeMode.dark,
          darkTheme: ThemeData.dark(),
          home: Scaffold(
            body: ListView(children: [QrPassView(profile: profile)]),
          ),
        ),
      ),
    );
    expect(find.text('My QR pass'), findsOneWidget);
    expect(find.text('Not valid for door access'), findsOneWidget);
    expect(find.byKey(const Key('demo-member-qr')), findsOneWidget);
  });
}
