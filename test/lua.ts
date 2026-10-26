import { runTests } from "wisp/src/runtime/testing";
import "../src/sim/hit.tests";
import "../src/inputCodec.tests";
import "../src/rollback.tests";

if (runTests(print) > 0) os.exit(1);
