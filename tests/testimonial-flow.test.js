const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("pwa/app.js", "utf8");
const context = vm.createContext({
  esc: (value) => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
  formatDate: (value) => value,
});
vm.runInContext(source.slice(source.indexOf("function testimonialView("), source.indexOf("function insightView(")), context);
const project = { id: "project-1", status: "Active", milestones: [], testimonials: [] };
test("feedback opens after a completed milestone, but not before", () => {
  assert.equal(context.testimonialView(project), "");
  assert.match(context.testimonialView({ ...project, milestones: [{ status: "complete" }] }), /SEND FEEDBACK/);
  assert.match(context.testimonialView({ ...project, status: "Complete" }), /SEND FEEDBACK/);
});
test("saved feedback replaces the prompt and escapes client content", () => {
  const saved = { ...project, testimonials: [{ rating: 5, quote: "<script>alert(1)</script>", created_at: "2026-09-12", display_name: "Client" }] };
  const html = context.testimonialView(saved);
  assert.match(html, /Thank you for sharing/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<form|<script>/);
  assert.match(context.testimonialView(saved, true), /Words from your clients/);
});
test("successful submission survives currentTarget clearing after await", async () => {
  const button = { disabled: false };
  const form = { querySelector: () => button, innerHTML: "" };
  const event = { preventDefault() {}, currentTarget: form };
  const messages = [];
  const submission = vm.createContext({
    FormData: class { *[Symbol.iterator]() { yield ["quote", "Wonderful"]; } },
    live: async () => { event.currentTarget = null; return {}; },
    toast: (message) => messages.push(message),
  });
  vm.runInContext(source.slice(source.indexOf("async function submitTestimonial("), source.indexOf("const money =")), submission);
  await submission.submitTestimonial(event, "project-1");
  assert.match(form.innerHTML, /Thank you/);
  assert.deepEqual(messages, ["Thank you — received."]);
});
test("failed submission preserves the form and allows retry", async () => {
  const button = { disabled: false };
  const form = { querySelector: () => button, innerHTML: "original" };
  const submission = vm.createContext({
    FormData: class { *[Symbol.iterator]() { yield ["quote", "Wonderful"]; } },
    live: async () => { throw new Error("Offline"); }, toast() {},
  });
  vm.runInContext(source.slice(source.indexOf("async function submitTestimonial("), source.indexOf("const money =")), submission);
  await submission.submitTestimonial({ preventDefault() {}, currentTarget: form }, "project-1");
  assert.equal(form.innerHTML, "original");
  assert.equal(button.disabled, false);
});
