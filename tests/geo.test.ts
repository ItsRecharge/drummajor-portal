import { test } from "node:test";
import assert from "node:assert/strict";
import { haversineM } from "../src/lib/geo.ts";

const close = (actual: number, expected: number, tol: number) =>
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${actual} within ${tol} of ${expected}`);

test("haversineM: same point is 0 m", () => {
  assert.equal(haversineM({ lat: 42.45, lng: -71.14 }, { lat: 42.45, lng: -71.14 }), 0);
});

test("haversineM: 0.001° of latitude is about 111 m anywhere", () => {
  close(haversineM({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 }), 111.19, 0.1);
  close(haversineM({ lat: 42.45, lng: -71.14 }, { lat: 42.451, lng: -71.14 }), 111.19, 0.1);
});

test("haversineM: symmetric", () => {
  const a = { lat: 42.45, lng: -71.14 };
  const b = { lat: 42.46, lng: -71.15 };
  assert.equal(haversineM(a, b), haversineM(b, a));
});

test("haversineM: crossing the antimeridian is a short hop, not a trip around the world", () => {
  close(haversineM({ lat: 0, lng: 179.9995 }, { lat: 0, lng: -179.9995 }), 111.19, 0.1);
});

test("haversineM: antipodes are about half the circumference", () => {
  close(haversineM({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }), 20_015_000, 1000);
});
