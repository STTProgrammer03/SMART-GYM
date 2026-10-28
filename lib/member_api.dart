import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';

class MemberApiException implements Exception {
  const MemberApiException(this.message);

  final String message;

  @override
  String toString() => message;
}

class MemberApi {
  MemberApi({http.Client? client, FlutterSecureStorage? storage})
    : _client = client ?? http.Client(),
      _storage = storage ?? const FlutterSecureStorage();

  static String baseUrl = const String.fromEnvironment('ACS_API_BASE_URL');

  /// Website settings can be edited after deployment without rebuilding Dart.
  static Future<void> loadWebsiteConfig({
    http.Client? client,
    Uri? pageUri,
  }) async {
    if (baseUrl.isNotEmpty) return;

    final configClient = client ?? http.Client();

    try {
      final uri = (pageUri ?? Uri.base)
          .resolve('config.json')
          .replace(
            queryParameters: {
              'v': DateTime.now().millisecondsSinceEpoch.toString(),
            },
          );

      final response = await configClient
          .get(uri)
          .timeout(const Duration(seconds: 5));

      if (response.statusCode != 200) return;

      final config = jsonDecode(response.body);

      if (config is Map<String, dynamic> &&
          config['apiBaseUrl'] is String) {
        baseUrl = (config['apiBaseUrl'] as String).trim();
      }
    } catch (_) {
      // A missing or invalid settings file leaves the website in preview mode.
    } finally {
      if (client == null) configClient.close();
    }
  }

  static const _tokenKey = 'member_session';

  final http.Client _client;
  final FlutterSecureStorage _storage;

  Uri get _endpoint {
    if (baseUrl.isEmpty) {
      throw const MemberApiException(
        'Laman web belum disambungkan ke server.',
      );
    }

    final base = Uri.parse(baseUrl);

    if (base.scheme != 'https' &&
        base.host != '10.0.2.2' &&
        base.host != 'localhost') {
      throw const MemberApiException(
        'Server app mesti menggunakan HTTPS.',
      );
    }

    return base.resolve('/api/member-app');
  }

  Future<String?> get savedToken =>
      _storage.read(key: _tokenKey);

  Future<Map<String, dynamic>> _read(
    http.Response response,
  ) async {
    final body =
        jsonDecode(response.body) as Map<String, dynamic>;

    if (response.statusCode < 200 ||
        response.statusCode >= 300) {
      throw MemberApiException(
        body['error']?.toString() ??
            'Permintaan gagal.',
      );
    }

    return body;
  }

  Future<List<Map<String, dynamic>>> plans() async {
    final uri = _endpoint.replace(
      queryParameters: {'view': 'plans'},
    );

    final result = await _read(
      await _client.get(uri),
    );

    return (result['plans'] as List)
        .cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> me() async {
    final token = await savedToken;

    if (token == null) {
      throw const MemberApiException(
        'Sila masuk semula.',
      );
    }

    final uri = _endpoint.replace(
      queryParameters: {'view': 'me'},
    );

    return _read(
      await _client.get(
        uri,
        headers: {
          'Authorization': 'Bearer $token',
        },
      ),
    );
  }

  Future<List<Map<String, dynamic>>> attendance() async {
    final token = await savedToken;

    if (token == null) {
      throw const MemberApiException(
        'Sila masuk semula.',
      );
    }

    final uri = _endpoint.replace(
      queryParameters: {'view': 'attendance'},
    );

    final result = await _read(
      await _client.get(
        uri,
        headers: {
          'Authorization': 'Bearer $token',
        },
      ),
    );

    return (result['days'] as List)
        .cast<Map<String, dynamic>>();
  }

  Future<Map<String, dynamic>> settings() async {
    final token = await savedToken;

    if (token == null) {
      throw const MemberApiException(
        'Sila masuk semula.',
      );
    }

    return _read(
      await _client.get(
        _endpoint.replace(
          queryParameters: {'view': 'settings'},
        ),
        headers: {
          'Authorization': 'Bearer $token',
        },
      ),
    );
  }

  Future<Uint8List?> profilePhoto() async {
    final token = await savedToken;

    if (token == null) return null;

    final response = await _client.get(
      _endpoint.replace(
        queryParameters: {'view': 'photo'},
      ),
      headers: {
        'Authorization': 'Bearer $token',
      },
    );

    if (response.statusCode == 404) return null;

    if (response.statusCode != 200) {
      throw const MemberApiException(
        'Gambar profil gagal dimuatkan.',
      );
    }

    return response.bodyBytes;
  }

  Future<void> updateProfile({
    required String name,
    required String phone,
    required String email,
    required String birthDate,
    XFile? photo,
  }) async {
    await _post(
      {
        'action': 'update-profile',
        'name': name,
        'phone': phone,
        'email': email,
        'birthDate': birthDate,
      },
      photo: photo,
      authorized: true,
    );
  }

  Future<void> setPushEnabled(bool enabled) async {
    await _post(
      {
        'action': 'push-enabled',
        'enabled': enabled.toString(),
      },
      authorized: true,
    );
  }

  // ============================================================
  // OTP LOGIN
  // ============================================================

  Future<void> requestOtp({
    required String phone,
    required String workspace,
  }) async {
    await _post(
      {
        'action': 'request-otp',
        'purpose': 'login',
        'phone': phone,
      },
      workspace: workspace,
    );
  }

  Future<void> verifyOtp({
    required String phone,
    required String otp,
    required String workspace,
  }) async {
    await _post(
      {
        'action': 'verify-otp',
        'phone': phone,
        'otp': otp,
      },
      workspace: workspace,
    );
  }

  Future<void> loginByPhone({
    required String phone,
    required String workspace,
  }) async {
    final result = await _post(
      {
        'action': 'login',
        'phone': phone,
      },
      workspace: workspace,
    );

    await _storage.write(
      key: _tokenKey,
      value: result['token'] as String,
    );
  }

  // ============================================================
  // COMMON POST REQUEST
  // ============================================================

  Future<Map<String, dynamic>> _post(
    Map<String, String> fields, {
    XFile? receipt,
    XFile? photo,
    bool authorized = false,
    String? workspace,
  }) async {
    final request = http.MultipartRequest(
      'POST',
      _endpoint,
    )..fields.addAll(fields);

    if (authorized) {
      final token = await savedToken;

      if (token == null) {
        throw const MemberApiException(
          'Sila masuk semula.',
        );
      }

      request.headers['Authorization'] =
          'Bearer $token';
    }

    // Send selected gym/workspace to the backend.
    if (workspace != null && workspace.isNotEmpty) {
      request.headers['X-Workspace'] = workspace;
    }

    if (receipt != null) {
      request.files.add(
        http.MultipartFile.fromBytes(
          'receipt',
          await receipt.readAsBytes(),
          filename: receipt.name,
        ),
      );
    }

    if (photo != null) {
      request.files.add(
        http.MultipartFile.fromBytes(
          'photo',
          await photo.readAsBytes(),
          filename: photo.name,
        ),
      );
    }

    final response = await _client.send(request);

    return _read(
      await http.Response.fromStream(response),
    );
  }

  // ============================================================
  // OLD LOGIN
  // ============================================================

  Future<void> login(
    String id,
    String phone,
  ) async {
    final result = await _post(
      {
        'action': 'login',
        'memberId': id,
        'phone': phone,
      },
    );

    await _storage.write(
      key: _tokenKey,
      value: result['token'] as String,
    );
  }

  // ============================================================
  // REGISTRATION
  // ============================================================

  Future<String> register({
    required String name,
    required String phone,
    required String email,
    required String planId,
    required XFile receipt,
    required XFile photo,
  }) async {
    final result = await _post(
      {
        'action': 'register',
        'fullName': name,
        'phone': phone,
        'email': email,
        'planId': planId,
      },
      receipt: receipt,
      photo: photo,
    );

    await _storage.write(
      key: _tokenKey,
      value: result['token'] as String,
    );

    return result['id'] as String;
  }

  // ============================================================
  // RENEW MEMBERSHIP
  // ============================================================

  Future<void> renew({
    required String planId,
    required XFile receipt,
  }) async {
    await _post(
      {
        'action': 'renew',
        'planId': planId,
      },
      receipt: receipt,
      authorized: true,
    );
  }

  // ============================================================
  // PUSH NOTIFICATION
  // ============================================================

  Future<void> registerPushToken(
    String token,
    String platform,
  ) async {
    await _post(
      {
        'action': 'push-token',
        'token': token,
        'platform': platform,
      },
      authorized: true,
    );
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  Future<void> logout({
    String? pushToken,
  }) async {
    if (pushToken != null) {
      try {
        await _post(
          {
            'action': 'remove-push-token',
            'token': pushToken,
          },
          authorized: true,
        );
      } catch (_) {}
    }

    try {
      await _post(
        {'action': 'logout'},
        authorized: true,
      );
    } catch (_) {}

    await _storage.delete(
      key: _tokenKey,
    );
  }
}