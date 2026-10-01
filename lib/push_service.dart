import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'member_api.dart';

class PushService {
  static bool _ready = false;
  static String status = 'unconfigured';
  static StreamSubscription<String>? _tokenRefresh;
  static StreamSubscription<RemoteMessage>? _foreground;

  static Future<void> initialize() async {
    if (kIsWeb) {
      status = 'unsupported';
      return;
    }
    const projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
    const appId = String.fromEnvironment('FIREBASE_APP_ID');
    const apiKey = String.fromEnvironment('FIREBASE_API_KEY');
    const senderId = String.fromEnvironment('FIREBASE_SENDER_ID');
    if (projectId.isEmpty ||
        appId.isEmpty ||
        apiKey.isEmpty ||
        senderId.isEmpty) {
      return;
    }
    try {
      await Firebase.initializeApp(
        options: const FirebaseOptions(
          apiKey: apiKey,
          appId: appId,
          messagingSenderId: senderId,
          projectId: projectId,
        ),
      );
      _ready = true;
      status = 'available';
    } catch (error) {
      debugPrint('Firebase setup failed: $error');
    }
  }

  static Future<String?> register(
    MemberApi api, {
    void Function(String)? onForeground,
  }) async {
    if (kIsWeb) {
      status = 'unsupported';
      return null;
    }
    if (!_ready) {
      status = 'unconfigured';
      return null;
    }
    if (defaultTargetPlatform != TargetPlatform.android &&
        defaultTargetPlatform != TargetPlatform.iOS) {
      status = 'unsupported';
      return null;
    }
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission();
      if (settings.authorizationStatus == AuthorizationStatus.denied) {
        status = 'denied';
        return null;
      }
      final token = await messaging.getToken();
      if (token != null) {
        await api.registerPushToken(
          token,
          defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
        );
        status = 'ready';
      }
      await _tokenRefresh?.cancel();
      _tokenRefresh = messaging.onTokenRefresh.listen((newToken) {
        api
            .registerPushToken(
              newToken,
              defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android',
            )
            .catchError((Object error) {
              debugPrint('Push token refresh failed: $error');
            });
      });
      await _foreground?.cancel();
      _foreground = FirebaseMessaging.onMessage.listen((message) {
        onForeground?.call(
          message.notification?.body ?? 'Anda ada reminder keahlian baharu.',
        );
      });
      return token;
    } catch (error) {
      debugPrint('Push registration failed: $error');
      return null;
    }
  }

  static Future<void> stop() async {
    await _tokenRefresh?.cancel();
    await _foreground?.cancel();
    _tokenRefresh = null;
    _foreground = null;
  }
}
