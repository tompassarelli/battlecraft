export function circlesOverlap(ax: number, ay: number, aRadius: number, bx: number, by: number, bRadius: number): boolean {
  const reach = aRadius + bRadius;
  const dx = ax - bx;
  const dy = ay - by;
  // Lua's 32-bit integers wrap: rule out far pairs before squaring.
  if (dx > reach || dx < -reach || dy > reach || dy < -reach) return false;
  return dx * dx + dy * dy <= reach * reach;
}
