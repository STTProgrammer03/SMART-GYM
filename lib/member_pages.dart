import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import 'app_preferences.dart';
import 'member_api.dart';
import 'member_design.dart';
import 'push_service.dart';

class AttendanceChart extends StatelessWidget {
  const AttendanceChart({super.key, required this.days});
  final List<Map<String, dynamic>> days;
  String _clock(Object? value) {
    final parsed = DateTime.tryParse(value?.toString() ?? '');
    return parsed == null
        ? '—'
        : DateFormat('HH:mm')
              .format(parsed.toUtc().add(const Duration(hours: 8)));
  }

  @override
  Widget build(BuildContext context) {
    final maxMinutes = days.fold<int>(60, (value, day) {
      final minutes = (day['durationMinutes'] as num?)?.toInt() ?? 0;
      return minutes > value ? minutes : value;
    });
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          tr(
            context,
            'Masa di gym · 7 hari terakhir',
            'Time at gym · last 7 days',
          ),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 5),
        Text(
          tr(
            context,
            'Masuk pertama hingga keluar terakhir setiap hari',
            'First entry to last exit each day',
          ),
          style: TextStyle(color: mutedFor(context), fontSize: 12),
        ),
        if (days.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(
              tr(
                context,
                'Rekod akses tersedia selepas pendaftaran diluluskan.',
                'Access history is available after registration approval.',
              ),
            ),
          ),
        const SizedBox(height: 18),
        SizedBox(
          height: 164,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final day in days)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Text(
                          day['status'] == 'complete'
                              ? '${((day['durationMinutes'] as num) / 60).toStringAsFixed(1)}h'
                              : day['status'] == 'incomplete'
                              ? '•'
                              : '0',
                          style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Container(
                          height: day['status'] == 'complete'
                              ? 10 +
                                    ((day['durationMinutes'] as num)
                                            .toDouble() /
                                        maxMinutes *
                                        105)
                              : 10,
                          decoration: BoxDecoration(
                            color: day['status'] == 'complete'
                                ? brand
                                : day['status'] == 'incomplete'
                                ? Colors.orange
                                : line,
                            borderRadius: BorderRadius.circular(8),
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          DateFormat(
                            'E',
                            AppPreferences.maybeOf(context)?.language == 'en'
                                ? 'en'
                                : 'ms',
                          ).format(DateTime.parse(day['date'].toString())),
                          style: const TextStyle(fontSize: 10),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        for (final day in days)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Text(
              '${day['date']}  ${_clock(day['firstEntry'])} → ${_clock(day['lastExit'])}  ·  ${day['status'] == 'complete'
                  ? '${((day['durationMinutes'] as num) / 60).toStringAsFixed(1)} ${tr(context, 'jam', 'hours')}'
                  : day['status'] == 'incomplete'
                  ? tr(context, 'Belum lengkap', 'Incomplete')
                  : tr(context, 'Tiada akses', 'No access')}',
              style: TextStyle(color: mutedFor(context), fontSize: 12),
            ),
          ),
      ],
    );
  }
}

class MembershipView extends StatelessWidget {
  const MembershipView({
    super.key,
    required this.profile,
    required this.plans,
    required this.settings,
    required this.api,
    required this.busy,
    required this.submit,
  });
  final Map<String, dynamic> profile, settings;
  final List<Map<String, dynamic>> plans;
  final MemberApi api;
  final bool busy;
  final Future<void> Function(Future<void> Function()) submit;
  String _status(BuildContext context, Object? raw) => switch (raw) {
    'PENDING' => tr(context, 'Menunggu semakan', 'Pending review'),
    'PROCESSING' => tr(context, 'Sedang diproses', 'Processing'),
    'APPROVED' => tr(context, 'Diluluskan', 'Approved'),
    'REJECTED' => tr(context, 'Ditolak', 'Rejected'),
    _ => raw?.toString() ?? '—',
  };
  @override
  Widget build(BuildContext context) {
    final membership = profile['membership'] as Map<String, dynamic>?;
    final requests = (profile['requests'] as List).cast<Map<String, dynamic>>();
    final pending = requests.any(
      (r) =>
          r['kind'] == 'RENEW' &&
          (r['status'] == 'PENDING' || r['status'] == 'PROCESSING'),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          tr(context, 'Keahlian saya', 'My membership'),
          style: const TextStyle(fontSize: 32, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  membership?['plan']?.toString() ??
                      tr(
                        context,
                        'Menunggu kelulusan admin',
                        'Awaiting admin approval',
                      ),
                  style: const TextStyle(
                    fontSize: 23,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 10),
                Text(
                  '${tr(context, 'Status', 'Status')}: ${localizedMembershipStatus(context, membership?['status'])}',
                ),
                Text(
                  '${tr(context, 'Tarikh mula', 'Start date')}: ${displayDateFor(context, membership?['validStart'])}',
                ),
                Text(
                  '${tr(context, 'Tarikh tamat', 'Expiry date')}: ${displayDateFor(context, membership?['validEnd'])}',
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        if (membership != null)
          FilledButton.icon(
            onPressed: busy || pending
                ? null
                : () => Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => RenewPage(
                        api: api,
                        plans: plans,
                        settings: settings,
                        submit: submit,
                      ),
                    ),
                  ),
            icon: const Icon(Icons.autorenew),
            label: Text(
              pending
                  ? tr(context, 'Renew sedang disemak', 'Renewal under review')
                  : tr(context, 'Renew keahlian', 'Renew membership'),
            ),
          ),
        const SizedBox(height: 26),
        Text(
          tr(context, 'Permohonan saya', 'My requests'),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        if (requests.isEmpty)
          Text(tr(context, 'Tiada permohonan.', 'No requests.')),
        for (final request in requests)
          Card(
            child: ListTile(
              title: Text(
                '${request['kind'] == 'REGISTER' ? tr(context, 'Pendaftaran', 'Registration') : tr(context, 'Renew', 'Renewal')} · ${request['plan']}',
              ),
              subtitle: Text(
                '${displayDateFor(context, request['createdAt'])} · ${_status(context, request['status'])}${request['reason'] == null ? '' : '\n${request['reason']}'}',
              ),
            ),
          ),
      ],
    );
  }
}

class RenewPage extends StatefulWidget {
  const RenewPage({
    super.key,
    required this.api,
    required this.plans,
    required this.settings,
    required this.submit,
  });
  final MemberApi api;
  final List<Map<String, dynamic>> plans;
  final Map<String, dynamic> settings;
  final Future<void> Function(Future<void> Function()) submit;
  @override
  State<RenewPage> createState() => _RenewPageState();
}

class _RenewPageState extends State<RenewPage> {
  String? planId;
  XFile? receipt;
  bool sending = false;
  String _duration(BuildContext context, Map<String, dynamic> plan) {
    final unit = switch (plan['durationUnit']) {
      'MINUTES' => tr(context, 'minit', 'minutes'),
      'MONTHS' => tr(context, 'bulan', 'months'),
      _ => tr(context, 'hari', 'days'),
    };
    return '${plan['durationValue']} $unit';
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(tr(context, 'Katalog keahlian', 'Membership catalog')),
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
        for (final plan in widget.plans)
          Card(
            child: ListTile(
              onTap: () => setState(() => planId = plan['id'].toString()),
              leading: Icon(
                planId == plan['id'].toString()
                    ? Icons.radio_button_checked
                    : Icons.radio_button_unchecked,
              ),
              title: Text(plan['name'].toString()),
              subtitle: Text(
                'RM ${((plan['priceCents'] as num) / 100).toStringAsFixed(2)} · ${_duration(context, plan)}',
              ),
            ),
          ),
        const SizedBox(height: 18),
        Text(
          tr(context, 'Arahan bayaran', 'Payment instructions'),
          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        Text(
          (widget.settings['paymentInstructions']?.toString().isNotEmpty ??
                  false)
              ? widget.settings['paymentInstructions'].toString()
              : tr(context, 'Belum dikonfigurasi', 'Not configured'),
        ),
        const SizedBox(height: 15),
        OutlinedButton.icon(
          onPressed: sending
              ? null
              : () async {
                  final chosen = await ImagePicker().pickImage(
                    source: ImageSource.gallery,
                    imageQuality: 85,
                  );
                  if (chosen != null) setState(() => receipt = chosen);
                },
          icon: const Icon(Icons.receipt_long),
          label: Text(
            receipt?.name ?? tr(context, 'Muat naik resit', 'Upload receipt'),
          ),
        ),
        const SizedBox(height: 12),
        FilledButton(
          onPressed: sending || planId == null || receipt == null
              ? null
              : () async {
                  setState(() => sending = true);
                  try {
                    await widget.api.renew(planId: planId!, receipt: receipt!);
                    await widget.submit(() async {});
                    if (context.mounted) Navigator.pop(context);
                  } catch (error) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            translatedError(context, error.toString()),
                          ),
                        ),
                      );
                    }
                  } finally {
                    if (mounted) setState(() => sending = false);
                  }
                },
          child: Text(
            tr(
              context,
              'Hantar untuk semakan admin',
              'Submit for admin review',
            ),
          ),
        ),
      ],
    ),
  );
}

class SettingsView extends StatefulWidget {
  const SettingsView({
    super.key,
    required this.api,
    required this.profile,
    required this.settings,
    required this.submit,
    required this.onLogout,
  });
  final MemberApi api;
  final Map<String, dynamic> profile, settings;
  final Future<void> Function(Future<void> Function()) submit;
  final Future<void> Function() onLogout;
  @override
  State<SettingsView> createState() => _SettingsViewState();
}

class _SettingsViewState extends State<SettingsView> {
  Uint8List? photo;
  @override
  void initState() {
    super.initState();
    _loadPhoto();
  }

  Future<void> _loadPhoto() async {
    try {
      final bytes = await widget.api.profilePhoto();
      if (mounted) setState(() => photo = bytes);
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final prefs = AppPreferences.maybeOf(context);
    final member = widget.profile;
    final approved = member['approved'] == true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Center(
          child: CircleAvatar(
            radius: 48,
            backgroundColor: darkGreen,
            backgroundImage: photo == null ? null : MemoryImage(photo!),
            child: photo == null
                ? MemberAvatar(name: member['name'], size: 90)
                : null,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          member['name'].toString(),
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w800),
        ),
        Text(
          '${tr(context, 'ID ahli / permohonan', 'Member / application ID')}: ${member['memberId']}',
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 26),
        ListTile(
          leading: const Icon(Icons.manage_accounts),
          title: Text(tr(context, 'Pengurusan akaun', 'Account management')),
          subtitle: Text(
            approved
                ? tr(context, 'Edit maklumat profil', 'Edit profile details')
                : tr(
                    context,
                    'Boleh edit selepas kelulusan admin',
                    'Editable after admin approval',
                  ),
          ),
          onTap: approved
              ? () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute<void>(
                      builder: (_) => EditProfilePage(
                        api: widget.api,
                        profile: member,
                        submit: widget.submit,
                      ),
                    ),
                  );
                  _loadPhoto();
                }
              : null,
        ),
        if (!kIsWeb)
          SwitchListTile(
            title: Text(tr(context, 'Notifikasi push', 'Push notifications')),
            subtitle: Text(switch (PushService.status) {
              'unconfigured' => tr(
                context,
                'Push belum dikonfigurasi',
                'Push is not configured',
              ),
              'denied' => tr(
                context,
                'Kebenaran notifikasi ditolak pada peranti',
                'Notification permission denied on device',
              ),
              'unsupported' => tr(
                context,
                'Push tidak tersedia pada peranti ini',
                'Push is unavailable on this device',
              ),
              _ => tr(
                context,
                'Reminder keahlian dalam app',
                'Membership reminders in the app',
              ),
            }),
            value: member['pushEnabled'] != false,
            onChanged: approved
                ? (value) =>
                      widget.submit(() => widget.api.setPushEnabled(value))
                : null,
          ),
        SwitchListTile(
          title: Text(tr(context, 'Mod gelap', 'Dark mode')),
          value: prefs?.dark ?? false,
          onChanged: prefs?.setDark,
        ),
        ListTile(
          leading: const Icon(Icons.language),
          title: Text(tr(context, 'Bahasa', 'Language')),
          trailing: DropdownButton<String>(
            value: prefs?.language ?? 'ms',
            items: const [
              DropdownMenuItem(value: 'ms', child: Text('Bahasa Melayu')),
              DropdownMenuItem(value: 'en', child: Text('English')),
            ],
            onChanged: (value) {
              if (value != null) prefs?.setLanguage(value);
            },
          ),
        ),
        ExpansionTile(
          leading: const Icon(Icons.support_agent),
          title: Text(tr(context, 'Hubungi kami', 'Contact us')),
          children: [
            if ([
              widget.settings['contactPhone'],
              widget.settings['contactEmail'],
            ].every((value) => value == null || value.toString().isEmpty))
              ListTile(
                title: Text(
                  tr(context, 'Belum dikonfigurasi', 'Not configured'),
                ),
              ),
            if (widget.settings['contactPhone']?.toString().isNotEmpty == true)
              ListTile(
                title: Text(widget.settings['contactPhone'].toString()),
                subtitle: Text(
                  tr(context, 'Telefon / WhatsApp', 'Phone / WhatsApp'),
                ),
                trailing: const Icon(Icons.copy),
                onTap: () => Clipboard.setData(
                  ClipboardData(
                    text: widget.settings['contactPhone'].toString(),
                  ),
                ),
              ),
            if (widget.settings['contactEmail']?.toString().isNotEmpty == true)
              ListTile(
                title: Text(widget.settings['contactEmail'].toString()),
                subtitle: Text(tr(context, 'E-mel', 'Email')),
                trailing: const Icon(Icons.copy),
                onTap: () => Clipboard.setData(
                  ClipboardData(
                    text: widget.settings['contactEmail'].toString(),
                  ),
                ),
              ),
            if (widget.settings['contactHours']?.toString().isNotEmpty == true)
              ListTile(
                title: Text(widget.settings['contactHours'].toString()),
                subtitle: Text(tr(context, 'Waktu operasi', 'Opening hours')),
              ),
          ],
        ),
        const SizedBox(height: 20),
        OutlinedButton.icon(
          onPressed: widget.onLogout,
          icon: const Icon(Icons.logout),
          label: Text(tr(context, 'Keluar akaun', 'Log out')),
        ),
      ],
    );
  }
}

class EditProfilePage extends StatefulWidget {
  const EditProfilePage({
    super.key,
    required this.api,
    required this.profile,
    required this.submit,
  });
  final MemberApi api;
  final Map<String, dynamic> profile;
  final Future<void> Function(Future<void> Function()) submit;
  @override
  State<EditProfilePage> createState() => _EditProfilePageState();
}

class _EditProfilePageState extends State<EditProfilePage> {
  late final name = TextEditingController(
    text: widget.profile['name']?.toString() ?? '',
  );
  late final phone = TextEditingController(
    text: widget.profile['phone']?.toString() ?? '',
  );
  late final email = TextEditingController(
    text: widget.profile['email']?.toString() ?? '',
  );
  late final birthday = TextEditingController(
    text: widget.profile['birthDate']?.toString() ?? '',
  );
  XFile? photo;
  bool saving = false;
  @override
  void dispose() {
    name.dispose();
    phone.dispose();
    email.dispose();
    birthday.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: Text(tr(context, 'Pengurusan akaun', 'Account management')),
    ),
    body: ListView(
      padding: const EdgeInsets.all(24),
      children: [
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
            labelText: tr(context, 'Nombor telefon', 'Phone number'),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: email,
          keyboardType: TextInputType.emailAddress,
          decoration: InputDecoration(labelText: tr(context, 'E-mel', 'Email')),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: birthday,
          readOnly: true,
          decoration: InputDecoration(
            labelText: tr(context, 'Tarikh lahir', 'Birthday'),
            suffixIcon: const Icon(Icons.calendar_today),
          ),
          onTap: () async {
            final now = DateTime.now();
            final selected = await showDatePicker(
              context: context,
              firstDate: DateTime(1900),
              lastDate: now,
              initialDate:
                  DateTime.tryParse(birthday.text) ?? DateTime(now.year - 20),
            );
            if (selected != null) {
              birthday.text = DateFormat('yyyy-MM-dd').format(selected);
            }
          },
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: () async {
            final chosen = await ImagePicker().pickImage(
              source: ImageSource.gallery,
              imageQuality: 85,
            );
            if (chosen != null) setState(() => photo = chosen);
          },
          icon: const Icon(Icons.photo_camera),
          label: Text(
            photo?.name ??
                tr(context, 'Pilih gambar profil', 'Choose profile photo'),
          ),
        ),
        const SizedBox(height: 20),
        FilledButton(
          onPressed: saving
              ? null
              : () async {
                  setState(() => saving = true);
                  try {
                    await widget.api.updateProfile(
                      name: name.text,
                      phone: phone.text,
                      email: email.text,
                      birthDate: birthday.text,
                      photo: photo,
                    );
                    await widget.submit(() async {});
                    if (context.mounted) Navigator.pop(context);
                  } catch (error) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            translatedError(context, error.toString()),
                          ),
                        ),
                      );
                    }
                  } finally {
                    if (mounted) setState(() => saving = false);
                  }
                },
          child: Text(tr(context, 'Simpan perubahan', 'Save changes')),
        ),
      ],
    ),
  );
}
