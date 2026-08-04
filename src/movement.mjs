export function facingYawForDirection(dx, dz) {
  if (Math.hypot(dx, dz) < 0.0001) return 0;
  const yaw = Math.atan2(-dx, -dz);
  return Object.is(yaw, -0) ? 0 : yaw;
}
