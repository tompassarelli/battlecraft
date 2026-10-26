import { assertEquals, test } from "wisp/src/runtime/testing";
import { circlesOverlap } from "./hit";

test("hit: a projectile hits a circle it touches at the boundary and misses one a unit further", () => {
  assertEquals(circlesOverlap(0, 0, 10, 30, 0, 20), true, "touching along x");
  assertEquals(circlesOverlap(0, 0, 10, 31, 0, 20), false, "one unit apart along x");
  assertEquals(circlesOverlap(0, 0, 10, 0, -30, 20), true, "touching along -y");
  assertEquals(circlesOverlap(0, 0, 10, 0, -31, 20), false, "one unit apart along -y");
  assertEquals(circlesOverlap(100, 100, 25, 130, 140, 25), true, "touching on a 30-40-50 diagonal");
  assertEquals(circlesOverlap(100, 100, 25, 130, 141, 25), false, "past the diagonal in y");
  assertEquals(circlesOverlap(100, 100, 25, 69, 60, 25), false, "past the diagonal in -x");
  assertEquals(circlesOverlap(0, 0, 384, 633, 634, 512), true, "an arrow just inside a ranger's reach");
  assertEquals(circlesOverlap(0, 0, 384, 634, 634, 512), false, "an arrow just outside a ranger's reach");
  assertEquals(circlesOverlap(5, 5, 384, 5, 5, 640), true, "concentric");
  assertEquals(circlesOverlap(-16384, -12288, 384, 16384, 12288, 640), false, "opposite corners");
  assertEquals(circlesOverlap(-30000, 0, 20000, 30000, 0, 20000), false, "huge radii, 60000 apart");
  assertEquals(circlesOverlap(-20000, 0, 20000, 20000, 0, 20000), true, "huge radii, touching");
});
