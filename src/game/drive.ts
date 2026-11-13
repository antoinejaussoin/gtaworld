import { clamp } from "../world/geometry";

const WHEELBASE = 2.7;

export function stepDrive(
  speed: number,
  heading: number,
  dt: number,
  control: { throttle: boolean; brake: boolean; steer: number; handbrake: boolean; cap: number },
): { speed: number; heading: number } {
  let v = speed;
  const steerScale = control.handbrake ? 0.72 : 0.48;
  const steerAngle = (control.steer * steerScale) / (1 + Math.abs(v) * 0.04);
  if (Math.abs(v) > 0.2) {
    const yaw = (v / WHEELBASE) * Math.tan(steerAngle);
    heading += clamp(yaw, -2.4, 2.4) * dt;
  }

  const cap = Math.max(2, control.cap);
  if (v > cap) {
    v = Math.max(cap, v - 20 * dt);
  } else if (control.brake && !control.throttle) {
    if (v > 0.3) v -= 18 * dt;
    else v -= 8 * dt;
  } else if (control.throttle) {
    v = Math.min(cap, v + 12 * dt);
  } else {
    const drag = 2.4 * dt;
    if (Math.abs(v) <= drag) v = 0;
    else v -= Math.sign(v) * drag;
  }

  if (control.handbrake) {
    const drag = 16 * dt;
    if (v > 0) v = Math.max(0, v - drag);
    else v = Math.min(0, v + drag);
  }
  if (v < -6) v = -6;
  return { speed: v, heading };
}
