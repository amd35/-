/**
 * مواضع النقاط على شبكة 3×3 — تُستخدم للنرد ولنصف قطعة الدومينو،
 * فتظهر النقاط في مواضعها الصحيحة كما في القطع الحقيقية.
 */
export const PIP_POSITIONS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
}

/** تسعة خانات لكل وجه/نصف، مفعّلة أو فارغة. */
export function pipsFor(value) {
  const spots = PIP_POSITIONS[Number(value)] || []
  return Array.from({ length: 9 }, (_, index) => spots.includes(index))
}
