import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";

// No Firebase credentials or production connections: replace the repository
// before loading the code under test.
const documents = new Map<string, any>();
const snapshot = (path: string) => ({
  id: path.split("/").slice(-1)[0], exists: documents.has(path),
  data: () => documents.get(path), ref: reference(path),
});
function reference(path: string): any {
  return {
    id: path.split("/").slice(-1)[0], path,
    parent: { parent: path.startsWith("organizations/") && path.split("/").length > 2 ? reference(path.split("/").slice(0, 2).join("/")) : null },
    collection: (name: string) => collection(`${path}/${name}`),
    get: async () => snapshot(path),
    set: async (value: any) => { documents.set(path, value); },
  };
}
let generatedId = 0;
function collection(path: string, filters: Array<[string, string, any]> = []): any {
  return {
    path,
    doc: (id?: string) => reference(`${path}/${id || `generated-${++generatedId}`}`),
    where: (field: string, operator: string, value: any) => collection(path, [...filters, [field, operator, value]]),
    limit: () => collection(path, filters),
    orderBy: () => collection(path, filters),
    get: async () => {
      const docs = [...documents.keys()].filter(key => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1)
        .filter(key => filters.every(([field, , value]) => documents.get(key)[field] === value)).map(snapshot);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
    add: async (data: any) => { const ref = reference(`${path}/log-${++generatedId}`); documents.set(ref.path, data); return ref; },
  };
}
let transactionQueue: Promise<unknown> = Promise.resolve();
const fakeDb = {
  collection,
  getAll: async (...refs: any[]) => Promise.all(refs.map(ref => ref.get())),
  runTransaction: (work: (transaction: any) => Promise<any>) => {
    const run = transactionQueue.then(async () => {
      const writes: Array<() => void> = [];
      const result = await work({
        get: (ref: any) => ref.get(),
        create: (ref: any, data: any) => { if (documents.has(ref.path)) throw new Error("already exists"); writes.push(() => documents.set(ref.path, data)); },
        set: (ref: any, data: any) => writes.push(() => documents.set(ref.path, data)),
        update: (ref: any, data: any) => writes.push(() => documents.set(ref.path, { ...documents.get(ref.path), ...data })),
      });
      writes.forEach(write => write()); return result;
    });
    transactionQueue = run.catch(() => undefined); return run;
  },
};
require.cache[require.resolve("../repositories/firebaseService")] = {
  exports: { db: fakeDb, admin: { firestore: { Timestamp: { fromDate: (date: Date) => date } } } },
} as any;
const { OrganizationService } = require("../services/organizationService");
const { requireOrganizationMembership } = require("../middlewares/requireOrganizationMembership");
const { MusicService } = require("../services/musicService");
const { auditMiddleware } = require("../middlewares/auditMiddleware");

function seed() {
  documents.clear();
  documents.set("users/owner", { name: "Owner", email: "owner@example.test", status: "enabled" });
  documents.set("users/person", { name: "Person", email: "person@example.test", status: "enabled" });
  documents.set("organizations/a", { name: "A", slug: "group-a", status: "active" });
  documents.set("organizationSlugs/group-a", { organizationId: "a" });
  documents.set("organizations/b", { name: "B", slug: "group-b", status: "active" });
  documents.set("organizations/a/members/owner", { userId: "owner", status: "enabled", managementRole: "owner", musicalRoles: [] });
}
const response = () => ({ code: 200, body: null as any, status(code: number) { this.code = code; return this; }, json(body: any) { this.body = body; return this; } });

test("membership uses roles of the requested organization and denies other organizations", async () => {
  seed(); const req: any = { user: { userId: "owner", role: ["admin"] }, params: { organizationId: "b" } };
  const res = response(); let called = false;
  await requireOrganizationMembership(req, res, () => { called = true; });
  assert.equal(res.code, 403); assert.equal(called, false);
  req.params.organizationId = "a";
  documents.set("organizations/a/members/owner", { status: "enabled", managementRole: "member", musicalRoles: ["vocal"] });
  await requireOrganizationMembership(req, response(), () => { called = true; });
  assert.deepEqual(req.user.roles, ["vocal"]); assert.equal(req.organizationId, "a");
});

test("music reads are isolated even with identical IDs", async () => {
  seed();
  documents.set("organizations/a/musicLinks/same", { name: "Music A", order: 1 });
  documents.set("organizations/b/musicLinks/same", { name: "Music B", order: 1 });
  const music = await new MusicService("a").fetchMusicLinks();
  assert.deepEqual(music.map((item: any) => item.name), ["Music A"]);
});

test("invitation is email-bound, hashed, single-use and idempotent", async () => {
  seed(); const service = new OrganizationService();
  const result = await service.createInvitation("a", "owner", { email: " PERSON@EXAMPLE.TEST ", musicalRoles: ["vocal"], expiresAt: new Date(Date.now() + 86400000).toISOString() });
  const stored = documents.get(`organizations/a/invitations/${result.invitation.id}`);
  assert.notEqual(stored.tokenHash, result.token); assert.equal(stored.token, undefined);
  await assert.rejects(service.acceptInvitation("group-a", result.token, "owner"), /outro e-mail/);
  const accepted = await service.acceptInvitation("group-a", result.token, "person");
  assert.equal(accepted.membership.managementRole, "member");
  assert.deepEqual(accepted.membership.musicalRoles, ["vocal"]);
  assert.equal((await service.acceptInvitation("group-a", result.token, "person")).alreadyAccepted, true);
});

test("leaders cannot grant admin; revoked and expired invites cannot be used", async () => {
  seed(); const service = new OrganizationService();
  documents.set("organizations/a/members/owner", { userId: "owner", status: "enabled", managementRole: "leader", musicalRoles: [] });
  const dto = { email: "person@example.test", expiresAt: new Date(Date.now() + 86400000).toISOString() };
  await assert.rejects(service.createInvitation("a", "owner", { ...dto, managementRole: "organization_admin" }), /membros/);
  const invite = await service.createInvitation("a", "owner", dto);
  await service.revokeInvitation("a", invite.invitation.id, "owner");
  await assert.rejects(service.acceptInvitation("group-a", invite.token, "person"), /disponível/);
  const next = await service.createInvitation("a", "owner", dto);
  documents.get(`organizations/a/invitations/${next.invitation.id}`).expiresAt = new Date(0).toISOString();
  await assert.rejects(service.acceptInvitation("group-a", next.token, "person"), /expirado/);
});

test("concurrent invitations for the same email create only one pending invitation", async () => {
  seed(); const service = new OrganizationService();
  const dto = { email: "person@example.test", expiresAt: new Date(Date.now() + 86400000).toISOString() };
  const results = await Promise.allSettled([service.createInvitation("a", "owner", dto), service.createInvitation("a", "owner", dto)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
});

test("audit removes credentials and invitation secrets", async () => {
  seed(); const req: any = { method: "POST", originalUrl: "/invitations/group-a/secret-link/accept", body: { password: "secret-password", idToken: "google-secret" }, query: {}, get: () => null };
  const res: any = new EventEmitter(); res.statusCode = 200; res.json = () => undefined; res.send = () => undefined;
  auditMiddleware(req, res, () => undefined);
  res.json({ token: "jwt-secret", firebaseCustomToken: "firebase-secret", invitationPath: "/invite/group-a/secret-link" });
  res.emit("finish"); await Promise.resolve();
  const serialized = JSON.stringify([...documents.values()]);
  for (const secret of ["secret-password", "google-secret", "jwt-secret", "firebase-secret", "secret-link"]) assert.equal(serialized.includes(secret), false);
});

test("HTTP routes preserve tenant context and reject cross-organization reads", async () => {
  seed();
  documents.set("organizations/a/musicLinks/song", { name: "Only A", order: 1 });
  documents.set("organizations/b/musicLinks/song", { name: "Only B", order: 1 });
  process.env.JWT_SECRET = "local-test-only-secret";
  const token = jwt.sign({ userId: "owner" }, process.env.JWT_SECRET);
  const app = express(); app.use(express.json());
  app.use("/organizations", require("../routes/organizationRoutes").default);
  app.use("/organizations/:organizationId", require("../routes/organizationDataRoutes").default);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}`;
  try {
    const allowed = await fetch(`${url}/organizations/a/musicList`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(allowed.status, 200); assert.equal((await allowed.json())[0].name, "Only A");
    const denied = await fetch(`${url}/organizations/b/musicList`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(denied.status, 403);
    const anonymous = await fetch(`${url}/organizations/a/musicList`);
    assert.equal(anonymous.status, 401);
    const members = await fetch(`${url}/organizations/a/users`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(members.status, 200); assert.deepEqual((await members.json()).map((user: any) => user.id), ["owner"]);
    const otherOrganizationWrite = await fetch(`${url}/organizations/b/musicList/song`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    assert.equal(otherOrganizationWrite.status, 403);
    const demoteOwner = await fetch(`${url}/organizations/a/users/owner`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ managementRole: "member" }) });
    assert.equal(demoteOwner.status, 409);
    documents.get("users/owner").status = "disabled";
    const disabled = await fetch(`${url}/organizations/a/musicList`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(disabled.status, 403);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
