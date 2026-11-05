import 'package:flutter/material.dart';

import '../theme.dart';

/// A die face: the skin's photo when the bought item carries one, otherwise the
/// skin's own colours with the pips drawn on top.
class DieFace extends StatelessWidget {
  const DieFace({
    super.key,
    this.value = 6,
    this.imageUrl = '',
    this.color = AppColors.gold,
    this.pipColor = const Color(0xFF1A1224),
    this.size = 44,
  });

  final int value;
  final String imageUrl;
  final Color color;
  final Color pipColor;
  final double size;

  /// Which of the nine cells carry a pip, per dice value.
  static const _pips = <int, List<int>>{
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8],
  };

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(size * 0.22);
    if (imageUrl.isEmpty) return _face(radius);
    return ClipRRect(
      borderRadius: radius,
      child: Image.network(
        imageUrl,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _face(radius),
      ),
    );
  }

  Widget _face(BorderRadius radius) {
    final marked = _pips[value] ?? const <int>[];
    return Container(
      width: size,
      height: size,
      padding: EdgeInsets.all(size * 0.13),
      decoration: BoxDecoration(
        borderRadius: radius,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [color, Color.lerp(color, Colors.black, 0.35) ?? color],
        ),
        border: Border.all(color: const Color(0x33FFFFFF)),
      ),
      child: Column(
        children: [
          for (var row = 0; row < 3; row++)
            Expanded(
              child: Row(
                children: [
                  for (var column = 0; column < 3; column++)
                    Expanded(
                      child: Center(
                        child: marked.contains(row * 3 + column)
                            ? Container(
                                width: size * 0.16,
                                height: size * 0.16,
                                decoration: BoxDecoration(color: pipColor, shape: BoxShape.circle),
                              )
                            : const SizedBox.shrink(),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// ``#rrggbb`` coming from the API, with a fallback when it is missing.
Color colorFromHex(String value, Color fallback) {
  final text = value.startsWith('#') ? value.substring(1) : value;
  if (text.length != 6) return fallback;
  final parsed = int.tryParse(text, radix: 16);
  return parsed == null ? fallback : Color(0xFF000000 | parsed);
}
