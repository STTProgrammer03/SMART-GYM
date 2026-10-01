import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AppPreferences extends InheritedWidget {
  const AppPreferences({
    super.key,
    required this.language,
    required this.dark,
    required this.setLanguage,
    required this.setDark,
    required super.child,
  });
  final String language;
  final bool dark;
  final ValueChanged<String> setLanguage;
  final ValueChanged<bool> setDark;

  static AppPreferences? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AppPreferences>();
  static AppPreferences of(BuildContext context) => maybeOf(context)!;
  @override
  bool updateShouldNotify(AppPreferences oldWidget) =>
      language != oldWidget.language || dark != oldWidget.dark;
}

String tr(BuildContext context, String ms, String en) =>
    AppPreferences.maybeOf(context)?.language == 'en' ? en : ms;

String translatedError(BuildContext context, String message) {
  if (AppPreferences.maybeOf(context)?.language != 'en') return message;
  final clean = message.replaceFirst('MemberApiException: ', '');
  const errors = <String, String>{
    'Sila masuk semula.': 'Please sign in again.',
    'ID atau nombor telefon tidak sepadan.':
        'Member ID or phone number does not match.',
    'Terlalu banyak cubaan. Cuba lagi dalam 15 minit.':
        'Too many attempts. Try again in 15 minutes.',
    'Isi nama dan nombor telefon yang sah.':
        'Enter a valid name and phone number.',
    'Alamat e-mel tidak sah.': 'Invalid email address.',
    'Tarikh lahir tidak sah.': 'Invalid birth date.',
    'Nombor telefon telah digunakan.': 'Phone number is already in use.',
    'Permohonan renew anda masih menunggu semakan.':
        'Your renewal request is still under review.',
    'Profil boleh diedit selepas kelulusan admin.':
        'You can edit your profile after admin approval.',
    'Pilih pelan yang aktif.': 'Choose an active plan.',
    'Resit diperlukan.': 'A receipt is required.',
  };
  return errors[clean] ?? clean;
}

Future<SharedPreferences> preferences() => SharedPreferences.getInstance();
