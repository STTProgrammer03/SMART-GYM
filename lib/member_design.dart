import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'member_api.dart';
import 'app_preferences.dart';
import 'member_pages.dart';

const ink = Color(0xFF142E20);
const muted = Color(0xFF607C6B);
const brand = Color(0xFF168044);
const darkGreen = Color(0xFF102D1E);
const shell = Color(0xFFEDF5EF);
const softGreen = Color(0xFFE3F4E8);
const line = Color(0xFFD4E3D8);
Color mutedFor(BuildContext context) =>
    Theme.of(context).brightness == Brightness.dark
    ? const Color(0xFFB8D0BF)
    : muted;

String displayDate(Object? raw) {
  final value = DateTime.tryParse(raw?.toString() ?? '');
  return value == null
      ? '—'
      : DateFormat('d MMM yyyy', 'en_MY').format(value.toLocal());
}

String displayDateFor(BuildContext context, Object? raw) {
  final value = DateTime.tryParse(raw?.toString() ?? '');
  if (value == null) return '—';
  final locale = AppPreferences.maybeOf(context)?.language == 'ms'
      ? 'ms'
      : 'en_MY';
  return DateFormat('d MMM yyyy', locale).format(value.toLocal());
}

String syncLabel(Object? raw) => switch (raw) {
  'SYNCED' => 'Selesai',
  'PENDING' => 'Sedang dicuba',
  'UNASSIGNED' => 'Belum ditetapkan',
  _ => 'Tidak aktif',
};

String requestStatus(Object? raw) => switch (raw) {
  'PENDING' => 'Menunggu semakan',
  'PROCESSING' => 'Sedang diproses',
  'APPROVED' => 'Diluluskan',
  'REJECTED' => 'Ditolak',
  _ => raw?.toString() ?? '—',
};

String localizedRequestStatus(BuildContext context, Object? raw) =>
    switch (raw) {
      'PENDING' => tr(context, 'Menunggu semakan', 'Pending review'),
      'PROCESSING' => tr(context, 'Sedang diproses', 'Processing'),
      'APPROVED' => tr(context, 'Diluluskan', 'Approved'),
      'REJECTED' => tr(context, 'Ditolak', 'Rejected'),
      _ => raw?.toString() ?? '—',
    };

String localizedMembershipStatus(BuildContext context, Object? raw) =>
    switch (raw) {
      'ACTIVE' => tr(context, 'Aktif', 'Active'),
      'EXPIRING_SOON' => tr(context, 'Hampir tamat', 'Expiring soon'),
      'EXPIRED' => tr(context, 'Tamat', 'Expired'),
      'SUSPENDED' => tr(context, 'Digantung', 'Suspended'),
      _ => tr(context, 'Menunggu', 'Pending'),
    };

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 58});
  final double size;
  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: darkGreen,
      borderRadius: BorderRadius.circular(size * .32),
    ),
    child: Icon(
      Icons.lock_person_rounded,
      color: Colors.white,
      size: size * .48,
    ),
  );
}

class MemberAvatar extends StatelessWidget {
  const MemberAvatar({super.key, required this.name, required this.size});
  final Object? name;
  final double size;
  @override
  Widget build(BuildContext context) {
    final words = name
        .toString()
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2);
    final initials = words.map((part) => part[0].toUpperCase()).join();
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: darkGreen,
        shape: BoxShape.circle,
        border: Border.all(color: softGreen, width: 3),
      ),
      child: Text(
        initials,
        style: TextStyle(
          color: Colors.white,
          fontSize: size * .3,
          fontWeight: FontWeight.w800,
        ),
      ),
    );
  }
}

class SectionLabel extends StatelessWidget {
  const SectionLabel(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Text(
    text,
    style: TextStyle(
      color: mutedFor(context),
      fontSize: 11,
      fontWeight: FontWeight.w800,
      letterSpacing: 1.8,
    ),
  );
}

class StatusPill extends StatelessWidget {
  const StatusPill({super.key, required this.label, required this.active});
  final String label;
  final bool active;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: active ? softGreen : shell,
      borderRadius: BorderRadius.circular(30),
    ),
    child: Text(
      label,
      style: TextStyle(
        color: active ? brand : muted,
        fontSize: 11,
        fontWeight: FontWeight.w800,
      ),
    ),
  );
}

class MemberNav extends StatelessWidget {
  const MemberNav({super.key, required this.selected, required this.onChanged});
  final int selected;
  final ValueChanged<int> onChanged;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 6, 20, 14),
    child: Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: Theme.of(context).brightness == Brightness.dark
            ? const Color(0xFF193624)
            : Colors.white,
        border: Border.all(color: line),
        borderRadius: BorderRadius.circular(35),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14102D1E),
            blurRadius: 18,
            offset: Offset(0, 5),
          ),
        ],
      ),
      child: Row(
        children: [
          _NavItem(
            icon: Icons.home_rounded,
            label: tr(context, 'Home', 'Home'),
            active: selected == 0,
            onTap: () => onChanged(0),
          ),
          _NavItem(
            icon: Icons.card_membership_rounded,
            label: tr(context, 'Membership', 'Membership'),
            active: selected == 1,
            onTap: () => onChanged(1),
          ),
          _NavItem(
            icon: Icons.qr_code_rounded,
            label: tr(context, 'Pas QR', 'QR Pass'),
            active: selected == 2,
            onTap: () => onChanged(2),
          ),
          _NavItem(
            icon: Icons.settings_rounded,
            label: tr(context, 'Tetapan', 'Settings'),
            active: selected == 3,
            onTap: () => onChanged(3),
          ),
        ],
      ),
    ),
  );
}

class _NavItem extends StatelessWidget {
  const _NavItem({
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Expanded(
    child: Material(
      color: active ? brand : Colors.transparent,
      borderRadius: BorderRadius.circular(28),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(28),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                color: active ? Colors.white : mutedFor(context),
                size: 21,
              ),
              const SizedBox(height: 2),
              Text(
                label,
                style: TextStyle(
                  color: active ? Colors.white : mutedFor(context),
                  fontSize: 11,
                  fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    ),
  );
}

class HomeView extends StatelessWidget {
  const HomeView({
    super.key,
    required this.profile,
    required this.onPass,
    required this.onAccount,
    this.onMembership,
    required this.onRefresh,
    this.attendance = const [],
  });
  final Map<String, dynamic> profile;
  final VoidCallback onPass;
  final VoidCallback onAccount;
  final VoidCallback? onMembership;
  final VoidCallback onRefresh;
  final List<Map<String, dynamic>> attendance;
  @override
  Widget build(BuildContext context) {
    final membership = profile['membership'] as Map<String, dynamic>?;
    final requests = (profile['requests'] as List).cast<Map<String, dynamic>>();
    final end = DateTime.tryParse(membership?['validEnd']?.toString() ?? '');
    final start = DateTime.tryParse(
      membership?['validStart']?.toString() ?? '',
    );
    final days = end == null
        ? 0
        : math.max(
            0,
            DateUtils.dateOnly(end.toLocal())
                .difference(DateUtils.dateOnly(DateTime.now()))
                .inDays,
          );
    final total = start == null || end == null
        ? 1
        : math.max(1, end.difference(start).inDays);
    final active = membership?['status'] == 'ACTIVE';
    final firstName = profile['name']
        .toString()
        .trim()
        .split(RegExp(r'\s+'))
        .first;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            const BrandMark(size: 43),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const SectionLabel('MEMBER APP'),
                  Text(
                    tr(context, 'Keahlian Saya', 'My Membership'),
                    style: const TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: onRefresh,
              tooltip: tr(context, 'Muat semula', 'Refresh'),
              icon: const Icon(Icons.refresh_rounded),
            ),
            InkWell(
              onTap: onAccount,
              borderRadius: BorderRadius.circular(30),
              child: MemberAvatar(name: profile['name'], size: 42),
            ),
          ],
        ),
        const SizedBox(height: 37),
        SectionLabel(tr(context, 'SELAMAT DATANG', 'WELCOME')),
        const SizedBox(height: 7),
        Text(
          '${tr(context, 'Hai', 'Hi')}, $firstName',
          style: const TextStyle(
            fontSize: 34,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.2,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          membership == null
              ? tr(
                  context,
                  'Permohonan anda sedang menunggu semakan.',
                  'Your application is awaiting review.',
                )
              : active
              ? tr(
                  context,
                  'Keahlian anda aktif. Semak baki tempoh di bawah.',
                  'Your membership is active. Check its remaining term below.',
                )
              : tr(
                  context,
                  'Semak status keahlian anda di bawah.',
                  'Check your membership status below.',
                ),
          style: TextStyle(color: mutedFor(context), fontSize: 15, height: 1.4),
        ),
        const SizedBox(height: 31),
        SectionLabel(tr(context, 'KEAHLIAN ANDA', 'YOUR MEMBERSHIP')),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: Theme.of(context).brightness == Brightness.dark
                  ? [const Color(0xFF193624), const Color(0xFF244531)]
                  : [const Color(0xFFF5FAF6), softGreen],
            ),
            borderRadius: BorderRadius.circular(25),
            border: Border.all(color: line),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const SectionLabel('MEMBERSHIP'),
                  StatusPill(
                    label: localizedMembershipStatus(
                      context,
                      membership?['status'],
                    ),
                    active: active,
                  ),
                ],
              ),
              const SizedBox(height: 18),
              SizedBox(
                width: 178,
                height: 178,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    SizedBox.expand(
                      child: CircularProgressIndicator(
                        value: membership == null
                            ? 0
                            : (days / total).clamp(0.0, 1.0),
                        strokeWidth: 15,
                        backgroundColor: const Color(0xFFD0E6D6),
                        color: brand,
                        strokeCap: StrokeCap.round,
                      ),
                    ),
                    Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text(
                          membership == null ? '—' : '$days',
                          style: const TextStyle(
                            fontSize: 54,
                            fontWeight: FontWeight.w800,
                            height: 1,
                          ),
                        ),
                        Text(
                          membership == null
                              ? tr(context, 'BELUM AKTIF', 'NOT ACTIVE')
                              : tr(context, 'HARI LAGI', 'DAYS LEFT'),
                          style: TextStyle(
                            color: mutedFor(context),
                            fontSize: 11,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.3,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              Text(
                membership?['plan']?.toString() ??
                    tr(
                      context,
                      'Menunggu kelulusan admin',
                      'Awaiting admin approval',
                    ),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                membership == null
                    ? tr(
                        context,
                        'Akses pintu belum aktif',
                        'Door access not active',
                      )
                    : '${tr(context, 'Sah hingga', 'Valid until')} ${displayDateFor(context, membership['validEnd'])}',
                style: TextStyle(color: mutedFor(context), fontSize: 13),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        AttendanceChart(days: attendance),
        if (requests.isNotEmpty) ...[
          const SizedBox(height: 11),
          _InfoTile(
            icon: Icons.receipt_long_outlined,
            title: tr(context, 'Permohonan terkini', 'Latest request'),
            subtitle:
                '${requests.first['kind'] == 'REGISTER' ? tr(context, 'Pendaftaran', 'Registration') : tr(context, 'Renew', 'Renewal')} · ${localizedRequestStatus(context, requests.first['status'])}',
            onTap: onMembership ?? onAccount,
          ),
        ],
      ],
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: Theme.of(context).brightness == Brightness.dark
        ? const Color(0xFF193624)
        : Colors.white,
    borderRadius: BorderRadius.circular(18),
    child: InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        padding: const EdgeInsets.all(15),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: line),
        ),
        child: Row(
          children: [
            Icon(icon, color: brand),
            const SizedBox(width: 13),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                  Text(
                    subtitle,
                    style: TextStyle(color: mutedFor(context), fontSize: 12),
                  ),
                ],
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: muted),
          ],
        ),
      ),
    ),
  );
}

const demoQrPayload = 'DEMO-PASS-NOT-VALID-FOR-ACCESS';

class QrPassView extends StatelessWidget {
  const QrPassView({super.key, required this.profile});
  final Map<String, dynamic> profile;

  @override
  Widget build(BuildContext context) {
    final membership = profile['membership'] as Map<String, dynamic>?;
    final active = membership?['status'] == 'ACTIVE';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 13),
        SectionLabel(tr(context, 'PAS AHLI', 'MEMBER PASS')),
        const SizedBox(height: 8),
        Text(
          tr(context, 'Pas QR saya', 'My QR pass'),
          style: TextStyle(
            fontSize: 34,
            fontWeight: FontWeight.w800,
            letterSpacing: -1.1,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          tr(
            context,
            'Pratonton pas digital anda.',
            'Preview your digital pass.',
          ),
          style: TextStyle(color: mutedFor(context), fontSize: 15),
        ),
        const SizedBox(height: 28),
        Container(
          padding: const EdgeInsets.fromLTRB(22, 23, 22, 26),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: Theme.of(context).brightness == Brightness.dark
                  ? [const Color(0xFF193624), const Color(0xFF244531)]
                  : [const Color(0xFFF5FAF6), softGreen],
            ),
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: line),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const BrandMark(size: 43),
                  const StatusPill(label: 'DEMO', active: false),
                ],
              ),
              const SizedBox(height: 18),
              Text(
                profile['name']?.toString() ?? tr(context, 'Ahli', 'Member'),
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 23,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                '${tr(context, 'ID ahli / permohonan', 'Member / application ID')}: ${profile['memberId'] ?? '—'}',
                textAlign: TextAlign.center,
                style: TextStyle(color: mutedFor(context), fontSize: 13),
              ),
              const SizedBox(height: 24),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: const [
                    BoxShadow(
                      color: Color(0x12102D1E),
                      blurRadius: 22,
                      offset: Offset(0, 8),
                    ),
                  ],
                ),
                child: QrImageView(
                  key: const Key('demo-member-qr'),
                  data: demoQrPayload,
                  version: QrVersions.auto,
                  size: 238,
                  backgroundColor: Colors.white,
                  eyeStyle: const QrEyeStyle(color: darkGreen),
                  dataModuleStyle: const QrDataModuleStyle(color: darkGreen),
                ),
              ),
              const SizedBox(height: 24),
              Text(
                tr(context, 'KOD PRATONTON', 'PREVIEW CODE'),
                style: TextStyle(
                  color: brand,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.8,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                tr(
                  context,
                  'Belum sah untuk membuka pintu',
                  'Not valid for door access',
                ),
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
        const SizedBox(height: 17),
        Container(
          padding: const EdgeInsets.all(17),
          decoration: BoxDecoration(
            color: Theme.of(context).brightness == Brightness.dark
                ? const Color(0xFF193624)
                : Colors.white,
            border: Border.all(color: line),
            borderRadius: BorderRadius.circular(18),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.info_outline_rounded, color: brand),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  tr(
                    context,
                    'Kod ini menggunakan data demo yang sama untuk semua ahli. Akses pintu sebenar masih mengikut keahlian dan sistem access control.',
                    'This code uses the same demo data for every member. Actual door access still follows your membership and the access control system.',
                  ),
                  style: TextStyle(
                    color: mutedFor(context),
                    fontSize: 13,
                    height: 1.4,
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 15),
        Row(
          children: [
            Expanded(
              child: Text(
                tr(context, 'Status keahlian', 'Membership status'),
                style: TextStyle(color: mutedFor(context)),
              ),
            ),
            Text(
              localizedMembershipStatus(context, membership?['status']),
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
          ],
        ),
        const SizedBox(height: 7),
        if (active)
          Row(
            children: [
              Expanded(
                child: Text(
                  tr(context, 'Sah hingga', 'Valid until'),
                  style: TextStyle(color: mutedFor(context)),
                ),
              ),
              Text(
                displayDateFor(context, membership?['validEnd']),
                style: const TextStyle(fontWeight: FontWeight.w700),
              ),
            ],
          ),
      ],
    );
  }
}

class AccountView extends StatefulWidget {
  const AccountView({
    super.key,
    required this.api,
    required this.profile,
    required this.plans,
    required this.busy,
    required this.submit,
    required this.onLogout,
  });
  final MemberApi api;
  final Map<String, dynamic> profile;
  final List<Map<String, dynamic>> plans;
  final bool busy;
  final Future<void> Function(Future<void> Function()) submit;
  final Future<void> Function() onLogout;
  @override
  State<AccountView> createState() => _AccountViewState();
}

class _AccountViewState extends State<AccountView> {
  String? section, planId;
  XFile? receipt;
  final picker = ImagePicker();
  void _toggle(String value) =>
      setState(() => section = section == value ? null : value);

  @override
  Widget build(BuildContext context) {
    final member = widget.profile;
    final membership = member['membership'] as Map<String, dynamic>?;
    final requests = (member['requests'] as List).cast<Map<String, dynamic>>();
    final hasPending = requests.any(
      (r) =>
          r['kind'] == 'RENEW' &&
          (r['status'] == 'PENDING' || r['status'] == 'PROCESSING'),
    );
    final active = membership?['status'] == 'ACTIVE';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 16),
        Center(child: MemberAvatar(name: member['name'], size: 88)),
        const SizedBox(height: 18),
        Text(
          member['name'].toString(),
          textAlign: TextAlign.center,
          style: const TextStyle(
            fontSize: 27,
            fontWeight: FontWeight.w800,
            letterSpacing: -.6,
          ),
        ),
        const SizedBox(height: 5),
        Text(
          (member['email']?.toString().isNotEmpty ?? false)
              ? member['email'].toString()
              : member['phone'].toString(),
          textAlign: TextAlign.center,
          style: const TextStyle(color: muted, fontSize: 14),
        ),
        const SizedBox(height: 6),
        Text(
          'ID ahli / permohonan: ${member['memberId']}',
          textAlign: TextAlign.center,
          style: const TextStyle(color: muted, fontSize: 13),
        ),
        const SizedBox(height: 44),
        const SectionLabel('KEAHLIAN'),
        const SizedBox(height: 12),
        _MenuGroup(
          children: [
            _MenuRow(
              icon: Icons.storefront_outlined,
              title: 'Keahlian saya',
              subtitle: membership?['plan']?.toString() ?? 'Menunggu kelulusan',
              trailing: StatusPill(
                label: membership?['status']?.toString() ?? 'Menunggu',
                active: active,
              ),
              onTap: () => _toggle('membership'),
            ),
            _MenuRow(
              icon: Icons.receipt_long_outlined,
              title: 'Permohonan saya',
              subtitle: '${requests.length} permohonan',
              onTap: () => _toggle('requests'),
            ),
            if (membership != null)
              _MenuRow(
                icon: Icons.autorenew_rounded,
                title: 'Renew keahlian',
                subtitle: hasPending
                    ? 'Sedang disemak'
                    : 'Pilih pelan dan hantar resit',
                onTap: () => _toggle('renew'),
              ),
            _MenuRow(
              icon: Icons.sensor_door_outlined,
              title: 'Akses peranti',
              subtitle: syncLabel(member['deviceSync']),
              onTap: () => _toggle('device'),
            ),
          ],
        ),
        if (section != null && section != 'notifications') ...[
          const SizedBox(height: 13),
          _DetailPanel(
            child: switch (section) {
              'membership' => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Butiran keahlian',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 12),
                  if (membership == null)
                    const Text(
                      'Pendaftaran sedang menunggu kelulusan admin. Akses pintu belum aktif.',
                    )
                  else ...[
                    _DetailLine('Pelan', membership['plan'].toString()),
                    _DetailLine('Status', membership['status'].toString()),
                    _DetailLine(
                      'Tarikh mula',
                      displayDate(membership['validStart']),
                    ),
                    _DetailLine(
                      'Sah hingga',
                      displayDate(membership['validEnd']),
                    ),
                  ],
                ],
              ),
              'requests' => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Permohonan saya',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 10),
                  if (requests.isEmpty) const Text('Tiada permohonan.'),
                  for (final request in requests)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${request['kind'] == 'REGISTER' ? 'Pendaftaran' : 'Renew'} · ${request['plan']}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                          Text(
                            '${displayDate(request['createdAt'])} · ${requestStatus(request['status'])}',
                            style: const TextStyle(color: muted),
                          ),
                          if (request['reason'] != null)
                            Text(request['reason'].toString()),
                        ],
                      ),
                    ),
                  if (membership == null &&
                      requests.any((r) => r['status'] == 'REJECTED'))
                    TextButton(
                      onPressed: widget.busy ? null : widget.onLogout,
                      child: const Text(
                        'Keluar untuk hantar pendaftaran baharu',
                      ),
                    ),
                ],
              ),
              'renew' => Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text(
                    'Mohon renew',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'Tempoh baharu bermula selepas admin meluluskan bayaran.',
                    style: TextStyle(color: muted),
                  ),
                  const SizedBox(height: 16),
                  PlanPicker(
                    plans: widget.plans,
                    value: planId,
                    onChanged: (value) => setState(() => planId = value),
                  ),
                  const SizedBox(height: 11),
                  OutlinedButton.icon(
                    onPressed: widget.busy || hasPending
                        ? null
                        : () async {
                            final chosen = await picker.pickImage(
                              source: ImageSource.gallery,
                              imageQuality: 85,
                            );
                            if (chosen != null) {
                              setState(() => receipt = chosen);
                            }
                          },
                    icon: const Icon(Icons.receipt_long_outlined),
                    label: Text(receipt?.name ?? 'Pilih gambar resit'),
                  ),
                  const SizedBox(height: 11),
                  FilledButton(
                    onPressed:
                        widget.busy ||
                            hasPending ||
                            planId == null ||
                            receipt == null
                        ? null
                        : () => widget.submit(
                            () => widget.api.renew(
                              planId: planId!,
                              receipt: receipt!,
                            ),
                          ),
                    child: Text(
                      hasPending
                          ? 'Renew sedang disemak'
                          : 'Hantar permohonan renew',
                    ),
                  ),
                ],
              ),
              'device' => Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Status akses peranti',
                    style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                  ),
                  const SizedBox(height: 8),
                  Text(syncLabel(member['deviceSync'])),
                ],
              ),
              _ => const SizedBox.shrink(),
            },
          ),
        ],
        const SizedBox(height: 30),
        const SectionLabel('PREFERENSI'),
        const SizedBox(height: 12),
        _MenuGroup(
          children: [
            _MenuRow(
              icon: Icons.notifications_none_rounded,
              title: 'Peringatan',
              subtitle: 'WhatsApp dan push',
              onTap: () => _toggle('notifications'),
            ),
          ],
        ),
        if (section == 'notifications') ...[
          const SizedBox(height: 13),
          const _DetailPanel(
            child: Text(
              'Peringatan keahlian dihantar 7, 3 dan 1 hari sebelum tamat melalui WhatsApp dan push jika dibenarkan.',
            ),
          ),
        ],
        const SizedBox(height: 24),
        OutlinedButton.icon(
          onPressed: widget.busy ? null : widget.onLogout,
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Keluar akaun'),
        ),
      ],
    );
  }
}

class _MenuGroup extends StatelessWidget {
  const _MenuGroup({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Container(
    clipBehavior: Clip.antiAlias,
    decoration: BoxDecoration(
      color: Colors.white,
      border: Border.all(color: line),
      borderRadius: BorderRadius.circular(22),
      boxShadow: const [
        BoxShadow(
          color: Color(0x0D102D1E),
          blurRadius: 18,
          offset: Offset(0, 7),
        ),
      ],
    ),
    child: Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const Divider(height: 1, indent: 66, color: line),
          children[i],
        ],
      ],
    ),
  );
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.trailing,
  });
  final IconData icon;
  final String title, subtitle;
  final VoidCallback onTap;
  final Widget? trailing;
  @override
  Widget build(BuildContext context) => InkWell(
    onTap: onTap,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 17, vertical: 14),
      child: Row(
        children: [
          Container(
            width: 37,
            height: 37,
            decoration: BoxDecoration(
              color: shell,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Icon(icon, size: 20, color: darkGreen),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: muted, fontSize: 12),
                ),
              ],
            ),
          ),
          trailing ?? const Icon(Icons.chevron_right_rounded, color: muted),
        ],
      ),
    ),
  );
}

class _DetailPanel extends StatelessWidget {
  const _DetailPanel({required this.child});
  final Widget child;
  @override
  Widget build(BuildContext context) => Container(
    width: double.infinity,
    padding: const EdgeInsets.all(18),
    decoration: BoxDecoration(
      color: shell,
      borderRadius: BorderRadius.circular(18),
      border: Border.all(color: line),
    ),
    child: child,
  );
}

class _DetailLine extends StatelessWidget {
  const _DetailLine(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Row(
      children: [
        Expanded(
          child: Text(label, style: const TextStyle(color: muted)),
        ),
        Flexible(
          child: Text(
            value,
            textAlign: TextAlign.end,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ],
    ),
  );
}

class PlanPicker extends StatelessWidget {
  const PlanPicker({
    super.key,
    required this.plans,
    required this.value,
    required this.onChanged,
  });
  final List<Map<String, dynamic>> plans;
  final String? value;
  final ValueChanged<String?> onChanged;
  @override
  Widget build(BuildContext context) => DropdownButtonFormField<String>(
    initialValue: value,
    decoration: const InputDecoration(labelText: 'Pelan keahlian'),
    items: plans
        .map(
          (plan) => DropdownMenuItem<String>(
            value: plan['id'] as String,
            child: Text(
              '${plan['name']} · RM ${((plan['priceCents'] as num) / 100).toStringAsFixed(2)}',
            ),
          ),
        )
        .toList(),
    onChanged: onChanged,
  );
}
