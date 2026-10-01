import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:reminder_app/member_api.dart';

void main() {
  setUp(() => MemberApi.baseUrl = '');
  tearDown(() => MemberApi.baseUrl = '');

  test('loads settings beside the website in a subfolder', () async {
    await MemberApi.loadWebsiteConfig(
      pageUri: Uri.parse('https://members.example.com/members/'),
      client: MockClient((request) async {
        expect(request.url.path, '/members/config.json');
        return http.Response('{"apiBaseUrl":" https://api.example.com "}', 200);
      }),
    );
    expect(MemberApi.baseUrl, 'https://api.example.com');
  });

  test('missing or malformed settings allow an unconnected preview', () async {
    for (final response in [
      http.Response('Not found', 404),
      http.Response('<html>Fallback page</html>', 200),
      http.Response('{"apiBaseUrl":42}', 200),
      http.Response('{"apiBaseUrl":""}', 200),
    ]) {
      await MemberApi.loadWebsiteConfig(
        pageUri: Uri.parse('https://members.example.com/'),
        client: MockClient((_) async => response),
      );
      expect(MemberApi.baseUrl, isEmpty);
    }
  });

  test('explicit backend configuration takes priority', () async {
    MemberApi.baseUrl = 'https://configured.example.com';
    await MemberApi.loadWebsiteConfig(
      client: MockClient((_) async => throw StateError('Should not fetch')),
    );
    expect(MemberApi.baseUrl, 'https://configured.example.com');
  });
}
