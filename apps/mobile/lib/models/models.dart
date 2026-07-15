// Plain DTOs parsed from API JSON. Money fields are strings (API serialises BigInt).

/// API count/money fields arrive as num OR as BigInt-serialised strings —
/// never cast them with `as num`; that crashed the live creator dashboard
/// (staging, 2026-07-14) when real earnings came back as "620".
int asInt(dynamic v, [int fallback = 0]) =>
    v is num ? v.toInt() : int.tryParse('$v') ?? fallback;

int? asIntOrNull(dynamic v) =>
    v == null ? null : (v is num ? v.toInt() : int.tryParse('$v'));

num asNumOr(dynamic v, [num fallback = 0]) =>
    v is num ? v : num.tryParse('$v') ?? fallback;


class LiveRoom {
  const LiveRoom({
    required this.id,
    required this.title,
    required this.category,
    required this.country,
    required this.language,
    required this.status,
    this.hostName,
    this.hostId,
    this.hostAvatarUrl,
    this.coverImageUrl,
    this.viewerCount = 0,
  });

  final String id;
  final String title;
  final String category;
  final String country;
  final String language;
  final String status;
  final String? hostName;
  final String? hostId;
  final String? hostAvatarUrl;
  final String? coverImageUrl;
  final int viewerCount;

  factory LiveRoom.fromJson(Map<String, dynamic> json) {
    final host = json['host'] as Map<String, dynamic>?;
    final profile = host?['profile'] as Map<String, dynamic>?;
    final creator = host?['creatorProfile'] as Map<String, dynamic>?;
    return LiveRoom(
      id: json['id'] as String,
      title: json['title'] as String? ?? 'Untitled',
      category: json['category'] as String? ?? '',
      country: json['country'] as String? ?? '',
      language: json['language'] as String? ?? '',
      status: json['status'] as String? ?? 'ENDED',
      hostName: creator?['stageName'] as String? ??
          profile?['displayName'] as String?,
      hostId: (host?['id'] as String?) ?? (json['hostUserId'] as String?),
      hostAvatarUrl: profile?['avatarUrl'] as String?,
      coverImageUrl:
          json['coverImageUrl'] as String? ?? json['thumbnailUrl'] as String?,
      viewerCount: asInt(json['viewerCount']),
    );
  }
}

class Gift {
  const Gift({required this.id, required this.name, required this.coinPrice});

  final String id;
  final String name;
  final int coinPrice;

  factory Gift.fromJson(Map<String, dynamic> json) => Gift(
        id: json['id'] as String,
        name: json['name'] as String? ?? 'Gift',
        coinPrice: asInt(json['coinPrice']),
      );
}

class Wallet {
  const Wallet({
    required this.coinBalance,
    required this.earningBalance,
    required this.payoutHoldBalance,
  });

  final int coinBalance;
  final int earningBalance;
  final int payoutHoldBalance;

  static int _parse(dynamic v) => int.tryParse('${v ?? 0}') ?? 0;

  factory Wallet.fromJson(Map<String, dynamic> json) => Wallet(
        coinBalance: _parse(json['coinBalance']),
        earningBalance: _parse(json['earningBalance']),
        payoutHoldBalance: _parse(json['payoutHoldBalance']),
      );

  static const empty =
      Wallet(coinBalance: 0, earningBalance: 0, payoutHoldBalance: 0);
}

class ChatMessage {
  const ChatMessage({required this.sender, required this.text, this.senderId});
  final String sender;
  final String text;
  final String? senderId;
}
