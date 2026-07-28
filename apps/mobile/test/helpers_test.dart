import 'package:afristage_mobile/screens/payout_methods_screen.dart';
import 'package:afristage_mobile/models/models.dart';
import 'package:afristage_mobile/widgets/afri_live.dart';
import 'package:afristage_mobile/widgets/afri_ui.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Gift reads configured artwork from the API animation URL', () {
    final gift = Gift.fromJson({
      'id': 'rose',
      'name': 'Rose',
      'coinPrice': 10,
      'animationUrl': 'https://cdn.example/rose.webp',
    });
    expect(gift.artworkUrl, 'https://cdn.example/rose.webp');
  });

  group('payoutMethodError', () {
    test('flags the first missing field in order', () {
      expect(
          payoutMethodError(
              label: '', reference: '123', country: 'NG', currency: 'NGN'),
          'Enter a label for this method.');
      expect(
          payoutMethodError(
              label: 'GT', reference: '', country: 'NG', currency: 'NGN'),
          'Enter the account or mobile money number.');
      expect(
          payoutMethodError(
              label: 'GT', reference: '123', country: '', currency: 'NGN'),
          'Country and currency are required.');
      expect(
          payoutMethodError(
              label: 'GT', reference: '123', country: 'NG', currency: ''),
          'Country and currency are required.');
    });
    test('returns null when every field is present', () {
      expect(
          payoutMethodError(
              label: 'GT', reference: '123', country: 'NG', currency: 'NGN'),
          isNull);
    });
  });

  group('usd', () {
    test('formats whole and fractional coin counts as 2dp dollars', () {
      expect(usd(0), r'$0.00');
      expect(usd(620), r'$6.20'); // 1 coin = $0.01 → 620 coins = $6.20
      expect(usd(123450), r'$1,234.50'); // grouping + 2dp
    });
    test('keeps the sign for negatives', () {
      expect(usd(-500), r'$-5.00');
    });
  });

  group('formatCount', () {
    test('passes through below 1000', () {
      expect(formatCount(0), '0');
      expect(formatCount(999), '999');
    });
    test('uses K from 1000 and M from a million (1 decimal)', () {
      expect(formatCount(1000), '1.0K');
      expect(formatCount(1500), '1.5K');
      expect(formatCount(12000), '12.0K');
      expect(formatCount(1000000), '1.0M');
      expect(formatCount(2500000), '2.5M');
    });
    test('boundaries: 999 stays plain, 1000 becomes K', () {
      expect(formatCount(999), '999');
      expect(formatCount(1000), '1.0K');
    });
  });

  group('afriCompactCount', () {
    test('drops the decimal once the unit value reaches 10', () {
      expect(afriCompactCount(999), '999');
      expect(afriCompactCount(1000), '1.0K');
      expect(afriCompactCount(1500), '1.5K');
      expect(afriCompactCount(12000), '12K');
      expect(afriCompactCount(1000000), '1.0M');
      expect(afriCompactCount(15000000), '15M');
    });
  });

  group('countryFlag', () {
    test('maps a valid ISO-2 code to the regional-indicator emoji', () {
      expect(countryFlag('NG'), '\u{1F1F3}\u{1F1EC}');
      expect(countryFlag('ng'), countryFlag('NG')); // case-insensitive
    });
    test('returns empty for null, wrong length, or non-letters', () {
      expect(countryFlag(null), '');
      expect(countryFlag(''), '');
      expect(countryFlag('N'), '');
      expect(countryFlag('NGA'), '');
      expect(countryFlag('N1'), '');
    });
  });

  group('categoryGradient', () {
    test('returns exactly two colors for known + unknown categories', () {
      for (final c in ['MUSIC', 'COMEDY', 'DANCE', 'FOOTBALL', 'WHATEVER']) {
        expect(categoryGradient(c), hasLength(2));
      }
    });
    test('is case-insensitive and maps MUSIC to its purple→pink pair', () {
      expect(categoryGradient('music'), categoryGradient('MUSIC'));
      expect(categoryGradient('MUSIC').first, const Color(0xFF7C3AED));
    });
    test('falls back to the default gradient for unknown categories', () {
      expect(categoryGradient('NOPE'), const [
        Color(0xFF7C3AED),
        Color(0xFFFF8A1F),
      ]);
    });
  });

  group('afriGiftIcon', () {
    test('maps every catalogue name to a bundled icon', () {
      const expected = <String, IconData>{
        'Rose': CupertinoIcons.heart_circle_fill,
        'flower crown': CupertinoIcons.heart_circle_fill,
        'Fire': CupertinoIcons.flame_fill,
        'flame': CupertinoIcons.flame_fill,
        'Golden Mic': CupertinoIcons.mic_fill,
        'Drum': CupertinoIcons.music_albums_fill,
        'Crown': CupertinoIcons.star_circle_fill,
        'king': CupertinoIcons.star_circle_fill,
        'royal': CupertinoIcons.star_circle_fill,
        'Spotlight': CupertinoIcons.lightbulb_fill,
        'light': CupertinoIcons.lightbulb_fill,
        'Star': CupertinoIcons.star_fill,
        'Stage': CupertinoIcons.music_mic,
        'concert': CupertinoIcons.music_mic,
        'heart': CupertinoIcons.heart_fill,
        'love': CupertinoIcons.heart_fill,
        'diamond': CupertinoIcons.sparkles,
        'gem': CupertinoIcons.sparkles,
        'rocket': CupertinoIcons.rocket_fill,
        'trophy': CupertinoIcons.sportscourt_fill,
        'music': CupertinoIcons.music_note_2,
        'whatever': CupertinoIcons.gift_fill,
      };
      expected.forEach((name, icon) {
        expect(afriGiftIcon(name), icon, reason: name);
      });
    });

    test('is case-insensitive and falls back to the gift icon', () {
      expect(afriGiftIcon('ROSE'), afriGiftIcon('rose'));
      expect(afriGiftIcon(''), CupertinoIcons.gift_fill);
    });
  });
}
