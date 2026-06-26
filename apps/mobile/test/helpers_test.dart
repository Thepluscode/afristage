import 'package:afristage_mobile/widgets/afri_live.dart';
import 'package:afristage_mobile/widgets/afri_ui.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {

  group('usd', () {
    test('formats whole and fractional coin counts as 2dp dollars', () {
      expect(usd(0), r'$0.00');
      expect(usd(620), r'$620.00');
      expect(usd(1234.5), r'$1234.50');
    });
    test('keeps the sign for negatives', () {
      expect(usd(-5), r'$-5.00');
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
}
